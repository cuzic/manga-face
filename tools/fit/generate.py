"""Submit and collect private reference sheets (ADR 0002 R1)."""

import argparse
import base64
import hashlib
import json
import os
import re
import struct
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

MODEL = "gpt-image-2.6-sunburst"
SIDE = 816
SIZE = f"{SIDE}x{SIDE}"
QUALITY = "low"
LIMIT = 20
# 2026-11-23: https://developers.openai.com/api/docs/guides/image-generation#calculating-costs
# 718 estimated output tokens at $15 per million on Batch.
IMAGE_COST = Decimal("0.01077")
ENDPOINT = "/v1/images/generations"
PENDING = Path(__file__).resolve().parents[2] / "refs/ai/pending"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
EXPRESSIONS = (
    ("neutral", "smile", "surprise", "angry"),
    ("neutral", "laugh", "worry", "sad"),
)
PROFILES = (
    ("teenager", "short hair", "large round eyes"),
    ("young adult", "bob", "medium eyes"),
    ("adult", "short hair", "small narrow eyes"),
    ("adult", "bob", "medium eyes"),
    ("teenager", "long straight hair", "medium eyes"),
    ("young adult", "curly short hair", "large round eyes"),
    ("adult", "long straight hair", "small narrow eyes"),
    ("adult", "ponytail", "medium eyes"),
    ("young adult", "ponytail", "small narrow eyes"),
    ("adult", "curly short hair", "large round eyes"),
)
PROMPT = (
    "A character model sheet of one original fictional character, drawn as clean black line art on a pure white background, "
    "in a generic Japanese manga style. The sheet is a grid of 2 columns by 2 rows, each cell showing the same "
    "character's head and shoulders, front view, with a different facial expression: {expressions}. "
    "Same face, hair and clothes in every cell. {age}, {hair}, {eyes}. Uniform line weight, no shading, "
    "no colour, no screentone, no text, no labels, no borders between cells."
)


def requests(count):
    if not 1 <= count <= LIMIT:
        raise ValueError("Choose between 1 and 20 sheets.")
    rows = []
    for index in range(count):
        age, hair, eyes = PROFILES[index // 2]
        prompt = PROMPT.format(age=age, hair=hair, eyes=eyes,
                               expressions=", ".join(EXPRESSIONS[index % 2]))
        rows.append({
            "custom_id": f"sheet-{index+1:02d}", "method": "POST", "url": ENDPOINT,
            "body": {"model": MODEL, "size": SIZE, "quality": QUALITY,
                     "n": 1, "output_format": "png", "background": "opaque", "prompt": prompt},
        })
    return rows


class API:
    def __init__(self, key):
        self.key = key

    def call(self, path, body=None, content_type="application/json"):
        headers = {"Authorization": f"Bearer {self.key}", "Content-Type": content_type}
        try:
            with urlopen(Request("https://api.openai.com" + path, body, headers), timeout=90) as response:
                return response.read()
        except URLError as error:
            status = getattr(error, "code", None)
            detail = f"HTTP {status}" if status else "network error"
            raise ValueError(f"OpenAI request failed ({detail}). Check the API dashboard before retrying.") from None

    def upload(self, rows):
        boundary = uuid.uuid4().hex
        jsonl = "".join(json.dumps(row) + "\n" for row in rows)
        body = (
            f'--{boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\nbatch\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="requests.jsonl"\r\n'
            f'Content-Type: application/jsonl\r\n\r\n{jsonl}\r\n--{boundary}--\r\n'
        )
        return json.loads(self.call("/v1/files", body.encode(), f"multipart/form-data; boundary={boundary}"))["id"]

    def submit(self, file_id):
        body = {"input_file_id": file_id, "endpoint": ENDPOINT, "completion_window": "24h"}
        return json.loads(self.call("/v1/batches", json.dumps(body).encode()))["id"]

    def status(self, batch_id):
        return json.loads(self.call(f"/v1/batches/{batch_id}"))

    def results(self, file_id):
        return [json.loads(line) for line in self.call(f"/v1/files/{file_id}/content").splitlines() if line.strip()]


def atomic_write(path, data):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(data)
            stream.close()
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)


def write_json(path, value):
    atomic_write(path, (json.dumps(value, indent=2) + "\n").encode())


def provenance_metadata(data):
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError("Expected a PNG image.")
    offset = len(PNG_SIGNATURE)
    if data[offset:offset + 16] != struct.pack(">I4sII", 13, b"IHDR", SIDE, SIDE):
        raise ValueError("Unexpected PNG dimensions.")
    manifests = []
    while offset + 12 <= len(data):
        length, kind = struct.unpack_from(">I4s", data, offset)
        end = offset + length + 12
        if end > len(data):
            break
        if kind == b"caBX":
            manifests.append(base64.b64encode(data[offset + 8:end - 4]).decode())
        if kind == b"IEND":
            return {"c2pa_png_chunks": manifests} if manifests else "none"
        offset = end
    raise ValueError("Incomplete PNG.")


def submit(root, api, rows):
    # Keep requests before submission so the dashboard can recover a lost response.
    working = root / f"submission-{uuid.uuid4().hex}"
    working.mkdir(parents=True, mode=0o700)
    state = working / "batch.json"
    write_json(state, {"requests": rows})
    file_id = api.upload(rows)
    write_json(state, {"requests": rows, "input_file_id": file_id})
    batch_id = api.submit(file_id)
    write_json(state, {"requests": rows, "input_file_id": file_id, "batch_id": batch_id})
    if not re.fullmatch(r"batch[-_][A-Za-z0-9_-]+", batch_id):
        raise ValueError("Unexpected batch ID. Check the saved submission state.")
    working.rename(root / batch_id)
    print(f"Submitted {batch_id}. Run collect {batch_id} to retrieve results.")
    return 0


def collect(root, api, batch_id):
    folder = root / batch_id
    state = json.loads((folder / "batch.json").read_text())
    status = api.status(batch_id)
    phase = status["status"]
    if phase not in {"completed", "failed", "expired", "cancelled"}:
        print("The batch is still processing. Run collect again later.")
        return 0

    results = {}
    for key in ("output_file_id", "error_file_id"):
        if file_id := status.get(key):
            for item in api.results(file_id):
                results.setdefault(item["custom_id"], []).append(item)
    date = datetime.fromtimestamp(status.get("completed_at") or datetime.now(timezone.utc).timestamp(),
                                  timezone.utc).date().isoformat()
    failed = []
    for index, row in enumerate(state["requests"]):
        sheet = row["custom_id"]
        items = results.get(sheet, [])
        response = items[0].get("response") if len(items) == 1 else None
        if not response or response.get("status_code") != 200:
            reason = "missing, duplicate, or failed response"
            failed.append({"id": sheet, "reason": reason})
            continue
        try:
            data = base64.b64decode(response["body"]["data"][0]["b64_json"], validate=True)
            metadata = provenance_metadata(data)
        except (KeyError, IndexError, TypeError, ValueError):
            failed.append({"id": sheet, "reason": "invalid PNG response"})
            continue
        expressions = EXPRESSIONS[index % 2]
        draft = {
            "schema_version": 1, "id": sheet, "batch_id": batch_id, "kind": "ai-generated",
            "model": row["body"]["model"], "date": date, "request": row,
            "provenance_metadata": metadata, "sha256": hashlib.sha256(data).hexdigest(),
            "review": "pending", "domain_candidate": "mature" if PROFILES[index // 2][0] == "adult" else "young",
            "cells": [{"position": position, "expression": expression}
                      for position, expression in enumerate(expressions)],
            "used_for": "none",
        }
        atomic_write(folder / f"{sheet}.png", data)
        write_json(folder / f"{sheet}.provenance.json", draft)

    write_json(folder / "collection.json", {"status": phase, "failed": failed})
    print(f"{len(state['requests']) - len(failed)} succeeded, {len(failed)} failed.")
    for entry in failed:
        print(f"{entry['id']}: {entry['reason']}.")
    return int(bool(failed) or phase != "completed")


def main(argv=None, *, root=PENDING, api_factory=API):
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    commands = parser.add_subparsers(dest="command", required=True)
    sending = commands.add_parser("submit", allow_abbrev=False)
    sending.add_argument("--count", type=int, choices=range(1, LIMIT+1), default=LIMIT)
    sending.add_argument("--yes", action="store_true")
    receiving = commands.add_parser("collect", allow_abbrev=False)
    receiving.add_argument("batch_id")
    args = parser.parse_args(argv)
    if args.command == "submit":
        print(f"{args.count} sheets: estimated image output ${IMAGE_COST * args.count:.5f}; prompt input is extra.", flush=True)
        if not args.yes:
            print("Pass --yes after approving the cost.", file=sys.stderr)
            return 2
    elif not re.fullmatch(r"batch[-_][A-Za-z0-9_-]+", args.batch_id):
        parser.error("Use the batch ID printed by submit.")
    if not (key := os.environ.get("OPENAI_API_KEY")):
        print("Set OPENAI_API_KEY in the environment.", file=sys.stderr)
        return 2
    api = api_factory(key)
    try:
        if args.command == "submit":
            return submit(root, api, requests(args.count))
        return collect(root, api, args.batch_id)
    except (OSError, KeyError, ValueError):
        print("Batch operation failed. Check local state and the API dashboard before retrying.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
