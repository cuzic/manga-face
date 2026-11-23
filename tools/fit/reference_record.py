"""Check an approved ADR 0002 reference and emit its input identity.

Usage: uv run --no-project --with jsonschema reference_record.py IMAGE [RECORD]
Out-of-domain references are admitted only with --fixture.
"""
import argparse
from datetime import date
import hashlib
import json
from pathlib import Path
import re

from jsonschema import Draft202012Validator, ValidationError

PUBLIC_MODEL = re.compile(r"[A-Za-z0-9][A-Za-z0-9. -]{0,79}")
PUBLIC_ID = re.compile(r"ai-[0-9]{4,}")

SCHEMA = Path(__file__).with_name("reference_record.schema.json")


def validate_schema(data):
    schema = json.loads(SCHEMA.read_text())
    validator = Draft202012Validator(schema, format_checker=Draft202012Validator.FORMAT_CHECKER)
    validator.validate(data)


def validate(image, raw_record, fixture=False, for_fit=False):
    data = json.loads(raw_record)
    validate_schema(data)
    if data["review"] != "accepted":
        raise ValueError("reference needs an owner acceptance record")
    kind, domain = data["kind"], data["domain"]
    if domain == "out" and not fixture:
        raise ValueError("out-of-domain reference is limited to tool regression")
    if fixture and domain != "out":
        raise ValueError("--fixture requires an out-of-domain reference")
    expected_hash = data["sha256"]
    if hashlib.sha256(image.read_bytes()).hexdigest() != expected_hash:
        raise ValueError("image SHA-256 does not match the reference record")
    if kind == "pd-cc0" and (data["depicts_real_person"] or data["resembles_known_character"]):
        raise ValueError("PD reference needs explicit clearance for likeness")
    if for_fit and kind == "ai-generated":
        accepted = [cell for cell in data["cells"] if cell["review"] == "accepted"]
        if not any(cell["expression"] == "neutral" for cell in accepted):
            raise ValueError("fit input needs an accepted neutral cell")
        if any("ink_threshold" not in cell for cell in accepted):
            raise ValueError("fit input needs a recorded ink threshold for each accepted cell")
    return {
        "reference_id": data.get("id", image.stem),
        "kind": kind,
        "domain": domain,
        "image_sha256": expected_hash,
        "record_sha256": hashlib.sha256(raw_record).hexdigest(),
    }


def fit_inputs(image, record_path, passes, fixture=False):
    """Validate the recorded reference and the bindings of its two landmark passes."""
    from PIL import Image

    record_path = record_path or image.with_suffix(".provenance.json")
    raw_record = record_path.read_bytes()
    identity = validate(image, raw_record, fixture=fixture, for_fit=True)
    record = json.loads(raw_record)
    a, b = (json.loads(path.read_text()) for path in passes)
    with Image.open(image) as picture:
        width, height = picture.size
    if identity["kind"] == "ai-generated":
        if width % 2 or height % 2:
            raise ValueError("generated sheet must divide into a 2×2 grid")
        position = a["position"]
        cell = next((cell for cell in record["cells"] if cell["position"] == position), None)
        if cell is None or cell["review"] != "accepted":
            raise ValueError("landmark readings need an accepted cell")
        w, h = width // 2, height // 2
        expected = {
            **{key: identity[key] for key in ("reference_id", "image_sha256", "record_sha256")},
            "position": position, "size": [w, h],
            "origin": [position % 2 * w, position // 2 * h], "expression": cell["expression"],
        }
        for number, reading in enumerate((a, b), 1):
            if reading.get("pass") != number or any(reading.get(key) != value for key, value in expected.items()):
                raise ValueError(f"landmark pass {number} does not match the accepted grid and provenance")
        if not a.get("inference_id") or not b.get("inference_id") or a["inference_id"] == b["inference_id"]:
            raise ValueError("landmark passes need distinct inference IDs")
    elif any(reading.get("size") != [width, height] for reading in (a, b)) or a.get("expression") != b.get("expression"):
        raise ValueError("PD landmark passes disagree about image size or expression")
    if any(reading.get("image") != image.name for reading in (a, b)):
        raise ValueError("landmark pass image name differs from the reference image")
    return identity, a, b



def public_row(data, identity):
    """Format the allowlisted fields of an accepted generated reference."""
    if identity["kind"] != "ai-generated":
        raise ValueError("generated-reference summary requires an AI reference")
    ref = identity["reference_id"]
    model = data["model"]
    if not PUBLIC_ID.fullmatch(ref) or not PUBLIC_MODEL.fullmatch(model):
        raise ValueError("reference id or model cannot be published as a Markdown field")
    generated = date.fromisoformat(data["date"][:10]).isoformat()
    reviewed = date.fromisoformat(data["reviewed_at"]).isoformat()
    return (
        f"| {ref} | ai-generated | {model} | {generated} | — | "
        f"sha256 {identity['image_sha256']} | accepted by the owner ({reviewed}); "
        f"domain: {identity['domain']} | {data['used_for']} |"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path)
    parser.add_argument("record", nargs="?", type=Path)
    parser.add_argument("--fixture", action="store_true")
    parser.add_argument("--for-fit", action="store_true")
    parser.add_argument("--public-row", action="store_true")
    args = parser.parse_args()
    try:
        record = args.record or args.image.with_suffix(".provenance.json")
        raw_record = record.read_bytes()
        result = validate(args.image, raw_record, args.fixture, args.for_fit)
        output = public_row(json.loads(raw_record), result) if args.public_row else json.dumps(result, indent=2)
    except ValidationError as error:
        field = ".".join(str(part) for part in error.absolute_path) or "record"
        parser.exit(2, f"Schema validation failed at {field} ({error.validator})\n")
    except (OSError, ValueError, TypeError, KeyError) as error:
        parser.exit(2, f"{error}\n")
    print(output)
