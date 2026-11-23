"""Score independent vision-adapter readings against synthetic D4 fixtures."""
import argparse
from contextlib import contextmanager
import fcntl
import hashlib
from io import BytesIO
import json
from pathlib import Path
import subprocess

from PIL import Image

import landmark_calibration as calibration
import landmark_inference as runner
from vision_checkpoint import decode, read_or_attempt, write_record

@contextmanager
def calibration_lock(output):
    lock_path = output.with_suffix(".lock")
    with lock_path.open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise ValueError("calibration is already running for this output") from error
        yield


def checked_fixtures(fixtures, model, cases):
    inputs = []
    for name in cases:
        svg = fixtures / f"{name}.svg"
        truth = json.loads(svg.with_suffix(".truth.json").read_text())
        png = svg.with_suffix(".png").read_bytes()
        raster = {
            "svg_sha256": hashlib.sha256(svg.read_bytes()).hexdigest(),
            "png_sha256": hashlib.sha256(png).hexdigest(),
        }
        if raster["svg_sha256"] != truth["image_sha256"]:
            raise ValueError(f"fixture SVG changed: {name}")
        binding = json.loads(svg.with_suffix(".raster.json").read_text())
        if binding != raster:
            raise ValueError(f"fixture raster changed: {name}; render the fixtures again")
        with Image.open(BytesIO(png)) as image:
            definitions = runner.definitions_for("neutral" if len(calibration.case_names(name)) == 19 else "expression")
            request = runner.make_request(image.convert("RGB"), definitions, model)
        if request["size"] != truth["size"]:
            raise ValueError(f"fixture raster dimensions changed: {name}")
        inputs.append((name, truth, raster, request, definitions))
    return inputs


def summarize_usage(readings):
    fields = ("input_tokens", "cached_input_tokens", "output_tokens")
    totals = {}
    for field in fields:
        values = [(reading.get("usage") or {}).get(field) for reading in readings]
        reported = [value for value in values if type(value) is int and value >= 0]
        totals[field] = {"total_reported": sum(reported), "readings_reported": len(reported)}
    return totals


def evaluate(fixtures, model, adapter, checkpoint, cases=calibration.BASE_CASES):
    inputs = checked_fixtures(fixtures, model, cases)
    checkpoint.mkdir(mode=0o700, exist_ok=True)
    scores = []
    seen = set()
    for name, truth, raster, request, definitions in inputs:
        for repeat in (1, 2):
            identity = {
                "fixture": name, "pass": repeat, "model_version": model, "size": request["size"],
                **raster,
                "prompt_sha256": hashlib.sha256(request["prompt"].encode()).hexdigest(),
            }
            entry = read_or_attempt(checkpoint, f"{name}-{repeat}", identity, request, adapter)
            response = {}
            error = None
            response_id = None
            try:
                response = json.loads(entry["stdout"]) if entry["exit_code"] == 0 else {}
                response_id, points, missing = runner.check_response(
                    decode(entry), definitions.keys(), request["size"], model)
                if response_id in seen:
                    raise ValueError("adapter reused an inference ID")
                seen.add(response_id)
            except (KeyError, TypeError, ValueError):
                error = "adapter response failed validation"
                points, missing = {}, dict.fromkeys(definitions, error)
            prediction = {"points": points, "missing": missing,
                          "image_sha256": truth["image_sha256"], "size": request["size"]}
            scores.append({
                **identity, "inference_id": response_id, "prediction": prediction,
                "metrics": calibration.score(truth, prediction),
                "usage": response.get("usage"), "error": error,
                "sent_request_sha256": response.get("sent_request_sha256"),
                "sent_configuration_sha256": response.get("sent_configuration_sha256"),
            })
    return {
        "model_version": model, "readings": scores,
        "usage_summary": summarize_usage(scores),
        "invalid_responses": sum(reading["error"] is not None for reading in scores),
        "landmark_summary": calibration.summarize([reading["metrics"] for reading in scores]),
    }


def run_report(fixtures, model, adapter, output, cases, resume_invalid=False):
    with calibration_lock(output):
        if output.exists():
            old = output.read_bytes()
            prior = json.loads(old)
            if not resume_invalid or not prior.get("invalid_responses"):
                raise ValueError("provide a new output path or explicitly resume an invalid report")
            previous_cases = [reading["fixture"] for reading in prior["readings"] if reading["pass"] == 1]
            if prior["model_version"] != model or previous_cases != list(cases):
                raise ValueError("resumed report uses a different model or fixture plan")
            archive = output.with_name(f"{output.stem}.superseded-{hashlib.sha256(old).hexdigest()}.json")
            if not archive.exists():
                archive.hardlink_to(output)
        result = evaluate(fixtures, model, adapter, output.with_suffix(".checkpoint"), cases)
        write_record(output, result)
        return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixtures", required=True, type=Path)
    parser.add_argument("--model", required=True)
    parser.add_argument("--expanded", action="store_true", help="also read expression and side-occlusion fixtures (twelve extra calls)")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--resume-invalid", action="store_true")
    parser.add_argument("--adapter", required=True, nargs=argparse.REMAINDER)
    args = parser.parse_args()
    try:
        if not args.adapter:
            raise ValueError("provide an adapter command")
        cases = calibration.BASE_CASES
        if args.expanded:
            sides = tuple(calibration.HAIR_CASES)
            cases += tuple(calibration.EXPRESSION_CASES) + sides + tuple("expression-" + side for side in sides)
        run_report(args.fixtures, args.model, args.adapter, args.output, cases, args.resume_invalid)
    except (OSError, KeyError, TypeError, ValueError, subprocess.SubprocessError) as error:
        parser.exit(2, f"{error}\n")
