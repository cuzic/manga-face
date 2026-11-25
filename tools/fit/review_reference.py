"""List R1 drafts or write a human-reviewed AI reference record."""
import argparse
from datetime import date
import hashlib
import json
from pathlib import Path
import tempfile

from jsonschema import ValidationError

from generate import EXPRESSIONS
from reference_record import validate, validate_schema


def list_pending(directory):
    for candidate in sorted(directory.rglob("*.provenance.json")):
        data = json.loads(candidate.read_text())
        if data.get("review") == "pending":
            yield {"file": candidate.relative_to(directory).as_posix(), "id": data["id"],
                   "domain_candidate": data["domain_candidate"], "expressions": [c["expression"] for c in data["cells"]]}


def review(image, draft, output, args):
    data = json.loads(draft.read_text())
    if data.get("kind") != "ai-generated" or data.get("review") != "pending":
        raise ValueError("expected a pending AI draft")
    if hashlib.sha256(image.read_bytes()).hexdigest() != data["sha256"]:
        raise ValueError("image SHA-256 does not match the draft")
    cells = data["cells"]
    if ([cell["position"] for cell in cells] != list(range(4))
            or tuple(cell["expression"] for cell in cells) not in EXPRESSIONS):
        raise ValueError("draft does not match an R1 expression sheet")
    discarded = dict(args.discard_cell)
    if len(discarded) != len(args.discard_cell) or set(discarded) - set(range(4)):
        raise ValueError("each discarded cell needs a unique position from 0 to 3")
    data["request_record_id"] = data["id"]
    data.update(id=args.id, review=args.decision, reviewer=args.reviewer,
                reviewed_at=args.reviewed_at.isoformat(), used_for="none")
    if args.decision == "accepted":
        if args.reason:
            raise ValueError("a sheet-wide reason applies to discarded sheets")
        data["domain"] = args.domain or data["domain_candidate"]
        if args.out_reason:
            data["out_reason"] = args.out_reason
        if args.out_reason_detail:
            data["out_reason_detail"] = args.out_reason_detail
        if data["domain"] != "out" and (args.out_reason or args.out_reason_detail):
            raise ValueError("an out reason requires the out domain")
    else:
        if not args.reason or args.domain or args.out_reason or args.out_reason_detail or discarded:
            raise ValueError("a discarded sheet needs a sheet-wide reason")
        data["reason"] = args.reason
        discarded = dict.fromkeys(range(4), args.reason)
    for cell in cells:
        reason = discarded.get(cell["position"])
        cell["review"] = "discarded" if reason else "accepted"
        if reason:
            cell["reason"] = reason
    if args.decision == "accepted":
        validate(image, json.dumps(data).encode(), fixture=data["domain"] == "out")
    else:
        validate_schema(data)
    with tempfile.TemporaryDirectory(dir=output.parent, prefix="reference-review-") as stage:
        pending = Path(stage) / "reviewed.json"
        pending.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        pending.chmod(0o600)
        output.hardlink_to(pending)


def discard_cell(value):
    position, reason = value.split(":", 1)
    return int(position), reason


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list").add_argument("directory", type=Path)
    apply = sub.add_parser("review")
    for name in ("image", "draft", "output"):
        apply.add_argument(name, type=Path)
    apply.add_argument("--id", required=True)
    apply.add_argument("--reviewer", required=True)
    apply.add_argument("--reviewed-at", required=True, type=date.fromisoformat)
    apply.add_argument("--decision", required=True, choices=("accepted", "discarded"))
    apply.add_argument("--domain", choices=("young", "mature", "out"))
    apply.add_argument("--reason")
    apply.add_argument("--out-reason")
    apply.add_argument("--out-reason-detail")
    apply.add_argument("--discard-cell", action="append", default=[], type=discard_cell)
    args = parser.parse_args()
    try:
        if args.command == "list":
            print(json.dumps(list(list_pending(args.directory)), indent=2))
        else:
            review(args.image, args.draft, args.output, args)
    except ValidationError as error:
        field = ".".join(str(part) for part in error.absolute_path) or "record"
        parser.exit(2, f"Schema validation failed at {field} ({error.validator})\n")
    except (OSError, ValueError, TypeError, KeyError) as error:
        parser.exit(2, f"{error}\n")
