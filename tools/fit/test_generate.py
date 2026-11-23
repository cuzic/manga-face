import base64
import contextlib
import io
import json
import struct
import tempfile
import unittest
import zlib
from pathlib import Path
from unittest.mock import patch

import generate


def chunk(kind, data):
    return (struct.pack(">I", len(data)) + kind + data
            + struct.pack(">I", zlib.crc32(kind + data)))


def png(metadata=None):
    header = struct.pack(">IIBBBBB", 816, 816, 8, 0, 0, 0, 0)
    pixels = zlib.compress((b"\x00" + b"\xff" * 816) * 816)
    return (generate.PNG_SIGNATURE + chunk(b"IHDR", header)
            + (chunk(b"caBX", metadata) if metadata else b"")
            + chunk(b"IDAT", pixels) + chunk(b"IEND", b""))


class MockAPI:
    def upload(self, rows):
        self.rows = rows
        return "file-input"

    def submit(self, file_id):
        if file_id != "file-input":
            raise AssertionError(file_id)
        return "batch-test"

    def status(self, batch_id):
        if batch_id != "batch-test":
            raise AssertionError(batch_id)
        return {"status": "completed", "output_file_id": "file-output",
                "error_file_id": "file-errors", "completed_at": 1795392000}

    def results(self, file_id):
        if file_id == "file-errors":
            return [{"custom_id": self.rows[0]["custom_id"], "error": {"code": "failed"}}]
        return [{"custom_id": row["custom_id"], "response": {"status_code": 200,
                 "body": {"data": [{"b64_json": base64.b64encode(png(b"manifest")).decode()}]}}}
                for row in reversed(self.rows[1:])]


class GenerateTests(unittest.TestCase):
    def test_requests_match_adr_and_settings(self):
        adr = (Path(__file__).resolve().parents[2] / "docs/adr/0002-reference-guided-faces.md").read_text()
        self.assertIn("> " + generate.PROMPT, adr)
        rows = generate.requests(20)
        self.assertEqual(len(rows), 20)
        self.assertEqual(len({row["custom_id"] for row in rows}), 20)
        for row in rows:
            self.assertEqual(row["url"], "/v1/images/generations")
            self.assertEqual(row["body"]["model"], "gpt-image-2.6-sunburst")
            self.assertEqual(row["body"]["size"], "816x816")
            self.assertEqual(row["body"]["quality"], "low")
            self.assertEqual(row["body"]["n"], 1)
        self.assertIn("neutral, smile, surprise, angry", rows[0]["body"]["prompt"])
        self.assertIn("neutral, laugh, worry, sad", rows[1]["body"]["prompt"])

    def test_limits_and_key_gate(self):
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stderr(io.StringIO()):
            root = Path(tmp)
            with patch.dict("os.environ", {"QUALITY": "high", "SIZE": "1024x1024"}, clear=True):
                self.assertEqual(generate.requests(2)[0]["body"]["quality"], "low")
                self.assertEqual(generate.main(["submit", "--yes"], root=root), 2)
            for args in (["--count", "21"], ["--size", "1024x1024"], ["--quality", "high"],
                         ["--prompt", "arbitrary text"]):
                with self.assertRaises(SystemExit) as error:
                    generate.main(["submit", *args], root=root)
                self.assertEqual(error.exception.code, 2)
            self.assertEqual(list(root.iterdir()), [])

    def test_cost_confirmation_submit_and_resume(self):
        api = MockAPI()
        with tempfile.TemporaryDirectory() as tmp, patch.dict("os.environ", {"OPENAI_API_KEY": "secret-test-key"}):
            root = Path(tmp)
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(generate.main(["submit"], root=root, api_factory=lambda _: api), 2)
                self.assertEqual(list(root.iterdir()), [])
                self.assertEqual(generate.main(["submit", "--yes"], root=root, api_factory=lambda _: api), 0)
                self.assertEqual(generate.main(["collect", "batch-test"], root=root, api_factory=lambda _: api), 1)
                self.assertEqual(generate.main(["collect", "batch-test"], root=root, api_factory=lambda _: api), 1)
            self.assertIn("$0.2154", output.getvalue())
            self.assertIn("19 succeeded, 1 failed", output.getvalue())
            records = list((root / "batch-test").glob("*.provenance.json"))
            self.assertEqual(len(records), 19)
            for path in records:
                draft = json.loads(path.read_text())
                self.assertEqual(draft["review"], "pending")
                self.assertEqual(draft["provenance_metadata"]["c2pa_png_chunks"], ["bWFuaWZlc3Q="])
                row = next(row for row in api.rows if row["custom_id"] == draft["id"])
                self.assertEqual(draft["request"], row)
            self.assertNotIn("secret-test-key", output.getvalue())
            for path in root.rglob("*.json"):
                self.assertNotIn("secret-test-key", path.read_text())

    def test_transport_posts_jsonl_then_creates_an_image_batch(self):
        api = generate.API("secret-test-key")
        rows = generate.requests(2)
        with patch.object(api, "call", side_effect=[b'{"id":"file-test"}', b'{"id":"batch_test"}']) as call:
            self.assertEqual(api.submit(api.upload(rows)), "batch_test")
        upload, submit = [entry.args for entry in call.call_args_list]
        self.assertEqual(upload[0], "/v1/files")
        self.assertIn(b'name="purpose"\r\n\r\nbatch', upload[1])
        self.assertIn(json.dumps(rows[0]).encode() + b"\n", upload[1])
        self.assertNotIn(b"secret-test-key", upload[1])
        self.assertTrue(upload[2].startswith("multipart/form-data; boundary="))
        self.assertEqual(submit[0], "/v1/batches")
        self.assertEqual(json.loads(submit[1]), {
            "endpoint": "/v1/images/generations", "input_file_id": "file-test", "completion_window": "24h",
        })

    def test_metadata_and_image_dimensions(self):
        self.assertEqual(generate.provenance_metadata(png()), "none")
        with self.assertRaises(ValueError):
            generate.provenance_metadata(b"not a PNG")


if __name__ == "__main__":
    unittest.main()
