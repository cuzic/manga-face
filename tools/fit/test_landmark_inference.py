import hashlib
from io import BytesIO, StringIO
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

import landmark_calibration
import landmark_inference
import openai_landmark_adapter


class LandmarkInferenceTest(unittest.TestCase):
    def test_accepted_cell_uses_two_independent_calls(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            image = root / "sheet.png"
            Image.new("RGB", (32, 32), "white").save(image)
            record = image.with_suffix(".provenance.json")
            cell = {"position": 0, "expression": "neutral", "review": "accepted"}
            record.write_text(json.dumps({"id": "synthetic", "kind": "ai-generated", "domain": "young",
                                          "review": "accepted", "cells": [cell]}))
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps({
                "reference_id": "synthetic", "kind": "ai-generated", "domain": "young",
                "image_sha256": hashlib.sha256(image.read_bytes()).hexdigest(),
                "record_sha256": hashlib.sha256(record.read_bytes()).hexdigest(),
                "cell_size": [16, 16],
                "cells": [{**cell, "origin": [0, 0]}],
            }))
            requests = []

            def fake_call(command, *, input, **kwargs):
                import base64
                request = json.loads(input)
                self.assertEqual(Image.open(BytesIO(base64.b64decode(request["image_png_base64"]))).size, (16, 16))
                requests.append(request)
                result = {"model_version": "test-v1", "inference_id": f"call-{len(requests)}",
                          "points": {}, "missing": dict.fromkeys(landmark_inference.DEFINITIONS, "hidden")}
                return subprocess.CompletedProcess(command, 0, json.dumps(result), "")

            destination = root / "readings"
            with patch.object(landmark_inference.subprocess, "run", side_effect=fake_call):
                landmark_inference.run(image, manifest, destination, "test-v1", [sys.executable])
            original = manifest.read_text()
            for mutation in ("duplicate", "missing", "wrong domain"):
                with self.subTest(mutation=mutation):
                    changed = json.loads(original)
                    if mutation == "duplicate":
                        changed["cells"].append(changed["cells"][0])
                    elif mutation == "missing":
                        changed["cells"].clear()
                    else:
                        changed["domain"] = "mature"
                    manifest.write_text(json.dumps(changed))
                    with patch.object(landmark_inference.subprocess, "run") as adapter:
                        with self.assertRaises(ValueError):
                            landmark_inference.run(image, manifest, root / "rejected", "test-v1", [sys.executable])
                        adapter.assert_not_called()
                    self.assertFalse((root / "rejected").exists())
            self.assertEqual(requests[0], requests[1])
            for number in (1, 2):
                result = json.loads((destination / f"0-pass-{number}.json").read_text())
                self.assertEqual(result["inference_id"], f"call-{number}")
                self.assertEqual(result["pass"], number)
                self.assertEqual(len(result["missing"]), 19)

    def test_rejects_missing_or_out_of_range_point(self):
        response = {"model_version": "test", "inference_id": "call", "points": {"chin": [16, 0]}, "missing": {}}
        with self.assertRaisesRegex(ValueError, "outside"):
            landmark_inference.check_response(response, {"chin"}, [16, 16], "test")
        with self.assertRaisesRegex(ValueError, "exactly once"):
            landmark_inference.check_response(response, {"chin", "noseTip"}, [16, 16], "test")


class OpenAiAdapterTest(unittest.TestCase):
    def test_request_and_structured_response(self):
        task = {"model_version": "test-v1", "size": [16, 16],
                "prompt": 'Read landmarks.\n{"chin":"lowest point"}', "image_png_base64": "AAAA"}
        result = {"status": "completed", "model": "test-v1", "id": "response-one", "output": [
            {"type": "message", "content": [{"type": "output_text", "text": '{"chin":{"x":2,"y":3,"reason":null}}'}]}
        ]}
        with patch.object(openai_landmark_adapter, "urlopen", return_value=StringIO(json.dumps(result))) as post:
            actual = openai_landmark_adapter.main(task, "test-key")
        body = json.loads(post.call_args.args[0].data)
        self.assertFalse(body["store"])
        self.assertEqual(body["input"][0]["content"][1]["image_url"], "data:image/png;base64,AAAA")
        self.assertTrue(body["text"]["format"]["strict"])
        self.assertEqual(actual["points"], {"chin": [2, 3]})

    def test_rejects_refusal(self):
        result = {"status": "completed", "model": "test-v1", "output": [
            {"type": "message", "content": [{"type": "refusal"}]}
        ]}
        with self.assertRaisesRegex(ValueError, "refused"):
            openai_landmark_adapter.parse_reading(result, "test-v1", ["chin"])


class CalibrationTest(unittest.TestCase):
    def test_scores_shift_and_false_positive(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            landmark_calibration.generate(root)
            truth = json.loads((root / "scaled-occluded.truth.json").read_text())
            points = {name: [round(x), round(y)] for name, (x, y) in truth["points"].items()}
            points["browL"] = [155, 141]
            points["chin"][0] += 4
            scores = landmark_calibration.score(truth, {**truth, "points": points, "missing": []})
            self.assertEqual(scores["false_positive_on_occluded"], ["browL"])
            self.assertGreater(scores["error_px"]["chin"], 3)


class SheetLayoutTest(unittest.TestCase):
    def test_accepts_both_r1_layouts_and_rejects_a_mixed_sheet(self):
        from generate import EXPRESSIONS

        for expressions in EXPRESSIONS:
            cells = [{"position": i, "expression": e, "review": "accepted", "origin": [i % 2 * 16, i // 2 * 16]}
                     for i, e in enumerate(expressions)]
            record = {"id": "synthetic", "review": "accepted", "kind": "ai-generated", "domain": "young", "cells": cells}
            prepared = {"reference_id": "synthetic", "kind": "ai-generated", "domain": "young",
                        "cell_size": [16, 16], "cells": cells}
            self.assertEqual(landmark_inference.checked_cells(record, prepared), cells)
        cells[1]["expression"] = "smile"
        with self.assertRaisesRegex(ValueError, "R1 expression sheet"):
            landmark_inference.checked_cells(record, prepared)


class CalibrationSummaryTest(unittest.TestCase):
    def test_visible_and_occluded_cases_have_separate_counts(self):
        scores = [
            {"error_px": {"chin": 3, "browL": 2}, "missed_visible": [], "false_positive_on_occluded": []},
            {"error_px": {"chin": 4}, "missed_visible": ["browL"], "false_positive_on_occluded": []},
            {"error_px": {"chin": 0}, "missed_visible": [], "false_positive_on_occluded": ["browL"]},
        ]
        summary = landmark_calibration.summarize(scores)
        brow = summary["browL"]
        self.assertEqual((brow["visible_readings"], brow["detected_visible"], brow["detection_rate"]), (2, 1, 0.5))
        self.assertEqual((brow["occluded_readings"], brow["false_positive_on_occluded"]), (1, 1))
        self.assertEqual(brow["rms_px"], 2)
        self.assertEqual(summary["chin"]["max_px"], 4)
        self.assertAlmostEqual(summary["chin"]["rms_px"], (25 / 3) ** 0.5)
