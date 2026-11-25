"""Table-driven tests for the R4 eligibility gate (ADR 0002 D4) and its use by fit.py."""
import contextlib
import copy
import io
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image

import fit
import landmark_calibration
import landmark_inference
from landmark_policy import qualified_points

CONFIG = "a" * 64
FIELDS = dict(reference_id="ai-0001", image_sha256="image-hash", record_sha256="record-hash", image="sheet.png",
              size=[408, 408], position=0, origin=[0, 0], expression="neutral", model_version="model",
              sent_configuration_sha256=CONFIG)


def metrics(error=1.0, **overrides):
    """One calibration reading's score for `chin` (limits apply) and `cheekL` (needs two occlusions)."""
    value = {"error_px": {"chin": error, "cheekL": 1.0}, "missed_visible": [],
             "false_positive_on_occluded": [], "occluded": []}
    value.update(overrides)
    return value


def occluded():
    return {"error_px": {}, "missed_visible": [], "false_positive_on_occluded": [], "occluded": ["cheekL"]}


def reading(score, configuration=CONFIG, size=(408, 408), fixture="neutral"):
    svg = landmark_calibration.generated_files().get(f"{fixture}.svg", b"")
    return {"fixture": fixture, "png_sha256": "png-" + fixture, "svg_sha256": hashlib.sha256(svg).hexdigest(), "sent_configuration_sha256": configuration,
            "size": list(size), "metrics": score}


def make_report(readings):
    rasters = {item["fixture"]: item["png_sha256"] for item in readings}
    return {"model_version": "model", "invalid_responses": 0,
            "fixture_set": {"truth_sha256": landmark_calibration.fixture_truth_digest(),
                            "raster_sha256": landmark_calibration.raster_digest(rasters)},
            "readings": readings}


def good_readings():
    return [reading(metrics()), reading(metrics()), reading(occluded(), fixture="scaled-occluded"), reading(occluded(), fixture="scaled-occluded")]


def make_inputs():
    points = {"chin": [100, 200], "cheekL": [80, 150]}
    first = {**FIELDS, "pass": 1, "inference_id": "a", "source_size": [408, 408], "points": points}
    second = {**FIELDS, "pass": 2, "inference_id": "b", "source_size": [408, 408], "points": copy.deepcopy(points)}
    zoom = {**FIELDS, "pass": "zoom", "inference_id": "c", "source_size": [816, 816], "points": copy.deepcopy(points)}
    return first, second, zoom, make_report(good_readings())


class QualifiedPointsTest(unittest.TestCase):
    def test_baseline_admits_every_point(self):
        first, second, zoom, report = make_inputs()
        self.assertEqual(qualified_points(first, second, zoom, report), {"chin", "cheekL"})

    def test_each_limit_drops_only_the_failing_point(self):
        good = good_readings()
        cases = {
            "rms above 2 px": [reading(metrics(error=3.0)), reading(metrics(error=3.0))] + good[2:],
            "detection rate below 90%": [reading(metrics()) for _ in range(8)]
                + [reading(metrics(error_px={"cheekL": 1.0}, missed_visible=["chin"])) for _ in range(2)] + good[2:],
            "fewer than two visible readings": [reading(metrics()), reading(metrics(error_px={"cheekL": 1.0}))] + good[2:],
            "false positive on an occluded point": good[:2] + [reading(metrics(false_positive_on_occluded=["chin"]))] + good[2:],
            "occlusion-required point never seen occluded": good[:2],
            "occlusion-required point seen occluded once": good[:3],
        }
        expected = {name: {"cheekL"} for name in cases}
        for name in ("occlusion-required point never seen occluded", "occlusion-required point seen occluded once"):
            expected[name] = {"chin"}
        for name, readings in cases.items():
            with self.subTest(name):
                first, second, zoom, _ = make_inputs()
                self.assertEqual(qualified_points(first, second, zoom, make_report(readings)), expected[name])

    def test_occlusion_is_not_required_for_other_points(self):
        first, second, zoom, _ = make_inputs()
        report = make_report(good_readings()[:2])
        self.assertIn("chin", qualified_points(first, second, zoom, report))

    def test_zoom_disagreement_drops_the_point(self):
        first, second, zoom, report = make_inputs()
        zoom["points"]["chin"] = [104, 200]
        self.assertEqual(qualified_points(first, second, zoom, report), {"cheekL"})
        zoom["points"]["chin"] = [103, 200]
        self.assertEqual(qualified_points(first, second, zoom, report), {"chin", "cheekL"})

    def test_readings_of_another_configuration_or_size_are_not_evidence(self):
        first, second, zoom, _ = make_inputs()
        noise = [reading(metrics(error=9.0), configuration="b" * 64), reading(metrics(error=9.0), size=(204, 204))]
        self.assertEqual(qualified_points(first, second, zoom, make_report(good_readings() + noise)), {"chin", "cheekL"})
        with self.assertRaisesRegex(ValueError, "repeated calibration"):
            qualified_points(first, second, zoom, make_report(
                [reading(metrics(), configuration="b" * 64), reading(metrics(), configuration="b" * 64)]))

    def test_rejections(self):
        def invalid(report):
            report["invalid_responses"] = 1

        def truth(report):
            report["fixture_set"]["truth_sha256"] = "0" * 64

        def raster(report):
            report["fixture_set"]["raster_sha256"] = "0" * 64

        def no_fixture_set(report):
            del report["fixture_set"]

        def tampered_png(report):
            report["readings"][0]["png_sha256"] = "tampered"

        def model(report):
            report["model_version"] = "other"

        def second_model(_report, _first, second, _zoom):
            second["model_version"] = "other"

        def second_config(_report, _first, second, _zoom):
            second["sent_configuration_sha256"] = "b" * 64

        def short_config(_report, first, second, zoom):
            for item in (first, second, zoom):
                item["sent_configuration_sha256"] = "abc"

        def cropped(_report, first, _second, _zoom):
            first["source_size"] = [204, 204]

        def zoom_not_double(_report, _first, _second, zoom):
            zoom["source_size"] = [408, 408]

        def zoom_pass(_report, _first, _second, zoom):
            zoom["pass"] = 2

        def zoom_model(_report, _first, _second, zoom):
            zoom["model_version"] = "other"

        def zoom_config(_report, _first, _second, zoom):
            zoom["sent_configuration_sha256"] = "b" * 64

        def zoom_other_cell(_report, _first, _second, zoom):
            zoom["origin"] = [204, 0]

        def zoom_other_image(_report, _first, _second, zoom):
            zoom["image_sha256"] = "other"

        def zoom_reused_id(_report, first, _second, zoom):
            zoom["inference_id"] = first["inference_id"]

        def zoom_no_id(_report, _first, _second, zoom):
            zoom["inference_id"] = ""

        report_cases = {"invalid responses": invalid, "other fixture truth": truth, "other raster": raster,
                        "no fixture set": no_fixture_set, "raster hash not matching readings": tampered_png,
                        "report model differs": model}
        reading_cases = {"second pass other model": second_model, "second pass other configuration": second_config,
                         "malformed configuration": short_config, "first pass cropped": cropped,
                         "zoom not twice the cell": zoom_not_double, "zoom pass label": zoom_pass,
                         "zoom other model": zoom_model, "zoom other configuration": zoom_config,
                         "zoom other cell": zoom_other_cell, "zoom other image": zoom_other_image,
                         "zoom reuses an inference ID": zoom_reused_id, "zoom without inference ID": zoom_no_id}
        for name, change in report_cases.items():
            with self.subTest(name):
                first, second, zoom, report = make_inputs()
                change(report)
                with self.assertRaises(ValueError):
                    qualified_points(first, second, zoom, report)
        for name, change in reading_cases.items():
            with self.subTest(name):
                first, second, zoom, report = make_inputs()
                change(report, first, second, zoom)
                with self.assertRaises(ValueError):
                    qualified_points(first, second, zoom, report)

    def test_zoom_reusing_the_second_pass_id_is_refused(self):
        first, second, zoom, report = make_inputs()
        zoom["inference_id"] = second["inference_id"]
        with self.assertRaisesRegex(ValueError, "zoom"):
            qualified_points(first, second, zoom, report)


class ReportBindingTest(unittest.TestCase):
    def test_calibration_report_records_the_fixture_set(self):
        import run_landmark_calibration

        names = landmark_inference.DEFINITIONS
        truth = {"size": [16, 16], "image_sha256": "test", "points": dict.fromkeys(names, [1, 1]), "missing": []}
        fixture = ("neutral", truth, {"svg_sha256": "test", "png_sha256": "png-test"}, {"size": [16, 16], "prompt": "p"}, names)
        reply = {"model_version": "model", "points": dict.fromkeys(names, [1, 1]), "missing": {}}
        calls = []

        def adapter(command, **kwargs):
            calls.append(command)
            return subprocess.CompletedProcess(command, 0, json.dumps({**reply, "inference_id": f"id-{len(calls)}"}), "")

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            landmark_calibration.generate(root)
            with patch.object(run_landmark_calibration, "checked_fixtures", return_value=[fixture]), \
                    patch("vision_checkpoint.subprocess.run", side_effect=adapter):
                report = run_landmark_calibration.evaluate(root, "model", ["mock"], root / "checkpoint", ["neutral"])
            files = {path.name: path.read_bytes() for path in root.iterdir()
                     if path.suffix == ".svg" or path.name.endswith(".truth.json")}
        self.assertEqual(report["fixture_set"], {
            "truth_sha256": landmark_calibration.truth_digest(files),
            "raster_sha256": landmark_calibration.raster_digest({"neutral": "png-test"})})

    def test_digest_changes_with_the_fixtures(self):
        self.assertNotEqual(landmark_calibration.raster_digest({"neutral": "a"}), landmark_calibration.raster_digest({"neutral": "b"}))
        before = landmark_calibration.fixture_truth_digest()
        self.assertEqual(before, landmark_calibration.fixture_truth_digest())
        with patch.dict(landmark_calibration.POINTS, {"chin": (161, 224)}):
            self.assertNotEqual(before, landmark_calibration.fixture_truth_digest())


class StaleFixtureTest(unittest.TestCase):
    """A report scored on an older or altered fixture directory must not qualify points."""

    def render(self, root):
        # Stand-in for render_landmark_fixtures.ts: any PNG, bound to its SVG by `.raster.json`.
        for svg in sorted(root.glob("*.svg")):
            image = Image.new("RGB", (408, 408), "white")
            image.putpixel((len(svg.stem), 1), (0, 0, 0))
            image.save(svg.with_suffix(".png"))
            svg.with_suffix(".raster.json").write_text(json.dumps({
                "svg_sha256": hashlib.sha256(svg.read_bytes()).hexdigest(),
                "png_sha256": hashlib.sha256(svg.with_suffix(".png").read_bytes()).hexdigest()}) + "\n")

    def make_fixtures(self, stale=False):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        landmark_calibration.generate(root)
        if stale:
            # An older revision: SVG changed, chin truth moved 30 px, everything else rebound consistently.
            for name in landmark_calibration.BASE_CASES:
                svg = root / f"{name}.svg"
                svg.write_text(svg.read_text().replace("</svg>", "<!-- older revision --></svg>"))
                truth_path = root / f"{name}.truth.json"
                truth = json.loads(truth_path.read_text())
                truth["image_sha256"] = hashlib.sha256(svg.read_bytes()).hexdigest()
                truth["points"]["chin"][1] += 30
                truth_path.write_text(json.dumps(truth, indent=2) + "\n")
        self.render(root)
        return root

    def adapter(self):
        names = landmark_inference.DEFINITIONS
        calls = []

        def call(command, **kwargs):
            calls.append(command)
            reply = {"model_version": "model", "inference_id": f"id-{len(calls)}",
                     "points": dict.fromkeys(names, [100, 100]), "missing": {}}
            return subprocess.CompletedProcess(command, 0, json.dumps(reply), "")

        return patch("vision_checkpoint.subprocess.run", side_effect=call), calls

    def test_current_fixtures_are_accepted(self):
        import run_landmark_calibration

        root = self.make_fixtures()
        inputs = run_landmark_calibration.checked_fixtures(root, "model", landmark_calibration.BASE_CASES)
        self.assertEqual([item[0] for item in inputs], list(landmark_calibration.BASE_CASES))

    def test_stale_fixture_directory_is_refused_before_any_call(self):
        import run_landmark_calibration

        root = self.make_fixtures(stale=True)
        patched, calls = self.adapter()
        with patched, self.assertRaisesRegex(ValueError, "current generator"):
            run_landmark_calibration.evaluate(root, "model", ["mock"], root / "checkpoint")
        self.assertEqual(calls, [])

    def test_any_generated_file_stale_or_missing_is_refused_before_any_call(self):
        import run_landmark_calibration

        self.assertIn("smile.truth.json", landmark_calibration.generated_files())
        self.assertNotIn("smile", landmark_calibration.BASE_CASES)
        for change, pattern in (("altered", "current generator"), ("deleted", "missing")):
            for name in ("smile.truth.json", "angry.svg"):
                with self.subTest(change=change, name=name):
                    root = self.make_fixtures()
                    target = root / name
                    if change == "altered":
                        target.write_bytes(target.read_bytes() + b" ")
                    else:
                        target.unlink()
                    patched, calls = self.adapter()
                    with patched, self.assertRaisesRegex(ValueError, pattern):
                        run_landmark_calibration.evaluate(root, "model", ["mock"], root / "checkpoint")
                    self.assertEqual(calls, [])

    def test_truth_digest_describes_the_files_that_were_read(self):
        import run_landmark_calibration

        root = self.make_fixtures(stale=True)
        patched, _ = self.adapter()
        definitions = landmark_inference.definitions_for("neutral")

        def unchecked(fixtures, model, cases):
            # Bypass the staleness check to see what the report would claim for the stale directory.
            return [(name, json.loads((fixtures / f"{name}.truth.json").read_text()),
                     json.loads((fixtures / f"{name}.raster.json").read_text()),
                     {"size": [408, 408], "prompt": "p"}, definitions) for name in cases]

        with patched, patch.object(run_landmark_calibration, "checked_fixtures", unchecked):
            report = run_landmark_calibration.evaluate(root, "model", ["mock"], root / "checkpoint")
        self.assertNotEqual(report["fixture_set"]["truth_sha256"], landmark_calibration.fixture_truth_digest())
        first, second, zoom, _ = make_inputs()
        with self.assertRaisesRegex(ValueError, "fixture set"):
            qualified_points(first, second, zoom, {**report, "invalid_responses": 0})

    def test_each_checked_fixtures_binding_is_enforced(self):
        import run_landmark_calibration

        cases = ("neutral",)
        root = self.make_fixtures()
        raster = root / "neutral.raster.json"
        original = raster.read_text()
        raster.write_text(json.dumps({**json.loads(original), "png_sha256": "0" * 64}))
        with self.assertRaisesRegex(ValueError, "raster changed"):
            run_landmark_calibration.checked_fixtures(root, "model", cases)
        raster.write_text(original)
        (root / "neutral.png").write_bytes((root / "neutral.png").read_bytes() + b"x")
        with self.assertRaisesRegex(ValueError, "raster changed"):
            run_landmark_calibration.checked_fixtures(root, "model", cases)

        # If the generator itself changed, the SVG must still match the hash its truth file names.
        root = self.make_fixtures()
        truth_path = root / "neutral.truth.json"
        truth = json.loads(truth_path.read_text())
        truth["image_sha256"] = "0" * 64
        truth_path.write_text(json.dumps(truth, indent=2) + "\n")
        current = landmark_calibration.generated_files()
        current["neutral.truth.json"] = truth_path.read_bytes()
        with patch.object(landmark_calibration, "generated_files", return_value=current), \
                self.assertRaisesRegex(ValueError, "SVG changed"):
            run_landmark_calibration.checked_fixtures(root, "model", cases)

    def test_every_reading_must_match_the_fixture_map(self):
        for field in ("png_sha256", "svg_sha256"):
            with self.subTest(field=field):
                first, second, zoom, report = make_inputs()
                self.assertEqual(report["readings"][2]["fixture"], report["readings"][3]["fixture"])
                report["readings"][3][field] = "0" * 64  # a later reading of the same fixture
                with self.assertRaisesRegex(ValueError, "fixture set"):
                    qualified_points(first, second, zoom, report)


class AiFitTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.image = self.root / "sheet.png"
        Image.new("RGB", (32, 32), "white").save(self.image)
        record = {
            "id": "ai-0001", "kind": "ai-generated", "domain": "young", "review": "accepted", "reviewer": "owner",
            "date": "2026-11-23", "reviewed_at": "2026-11-23", "model": "test model",
            "request": {"prompt": "non-public instruction"}, "provenance_metadata": "none",
            "sha256": hashlib.sha256(self.image.read_bytes()).hexdigest(), "used_for": "none",
            "cells": [{"position": 0, "expression": "neutral", "review": "accepted", "ink_threshold": 140}],
        }
        self.record = self.root / "reviewed.json"
        self.record.write_text(json.dumps(record))
        identity = {"reference_id": "ai-0001", "image_sha256": record["sha256"],
                    "record_sha256": hashlib.sha256(self.record.read_bytes()).hexdigest()}
        base = {**identity, "image": "sheet.png", "size": [16, 16], "position": 0, "origin": [0, 0],
                "expression": "neutral", "model_version": "model", "sent_configuration_sha256": CONFIG}
        points = {"chin": [8, 14], "mouthC": [8, 11], "noseTip": [8, 8]}
        self.first = {**base, "pass": 1, "inference_id": "a", "source_size": [16, 16], "points": points}
        self.second = {**base, "pass": 2, "inference_id": "b", "source_size": [16, 16], "points": copy.deepcopy(points)}
        self.zoom = {**base, "pass": "zoom", "inference_id": "c", "source_size": [32, 32],
                     "points": {**points, "noseTip": [8, 14]}}
        report = make_report([reading(metrics(), size=(16, 16)), reading(metrics(), size=(16, 16))])
        for item in report["readings"]:
            item["metrics"] = {"error_px": {"chin": 1.0, "mouthC": 1.0, "noseTip": 1.0}, "missed_visible": [],
                               "false_positive_on_occluded": [], "occluded": []}
        self.paths = {}
        for name, value in (("first", self.first), ("second", self.second), ("zoom", self.zoom), ("report", report)):
            self.paths[name] = self.root / f"{name}.json"
            self.paths[name].write_text(json.dumps(value))

    def run_fit(self, **kwargs):
        # tools/fit/landmarks.ts (the model side of the fit) is a spike that does not run on this branch; stub it.
        names = sorted(landmark_inference.DEFINITIONS)
        shape = np.array([[float(i * 5 % 17), float(i * 7 % 13)] for i in range(len(names))])
        with patch.object(fit, "model", side_effect=lambda ch, expression: (names, shape, ch, [])), \
                contextlib.redirect_stdout(io.StringIO()):
            return self.fit_main(**kwargs)

    def fit_main(self, **kwargs):
        return fit.main(self.paths["first"], self.paths["second"], self.root / "out", reference_image=self.image,
                        record=self.record, **kwargs)

    def test_fit_refuses_an_ai_reference_without_calibration_and_zoom(self):
        for kwargs in ({}, {"calibration": self.paths["report"]}, {"zoom": self.paths["zoom"]}):
            with self.subTest(kwargs=sorted(kwargs)):
                with self.assertRaisesRegex(ValueError, "--calibration and --zoom"):
                    self.run_fit(**kwargs)
        self.assertFalse((self.root / "out").exists())

    def test_fit_records_points_excluded_by_the_policy(self):
        self.run_fit(calibration=self.paths["report"], zoom=self.paths["zoom"])
        result = json.loads((self.root / "out" / "fit.json").read_text())
        self.assertEqual(result["excluded_by_policy"], ["noseTip"])
        self.assertEqual(sorted(result["landmarks_used"]), ["chin", "mouthC"])
        self.assertEqual(result["calibration_sha256"], hashlib.sha256(self.paths["report"].read_bytes()).hexdigest())
        self.assertEqual(result["zoom_sha256"], hashlib.sha256(self.paths["zoom"].read_bytes()).hexdigest())
        self.assertIn("landmark_policy", result)

    def test_fit_refuses_a_report_for_another_fixture_set(self):
        report = json.loads(self.paths["report"].read_text())
        report["fixture_set"]["truth_sha256"] = "0" * 64
        self.paths["report"].write_text(json.dumps(report))
        with self.assertRaisesRegex(ValueError, "fixture set"):
            self.run_fit(calibration=self.paths["report"], zoom=self.paths["zoom"])


if __name__ == "__main__":
    unittest.main()
