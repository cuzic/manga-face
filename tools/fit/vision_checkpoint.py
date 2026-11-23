"""Save adapter attempts before interpretation and block ambiguous resends."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile


def digest(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def write_record(path, value):
    with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False) as file:
        pending = Path(file.name)
        try:
            json.dump(value, file, indent=2, allow_nan=False)
            file.write("\n")
            file.flush()
            pending.replace(path)
        finally:
            pending.unlink(missing_ok=True)


def read_or_attempt(folder, name, identity, request, adapter):
    folder.mkdir(mode=0o700, exist_ok=True)
    saved = folder / f"{name}.json"
    scripts = {entry: hashlib.sha256(Path(entry).read_bytes()).hexdigest()
               for entry in adapter if entry.endswith(".py") and Path(entry).is_file()}
    identity = {**identity, "request": digest(request), "adapter": digest([adapter, scripts])}
    try:
        with saved.open("x") as file:
            json.dump({"identity": identity, "state": "started"}, file)
    except FileExistsError:
        entry = json.loads(saved.read_text())
        if entry["identity"] != identity:
            raise ValueError(f"checkpoint differs from requested run: {name}")
        if entry["state"] != "received":
            raise ValueError(f"adapter outcome unknown for {name}; inspect it before resending")
        return entry
    result = subprocess.run(adapter, input=json.dumps(request), check=False,
                            text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)
    entry = {"identity": identity, "state": "received", "exit_code": result.returncode, "stdout": result.stdout}
    write_record(saved, entry)
    return entry


def decode(entry):
    if entry["exit_code"] != 0:
        raise ValueError(f"saved adapter call failed with status {entry['exit_code']}; no automatic resend")
    response = json.loads(entry["stdout"])
    if "error" in response:
        raise ValueError(response["error"])
    return response
