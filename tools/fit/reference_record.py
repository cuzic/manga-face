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


def validate(image, raw_record, fixture=False, for_fit=False):
    data = json.loads(raw_record)
    schema = json.loads(SCHEMA.read_text())
    validator = Draft202012Validator(schema, format_checker=Draft202012Validator.FORMAT_CHECKER)
    validator.validate(data)
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
