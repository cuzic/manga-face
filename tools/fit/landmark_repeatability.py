"""Report ADR 0002 D8 landmark repeatability from five paired neutral readings.

Usage: python3 landmark_repeatability.py sessions.json
The manifest is an array of five objects, each with `prepared_manifest` and
`first`/`second` objects with `file`. Optional `face_width_px` overrides the
default mean width measured between the two cheek landmarks.
Paths are relative to the manifest. Each point file identifies its model version,
configuration SHA-256, and distinct inference ID.
"""
import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path
from statistics import mean

NAMES = {
    "chin", "cheekL", "cheekR", "earL", "earR", "noseTip",
    "browL", "browR", "mouthL", "mouthR", "mouthC",
    *(f"eye{side}_{point}" for side in "LR" for point in ("outer", "inner", "top", "bottom")),
}


def read_pass(session, directory, expected):
    data = json.loads((directory / session["file"]).read_text())
    if data["pass"] != expected or data["expression"] != "neutral":
        raise ValueError(f"expected neutral pass {expected}: {session['file']}")
    points, missing = data["points"], data["missing"]
    if points.keys() & missing.keys() or points.keys() | missing.keys() != NAMES:
        raise ValueError(f"expected exactly 19 marked or missing landmarks: {session['file']}")
    width, height = data["size"]
    for point in points.values():
        if (len(point) != 2 or any(type(coord) is not int for coord in point)
                or not (0 <= point[0] < width and 0 <= point[1] < height)):
            raise ValueError(f"invalid coordinate: {session['file']}")
    return data


def face_width(session, readings, reference):
    width = session.get("face_width_px")
    if "face_width_px" not in session:
        spans = []
        for reading in readings:
            points = reading["points"]
            if not {"cheekL", "cheekR"} <= points.keys():
                raise ValueError(f"face width unavailable because a cheek is missing: {reference}")
            span = points["cheekR"][0] - points["cheekL"][0]
            if span <= 0:
                raise ValueError(f"cheek coordinates are reversed or coincide: {reference}")
            spans.append(span)
        width = mean(spans)
    if not isinstance(width, (int, float)) or isinstance(width, bool) or not 0 < width <= readings[0]["size"][0]:
        raise ValueError(f"invalid face width: {reference}")
    return width



def measure(manifest):
    sessions = json.loads(manifest.read_text())
    if len(sessions) != 5:
        raise ValueError("expected five reference sheets")
    samples = defaultdict(list)
    first_counts = defaultdict(int)
    second_counts = defaultdict(int)
    paired_counts = defaultdict(int)
    excluded = {}
    reference_ids = set()
    configurations = set()
    inference_ids = set()
    for session in sessions:
        first, second = session["first"], session["second"]
        a, b = (read_pass(item, manifest.parent, i) for i, item in enumerate((first, second), 1))
        prepared = json.loads((manifest.parent / session["prepared_manifest"]).read_text())
        reference = prepared["reference_id"]
        neutral, = [cell for cell in prepared["cells"] if cell["expression"] == "neutral"]
        expected = {
            "reference_id": reference,
            "image_sha256": prepared["image_sha256"],
            "record_sha256": prepared["record_sha256"],
            "size": prepared["cell_size"],
            "position": neutral["position"],
            "origin": neutral["origin"],
        }
        for reading in (a, b):
            model, prompt = reading["model_version"], reading["sent_configuration_sha256"]
            inference_id = reading["inference_id"]
            if not isinstance(model, str) or not model.strip() or not re.fullmatch(r"[a-f0-9]{64}", prompt):
                raise ValueError("expected a model version and configuration SHA-256")
            if not isinstance(inference_id, str) or not inference_id.strip() or inference_id in inference_ids:
                raise ValueError("each reading needs a distinct inference ID")
            inference_ids.add(inference_id)
            configurations.add((model, prompt))
            for field, value in expected.items():
                if reading.get(field) != value:
                    raise ValueError(f"{field} does not match prepared reference: {reference}")
        if reference in reference_ids:
            raise ValueError("expected five distinct reference sheets")
        reference_ids.add(reference)
        for name in a["points"]:
            first_counts[name] += 1
        for name in b["points"]:
            second_counts[name] += 1
        for name in a["points"].keys() & b["points"].keys():
            paired_counts[name] += 1
        try:
            width = face_width(session, (a, b), reference)
        except ValueError as error:
            excluded[reference] = str(error)
            continue
        for name in a["points"].keys() & b["points"].keys():
            difference_squared = math.dist(a["points"][name], b["points"][name]) ** 2 / 4
            samples[name].append((difference_squared, width))
    if len(configurations) != 1:
        raise ValueError("all passes must use the same model version and configuration")
    if len(excluded) == len(sessions):
        raise ValueError("no reference has a usable face width")
    results = {}
    for name in sorted(NAMES):
        observations = samples[name]
        sigma = None
        if len(observations) >= 3:
            normalized = math.sqrt(mean(delta / width ** 2 for delta, width in observations))
            floor = math.sqrt(mean((2 / width) ** 2 for _, width in observations))
            sigma = 100 * max(normalized, floor)
        results[name] = {
            "detected_first": first_counts[name], "detected_second": second_counts[name],
            "detected_both": paired_counts[name],
            "one_sided": first_counts[name] + second_counts[name] - 2 * paired_counts[name],
            "paired_sheets": len(observations), "sigma_pct_face_width": sigma,
            "insufficient": len(observations) < 3,
        }
    return {"landmarks": results, "input_sheets": len(sessions),
            "included_face_width_sheets": len(sessions) - len(excluded), "excluded_face_width": excluded}


if __name__ == "__main__":
    try:
        print(json.dumps(measure(Path(sys.argv[1])), indent=2, allow_nan=False))
    except (OSError, KeyError, IndexError, ValueError, TypeError) as error:
        raise SystemExit(str(error)) from error
