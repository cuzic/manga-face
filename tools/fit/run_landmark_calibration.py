"""Score independent vision-adapter readings against synthetic D4 fixtures."""
import argparse
import hashlib
from io import BytesIO
import json
from pathlib import Path
import subprocess

from PIL import Image

import landmark_calibration as calibration
import landmark_inference as runner

def checked_fixtures(fixtures, model):
    inputs = []
    for name in ("neutral", "translated", "scaled-occluded"):
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
            request = runner.make_request(image.convert("RGB"), runner.DEFINITIONS, model)
        if request["size"] != truth["size"]:
            raise ValueError(f"fixture raster dimensions changed: {name}")
        inputs.append((name, truth, raster, request))
    return inputs


def evaluate(fixtures, model, adapter, checkpoint):
    inputs = checked_fixtures(fixtures, model)
    checkpoint.mkdir(mode=0o700, exist_ok=True)
    scores = []
    seen = set()
    for name, truth, raster, request in inputs:
        for repeat in (1, 2):
            identity = {
                "fixture": name, "pass": repeat, "model_version": model,
                **raster,
                "prompt_sha256": hashlib.sha256(request["prompt"].encode()).hexdigest(),
            }
            saved = checkpoint / f"{name}-{repeat}.json"
            if saved.exists():
                entry = json.loads(saved.read_text())
                if any(entry["identity"].get(key) != value for key, value in identity.items()):
                    raise ValueError(f"checkpoint differs from the requested run: {saved.name}")
                response = entry["response"]
            else:
                process = subprocess.run(adapter, input=json.dumps(request), check=True,
                                         text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)
                response = json.loads(process.stdout)
            response_id, points, missing = runner.check_response(
                response, runner.DEFINITIONS.keys(), request["size"], model)
            if response_id in seen:
                raise ValueError("adapter reused an inference ID")
            seen.add(response_id)
            if not saved.exists():
                temporary = saved.with_suffix(".pending")
                with temporary.open("x") as out:
                    json.dump({"identity": identity, "response": response}, out, indent=2)
                    out.write("\n")
                temporary.rename(saved)
            prediction = {"points": points, "missing": missing,
                          "image_sha256": truth["image_sha256"], "size": request["size"]}
            scores.append({
                **identity, "inference_id": response_id, "prediction": prediction,
                "metrics": calibration.score(truth, prediction),
            })
    return {"model_version": model, "readings": scores}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixtures", required=True, type=Path)
    parser.add_argument("--model", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--adapter", required=True, nargs=argparse.REMAINDER)
    args = parser.parse_args()
    try:
        if not args.adapter or args.output.exists():
            raise ValueError("provide an adapter command and a new output path")
        result = evaluate(args.fixtures, args.model, args.adapter, args.output.with_suffix(".checkpoint"))
        with args.output.open("x") as destination:
            json.dump(result, destination, indent=2, allow_nan=False)
            destination.write("\n")
    except (OSError, KeyError, TypeError, ValueError, subprocess.SubprocessError) as error:
        parser.exit(2, f"{error}\n")
