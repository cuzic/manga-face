import copy
import hashlib
from io import BytesIO, StringIO
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

import landmark_calibration
import landmark_inference
import openai_landmark_adapter
import run_landmark_calibration


class LandmarkInferenceTest(unittest.TestCase):
    def test_accepted_cell_uses_two_independent_calls(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            image = root / "sheet.png"
            Image.new("RGB", (32, 32), "white").save(image)
            record = image.with_suffix(".provenance.json")
            cell = {"position": 0, "expression": "neutral", "review": "accepted"}
            record.write_text(json.dumps({"id": "synthetic", "kind": "ai-generated", "domain": "young",
                                          "reviewer": "owner", "sha256": hashlib.sha256(image.read_bytes()).hexdigest(),
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
                self.assertEqual(Image.open(BytesIO(base64.b64decode(request["image_png_base64"]))).size, tuple(request["size"]))
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
            self.assertEqual(requests[2]["size"], [32, 32])
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


class ResponseChecksTest(unittest.TestCase):
    def valid(self, **changes):
        return {"model_version": "test", "inference_id": "call", "points": {"chin": [3, 4]},
                "missing": {"noseTip": "hidden"}, **changes}

    def test_rejects_each_malformed_response(self):
        names = {"chin", "noseTip"}
        self.assertEqual(landmark_inference.check_response(self.valid(), names, [16, 16], "test")[0], "call")
        cases = {
            "other model": ({"model_version": "other"}, "unexpected model"),
            "blank inference ID": ({"inference_id": "  "}, "inference ID"),
            "non-string inference ID": ({"inference_id": 7}, "inference ID"),
            "blank reason": ({"missing": {"noseTip": " "}}, "needs a reason"),
            "non-string reason": ({"missing": {"noseTip": None}}, "needs a reason"),
            "points as a list": ({"points": [["chin", 3, 4]]}, "objects"),
            "missing as a list": ({"missing": ["noseTip"]}, "objects"),
            "points as null": ({"points": None}, "objects"),
            "float coordinate": ({"points": {"chin": [3.0, 4]}}, "outside"),
            "point on both lists": ({"missing": {"noseTip": "x", "chin": "x"}}, "exactly once"),
        }
        for name, (changes, message) in cases.items():
            with self.subTest(name):
                with self.assertRaisesRegex(ValueError, message):
                    landmark_inference.check_response(self.valid(**changes), names, [16, 16], "test")


class RunBindingTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.image = self.root / "sheet.png"
        Image.new("RGB", (32, 32), "white").save(self.image)
        self.record = self.root / "reviewed.json"
        cell = {"position": 0, "expression": "neutral", "review": "accepted"}
        self.record.write_text(json.dumps({"id": "synthetic", "kind": "ai-generated", "domain": "young",
                                           "reviewer": "owner", "review": "accepted", "cells": [cell],
                                           "sha256": hashlib.sha256(self.image.read_bytes()).hexdigest()}))
        self.manifest = self.root / "manifest.json"
        self.prepared = {"reference_id": "synthetic", "kind": "ai-generated", "domain": "young",
                         "image_sha256": hashlib.sha256(self.image.read_bytes()).hexdigest(),
                         "record_sha256": hashlib.sha256(self.record.read_bytes()).hexdigest(),
                         "cell_size": [16, 16], "cells": [{**cell, "origin": [0, 0]}]}
        self.manifest.write_text(json.dumps(self.prepared))
        self.sizes = []

    def adapter(self, **changes):
        def call(command, *, input, **kwargs):
            request = json.loads(input)
            self.sizes.append(request["size"])
            zoomed = request["size"] == [32, 32]
            result = {"model_version": "test-v1", "inference_id": f"call-{len(self.sizes)}",
                      "points": {"chin": [20, 30] if zoomed else [10, 15]},
                      "missing": {name: "hidden" for name in landmark_inference.DEFINITIONS if name != "chin"}}
            result.update(changes)
            return subprocess.CompletedProcess(command, 0, json.dumps(result), "")
        return patch("vision_checkpoint.subprocess.run", side_effect=call)

    def run_tool(self, **kwargs):
        destination = self.root / "readings"
        landmark_inference.run(self.image, self.manifest, destination, "test-v1", [sys.executable],
                               record_path=self.record, **kwargs)
        return destination

    def test_zoom_coordinates_are_halved_back_to_the_source_cell(self):
        with self.adapter():
            destination = self.run_tool()
        self.assertEqual(self.sizes, [[16, 16], [16, 16], [32, 32]])
        readings = {name: json.loads((destination / f"0-pass-{name}.json").read_text()) for name in ("1", "2", "zoom")}
        self.assertEqual(readings["zoom"]["points"]["chin"], [10, 15])
        self.assertEqual(readings["zoom"]["points"], readings["1"]["points"])
        self.assertEqual(readings["zoom"]["source_size"], [32, 32])
        self.assertEqual(readings["1"]["record_sha256"], self.prepared["record_sha256"])

    def test_record_path_is_explicit_and_the_sibling_name_is_only_a_default(self):
        with self.adapter():
            with self.assertRaises(OSError):
                landmark_inference.run(self.image, self.manifest, self.root / "default", "test-v1", [sys.executable])
            self.record.rename(self.image.with_suffix(".provenance.json"))
            landmark_inference.run(self.image, self.manifest, self.root / "default", "test-v1", [sys.executable])
        self.assertTrue((self.root / "default" / "0-pass-1.json").exists())

    def test_cli_accepts_record(self):
        argv = ["landmark_inference.py", str(self.image), str(self.manifest), str(self.root / "cli"),
                "--model", "test-v1", "--record", str(self.record), "--adapter", sys.executable]
        import runpy
        with self.adapter(), patch.object(sys, "argv", argv):
            runpy.run_path(str(Path(landmark_inference.__file__)), run_name="__main__")
        self.assertTrue((self.root / "cli" / "0-pass-zoom.json").exists())

    def test_rejected_inputs_never_reach_the_adapter(self):
        def record_hash(prepared):
            prepared["record_sha256"] = "0" * 64

        def image_hash(prepared):
            prepared["image_sha256"] = "0" * 64

        for name, change in {"record hash": record_hash, "image hash": image_hash}.items():
            with self.subTest(name):
                changed = copy.deepcopy(self.prepared)
                change(changed)
                self.manifest.write_text(json.dumps(changed))
                with patch("vision_checkpoint.subprocess.run") as adapter:
                    with self.assertRaisesRegex(ValueError, "differs from the prepared manifest"):
                        self.run_tool()
                    adapter.assert_not_called()

    def test_bad_adapter_replies_are_refused(self):
        cases = {
            "other model": ({"model_version": "other"}, "unexpected model"),
            "blank reason": ({"missing": {name: " " for name in landmark_inference.DEFINITIONS if name != "chin"}},
                             "needs a reason"),
            "reused inference ID": ({"inference_id": "same"}, "reused an inference ID"),
        }
        for name, (changes, message) in cases.items():
            with self.subTest(name):
                shutil.rmtree(self.root / "readings", ignore_errors=True)
                shutil.rmtree(self.root / "readings.checkpoint", ignore_errors=True)
                with self.adapter(**changes):
                    with self.assertRaisesRegex(ValueError, message):
                        self.run_tool()
                self.assertFalse((self.root / "readings").exists())


class OpenAiAdapterTest(unittest.TestCase):
    def test_request_and_structured_response(self):
        task = {"model_version": "test-v1", "size": [16, 16],
                "prompt": 'Read landmarks.\n{"chin":"lowest point"}', "image_png_base64": "AAAA"}
        result = {"status": "completed", "model": "test-v1", "id": "response-one", "output": [
            {"type": "message", "content": [{"type": "output_text", "text": '{"chin":{"x":2,"y":3,"reason":null}}'}]}
        ]}
        result["usage"] = {"input_tokens": 256, "input_tokens_details": {"cached_tokens": 32}, "output_tokens": 121}
        with patch.object(openai_landmark_adapter, "urlopen", return_value=StringIO(json.dumps(result))) as post:
            actual = openai_landmark_adapter.main(task, "test-key")
        body = json.loads(post.call_args.args[0].data)
        self.assertFalse(body["store"])
        self.assertEqual(body["input"][0]["content"][1]["image_url"], "data:image/png;base64,AAAA")
        self.assertTrue(body["text"]["format"]["strict"])
        self.assertEqual(actual["sent_request_sha256"], hashlib.sha256(post.call_args.args[0].data).hexdigest())
        self.assertEqual(actual["points"], {"chin": [2, 3]})
        self.assertEqual(actual["usage"], {"input_tokens": 256, "cached_input_tokens": 32, "output_tokens": 121})

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
            {"error_px": {"chin": 0}, "missed_visible": [], "false_positive_on_occluded": ["browL"], "occluded": ["browL"]},
        ]
        summary = landmark_calibration.summarize(scores)
        brow = summary["browL"]
        self.assertEqual((brow["visible_readings"], brow["detected_visible"], brow["detection_rate"]), (2, 1, 0.5))
        self.assertEqual((brow["occluded_readings"], brow["false_positive_on_occluded"]), (1, 1))
        self.assertEqual(brow["rms_px"], 2)
        self.assertEqual(summary["chin"]["max_px"], 4)
        self.assertAlmostEqual(summary["chin"]["rms_px"], (25 / 3) ** 0.5)

    def test_usage_distinguishes_zero_cached_tokens_from_missing_counts(self):
        summary = run_landmark_calibration.summarize_usage([
            {"usage": {"input_tokens": 100, "cached_input_tokens": 0, "output_tokens": 50}},
            {"usage": {"input_tokens": 150, "cached_input_tokens": 25, "output_tokens": 90}},
            {"usage": None},
        ])
        self.assertEqual(summary["input_tokens"], {"total_reported": 250, "readings_reported": 2})
        self.assertEqual(summary["cached_input_tokens"], {"total_reported": 25, "readings_reported": 2})
        self.assertEqual(summary["output_tokens"], {"total_reported": 140, "readings_reported": 2})

    def test_calibration_output_lock_rejects_a_second_writer_then_releases(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "report.json"
            with run_landmark_calibration.calibration_lock(output):
                with self.assertRaisesRegex(ValueError, "already running"):
                    with run_landmark_calibration.calibration_lock(output):
                        self.fail("acquired an occupied calibration lock")
            with run_landmark_calibration.calibration_lock(output):
                self.assertFalse(output.exists())


class RepeatabilityWidthTest(unittest.TestCase):
    def test_face_width_uses_the_two_measured_cheek_spans(self):
        from landmark_repeatability import face_width

        a = {"size": [408, 408], "points": {"cheekL": [90, 140], "cheekR": [280, 140]}}
        b = {"size": [408, 408], "points": {"cheekL": [83, 141], "cheekR": [283, 141]}}
        self.assertEqual(face_width({}, (a, b), "fixture"), 195)
        del b["points"]["cheekL"]
        with self.assertRaisesRegex(ValueError, "cheek is missing"):
            face_width({}, (a, b), "fixture")
        self.assertEqual(face_width({"face_width_px": 194}, (a, b), "fixture"), 194)


class CheckpointAndPolicyTest(unittest.TestCase):
    def test_invalid_response_is_saved_without_resending(self):
        from vision_checkpoint import decode, read_or_attempt

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            result = subprocess.CompletedProcess(["mock"], 0, '{"error":"invalid structured output"}', "")
            with patch("vision_checkpoint.subprocess.run", return_value=result) as adapter:
                first = read_or_attempt(root, "pass-1", {}, {}, ["mock"])
                with self.assertRaisesRegex(ValueError, "invalid structured output"):
                    decode(first)
                self.assertEqual(read_or_attempt(root, "pass-1", {}, {}, ["mock"]), first)
                adapter.assert_called_once()
            with patch("vision_checkpoint.subprocess.run", side_effect=subprocess.TimeoutExpired("mock", 10)) as adapter:
                with self.assertRaises(subprocess.TimeoutExpired):
                    read_or_attempt(root, "pass-2", {}, {}, ["mock"])
                with self.assertRaisesRegex(ValueError, "outcome unknown"):
                    read_or_attempt(root, "pass-2", {}, {}, ["mock"])
                adapter.assert_called_once()

    def test_neutral_and_expression_side_occlusions_exist_for_both_sides(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            landmark_calibration.generate(root)
            for side, suffix in (("left", "L"), ("right", "R")):
                neutral = json.loads((root / f"{side}-side-hidden.truth.json").read_text())
                expression = json.loads((root / f"expression-{side}-side-hidden.truth.json").read_text())
                self.assertEqual(set(neutral["missing"]), {f"cheek{suffix}", f"ear{suffix}", f"eye{suffix}_outer", f"brow{suffix}"})
                self.assertEqual(set(expression["missing"]), {f"eye{suffix}_outer", f"brow{suffix}"})
                self.assertEqual(len(expression["points"]) + len(expression["missing"]), 13)

    def test_resuming_invalid_report_only_retries_the_archived_attempt(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "report.json"
            names = landmark_inference.DEFINITIONS
            truth = {"size": [16, 16], "image_sha256": "test", "points": dict.fromkeys(names, [1, 1]), "missing": []}
            request = {"size": [16, 16], "prompt": "test"}
            fixture = ("neutral", truth, {"png_sha256": "test"}, request, names)
            calls = []

            def reply(command, **kwargs):
                calls.append(command)
                response = {"model_version": "model", "inference_id": f"test-{len(calls)}",
                            "points": dict.fromkeys(names, [1, 1]), "missing": {}}
                if len(calls) == 2:
                    response["error"] = "bad reply"
                return subprocess.CompletedProcess(command, 0, json.dumps(response), "")

            run = run_landmark_calibration.run_report
            with patch.object(run_landmark_calibration, "checked_fixtures", return_value=[fixture]):
                with patch("vision_checkpoint.subprocess.run", side_effect=reply):
                    first = run(root, "model", ["mock"], output, ["neutral"])
                    self.assertEqual(first["invalid_responses"], 1)
                    failed = output.with_suffix(".checkpoint") / "neutral-2.json"
                    failed.rename(root / "archived-failed.json")
                    result = run(root, "model", ["mock"], output, ["neutral"], resume_invalid=True)
            self.assertEqual(len(calls), 3)
            self.assertEqual(result["invalid_responses"], 0)
            self.assertEqual(len(list(root.glob("report.superseded-*.json"))), 1)

    def test_resume_rejects_a_successful_report_or_a_changed_plan_without_dispatch(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "report.json"
            for invalid, model, cases in ((0, "model", ["neutral"]),
                                          (1, "other", ["neutral"]),
                                          (1, "model", ["translated"])):
                with self.subTest(invalid=invalid, model=model, cases=cases):
                    report = {"model_version": "model", "invalid_responses": invalid,
                              "readings": [{"fixture": "neutral", "pass": 1}]}
                    output.write_text(json.dumps(report))
                    with patch.object(run_landmark_calibration, "evaluate") as evaluate:
                        with self.assertRaises(ValueError):
                            run_landmark_calibration.run_report(root, model, ["mock"], output, cases, resume_invalid=True)
                        evaluate.assert_not_called()
                    self.assertEqual(json.loads(output.read_text()), report)
