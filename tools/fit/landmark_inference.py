"""Run ADR 0002 D4 extraction with an explicitly configured vision adapter.

The adapter receives one JSON request on stdin per fresh invocation. It returns
a JSON object with model_version, inference_id, points and missing. It should
send only the supplied prompt and image to the configured vision model.
"""
import argparse
import base64
import hashlib
from io import BytesIO
import json
from pathlib import Path
import subprocess
import tempfile

from PIL import Image

from generate import EXPRESSIONS
from vision_checkpoint import decode, read_or_attempt

DEFINITIONS = {
    "chin": "Lowest point of the face outline.",
    "cheekL": "Image-left face edge at eye line + 20% of the way to the chin.",
    "cheekR": "Image-right face edge at eye line + 20% of the way to the chin.",
    "earL": "Left ear's outer edge at the ear's centre height.",
    "earR": "Right ear's outer edge at the ear's centre height.",
    "noseTip": "Tip of the nose mark.",
    "browL": "Centre of the left brow stroke's bounding box.",
    "browR": "Centre of the right brow stroke's bounding box.",
    "mouthL": "Left mouth outline endpoint at the mouth's vertical centre.",
    "mouthR": "Right mouth outline endpoint at the mouth's vertical centre.",
    "mouthC": "Centre of the mouth outline's bounding box.",
}
for side, label in (("L", "image-left eye"), ("R", "image-right eye")):
    DEFINITIONS.update({
        f"eye{side}_outer": f"{label}: outer lid edge at eye centre height; exclude lash flick.",
        f"eye{side}_inner": f"{label}: inner lid edge at eye centre height.",
        f"eye{side}_top": f"{label}: highest point of the eye ink.",
        f"eye{side}_bottom": f"{label}: lowest point of the eye ink.",
    })
NEUTRAL_ONLY = {"chin", "cheekL", "cheekR", "earL", "earR", "noseTip"}


def definitions_for(expression):
    return {name: definition for name, definition in DEFINITIONS.items()
            if expression == "neutral" or name not in NEUTRAL_ONLY}


def make_request(image, definitions, model):
    prompt = ("Read the listed facial landmarks in source-cell integer pixel coordinates. "
              "The origin is top-left. Use image-left and image-right. Report hidden or "
              "ambiguous points as missing with a reason; never guess. Return points and missing objects.\n"
              + json.dumps(definitions, sort_keys=True))
    crop = BytesIO()
    image.save(crop, format="PNG")
    return {"model_version": model, "size": list(image.size), "prompt": prompt,
            "image_png_base64": base64.b64encode(crop.getvalue()).decode("ascii")}


def check_response(response, names, size, model):
    if response["model_version"] != model:
        raise ValueError("adapter returned an unexpected model version")
    inference_id = response["inference_id"]
    if not isinstance(inference_id, str) or not inference_id.strip():
        raise ValueError("adapter did not return an inference ID")
    points, missing = response["points"], response["missing"]
    if points.keys() & missing.keys() or points.keys() | missing.keys() != names:
        raise ValueError("response must mark each requested landmark exactly once")
    width, height = size
    for point in points.values():
        if (not isinstance(point, list) or len(point) != 2
                or any(type(coord) is not int for coord in point)
                or not (0 <= point[0] < width and 0 <= point[1] < height)):
            raise ValueError("adapter returned a coordinate outside the source cell")
    if any(not isinstance(reason, str) or not reason.strip() for reason in missing.values()):
        raise ValueError("every missing mark needs a reason")
    return inference_id, points, missing


def checked_cells(record, prepared):
    if (record["review"] != "accepted" or record["id"] != prepared["reference_id"]
            or record["kind"] != "ai-generated" or record["domain"] not in {"young", "mature"}
            or any(record[field] != prepared[field] for field in ("kind", "domain"))):
        raise ValueError("the prepared reference requires matching, accepted AI provenance")
    width, height = prepared["cell_size"]
    accepted = {}
    reviewed = {}
    for item in record["cells"]:
        position = item["position"]
        if (type(position) is not int or not 0 <= position < len(EXPRESSIONS[0])
                or position in reviewed
                or item["review"] not in {"accepted", "discarded"}):
            raise ValueError("invalid reviewed cell")
        reviewed[position] = item["expression"]
        if item["review"] == "accepted":
            accepted[position] = item["expression"]
    if not any(all(group[position] == expr for position, expr in reviewed.items()) for group in EXPRESSIONS):
        raise ValueError("reviewed cells do not match an R1 expression sheet")
    used = set()
    for cell in prepared["cells"]:
        position = cell["position"]
        if (type(position) is not int or position not in accepted or position in used
                or cell["expression"] != accepted[position]
                or cell["origin"] != [position % 2 * width, position // 2 * height]):
            raise ValueError("prepared cell differs from the accepted grid")
        used.add(position)
    if 0 not in accepted or used != accepted.keys():
        raise ValueError("prepared grid must include all accepted cells and an accepted neutral cell")
    return prepared["cells"]


def run(image_path, manifest_path, destination, model, adapter):
    prepared = json.loads(manifest_path.read_text())
    record_bytes = image_path.with_suffix(".provenance.json").read_bytes()
    image_bytes = image_path.read_bytes()
    if (hashlib.sha256(image_bytes).hexdigest() != prepared["image_sha256"]
            or hashlib.sha256(record_bytes).hexdigest() != prepared["record_sha256"]):
        raise ValueError("input image or provenance differs from the prepared manifest")
    record = json.loads(record_bytes)
    if record.get("sha256") != prepared["image_sha256"] or not str(record.get("reviewer") or "").strip():
        raise ValueError("the approved record must identify the source image and its reviewer")
    cells = checked_cells(record, prepared)
    width, height = prepared["cell_size"]
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    if image.size != (width * 2, height * 2):
        raise ValueError("image does not match the prepared grid")
    if destination.exists():
        raise ValueError("destination already exists")
    seen = set()
    with tempfile.TemporaryDirectory(prefix="r4-inference-", dir=destination.parent) as temporary:
        location = Path(temporary) / "readings"
        location.mkdir()
        for cell in cells:
            expression, position = cell["expression"], cell["position"]
            x, y = cell["origin"]
            definitions = definitions_for(expression)
            request = make_request(image.crop((x, y, x + width, y + height)), definitions, model)
            prompt = request["prompt"]
            zoom = image.crop((x, y, x + width, y + height)).resize((width * 2, height * 2), Image.Resampling.LANCZOS)
            for pass_number in (1, 2, "zoom"):
                current_request = make_request(zoom, definitions, model) if pass_number == "zoom" else request
                identity = {key: prepared[key] for key in ("reference_id", "image_sha256", "record_sha256")}
                entry = read_or_attempt(destination.with_suffix(".checkpoint"), f"{position}-pass-{pass_number}",
                                        identity, current_request, adapter)
                response = decode(entry)
                inference_id, points, missing = check_response(response, definitions.keys(), current_request["size"], model)
                if pass_number == "zoom":
                    points = {name: [coordinate // 2 for coordinate in point] for name, point in points.items()}
                if inference_id in seen:
                    raise ValueError("adapter reused an inference ID")
                seen.add(inference_id)
                output = {key: prepared[key] for key in ("reference_id", "image_sha256", "record_sha256")}
                output.update(image=image_path.name, model_version=model, inference_id=inference_id,
                              prompt_sha256=hashlib.sha256(prompt.encode()).hexdigest(),
                              size=[width, height], expression=expression, position=position,
                              origin=[x, y], source_size=current_request["size"], points=points, missing=missing)
                for field in ("sent_request_sha256", "sent_configuration_sha256"):
                    if field in response:
                        output[field] = response[field]
                output["pass"] = pass_number
                (location / f"{position}-pass-{pass_number}.json").write_text(json.dumps(output, indent=2) + "\n")
        if destination.exists():
            raise ValueError("destination already exists")
        location.rename(destination)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--model", required=True)
    parser.add_argument("--adapter", required=True, nargs=argparse.REMAINDER)
    args = parser.parse_args()
    try:
        if not args.adapter:
            raise ValueError("provide an adapter command after --adapter")
        run(args.image, args.manifest, args.destination, args.model, args.adapter)
    except subprocess.CalledProcessError as error:
        parser.exit(2, f"Vision adapter exited with status {error.returncode}\n")
    except (OSError, KeyError, TypeError, ValueError, subprocess.TimeoutExpired) as error:
        parser.exit(2, f"{error}\n")
