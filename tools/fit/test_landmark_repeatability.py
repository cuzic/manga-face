"""Tests for the ADR 0002 D8 sigma computation on synthetic prepared manifests and paired readings."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

from landmark_repeatability import NAMES, measure

SIZE = [408, 408]
CONFIG = "c" * 64


def reading(sheet, number, points, model="model", configuration=CONFIG):
    return {
        "reference_id": f"ref-{sheet}", "image_sha256": f"image-{sheet}", "record_sha256": f"record-{sheet}",
        "size": SIZE, "position": 0, "origin": [0, 0], "expression": "neutral", "pass": number,
        "model_version": model, "sent_configuration_sha256": configuration,
        "inference_id": f"id-{sheet}-{number}",
        "points": points, "missing": {name: "hidden" for name in sorted(NAMES - points.keys())},
    }


def sheet_points(sheet, number):
    """Sheets 0-2 are 200 px wide, sheet 3 is 100 px wide, sheet 4 lacks one cheek in pass 2."""
    left, right = (150, 250) if sheet == 3 else (100, 300)
    points = {"cheekL": [left, 200], "cheekR": [right, 200],
              "chin": [200, 300 + (10 if number == 2 else 0)],
              "noseTip": [200, 250 + (2 if number == 2 else 0)]}
    if sheet <= 2 or number == 1:
        points["browL"] = [150, 100]
    if sheet <= 1:
        points["mouthC"] = [200, 280]
    if sheet == 4 and number == 2:
        del points["cheekL"]
    return points


class RepeatabilityTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.sessions = [self.write_sheet(sheet) for sheet in range(5)]
        self.manifest = self.root / "sessions.json"

    def write_sheet(self, sheet, overrides=()):
        overrides = dict(overrides)
        prepared = {"reference_id": f"ref-{sheet}", "image_sha256": f"image-{sheet}", "record_sha256": f"record-{sheet}",
                    "cell_size": SIZE, "cells": [{"position": 0, "expression": "neutral", "origin": [0, 0]}]}
        (self.root / f"prepared-{sheet}.json").write_text(json.dumps(prepared))
        files = {}
        for number in (1, 2):
            data = reading(sheet, number, sheet_points(sheet, number), **overrides.get(number, {}))
            (self.root / f"{sheet}-pass-{number}.json").write_text(json.dumps(data))
            files[("first", "second")[number - 1]] = {"file": f"{sheet}-pass-{number}.json"}
        return {"prepared_manifest": f"prepared-{sheet}.json", **files}

    def run_measure(self, sessions=None):
        self.manifest.write_text(json.dumps(self.sessions if sessions is None else sessions))
        return measure(self.manifest)

    def test_known_sigma_floor_and_sheet_counts(self):
        report = self.run_measure()
        self.assertEqual(report["input_sheets"], 5)
        self.assertEqual(report["included_face_width_sheets"], 4)
        self.assertEqual(list(report["excluded_face_width"]), ["ref-4"])
        landmarks = report["landmarks"]
        # chin differs by 10 px on every sheet. Widths 200, 200, 200, 100:
        # sqrt(mean(10**2 / 4 / w**2)) = sqrt(0.00109375) = 3.3072 % beats the 2 px floor (1.3229 %).
        chin = landmarks["chin"]
        self.assertAlmostEqual(chin["sigma_pct_face_width"], 3.30719, places=3)
        self.assertEqual((chin["paired_sheets"], chin["insufficient"], chin["one_sided"]), (4, False, 0))
        # noseTip differs by 2 px: 0.66 % < floor sqrt(mean(2 / w) ** 2) = 1.3229 %, so the floor is reported.
        self.assertAlmostEqual(landmarks["noseTip"]["sigma_pct_face_width"], 1.32288, places=3)

    def test_one_sided_and_insufficient_landmarks(self):
        landmarks = self.run_measure()["landmarks"]
        brow = landmarks["browL"]
        self.assertEqual((brow["detected_first"], brow["detected_second"], brow["detected_both"], brow["one_sided"]),
                         (5, 3, 3, 2))
        self.assertEqual((brow["paired_sheets"], brow["insufficient"]), (3, False))
        self.assertAlmostEqual(brow["sigma_pct_face_width"], 1.0, places=6)
        mouth = landmarks["mouthC"]
        self.assertEqual((mouth["paired_sheets"], mouth["insufficient"], mouth["sigma_pct_face_width"]), (2, True, None))
        self.assertEqual(landmarks["earL"]["detected_both"], 0)

    def test_requires_five_distinct_sheets(self):
        with self.assertRaisesRegex(ValueError, "five reference sheets"):
            self.run_measure(self.sessions[:4])
        duplicate = self.sessions[:4] + [self.sessions[0]]
        with self.assertRaises(ValueError):
            self.run_measure(duplicate)

    def test_duplicate_reference_with_new_readings_is_refused(self):
        again = self.write_sheet(0)
        for number in (1, 2):
            path = self.root / f"0-pass-{number}.json"
            data = json.loads(path.read_text())
            data["inference_id"] = f"other-{number}"
            (self.root / f"dup-{number}.json").write_text(json.dumps(data))
        again["first"], again["second"] = {"file": "dup-1.json"}, {"file": "dup-2.json"}
        with self.assertRaisesRegex(ValueError, "distinct reference"):
            self.run_measure(self.sessions[:4] + [again])

    def test_mixed_configuration_is_refused(self):
        self.sessions[2] = self.write_sheet(2, {2: {"configuration": "d" * 64}})
        with self.assertRaisesRegex(ValueError, "same model version and configuration"):
            self.run_measure()
        self.sessions[2] = self.write_sheet(2, {1: {"model": "other"}})
        with self.assertRaisesRegex(ValueError, "same model version and configuration"):
            self.run_measure()

    def test_zoom_pass_and_wrong_expression_are_refused(self):
        path = self.root / "1-pass-2.json"
        data = json.loads(path.read_text())
        zoom = {**data, "pass": "zoom"}
        path.write_text(json.dumps(zoom))
        with self.assertRaisesRegex(ValueError, "expected neutral pass 2"):
            self.run_measure()
        path.write_text(json.dumps({**data, "expression": "smile"}))
        with self.assertRaisesRegex(ValueError, "expected neutral pass 2"):
            self.run_measure()

    def test_reused_inference_id_and_binding_mismatch_are_refused(self):
        path = self.root / "1-pass-2.json"
        data = json.loads(path.read_text())
        path.write_text(json.dumps({**data, "inference_id": "id-0-1"}))
        with self.assertRaisesRegex(ValueError, "distinct inference ID"):
            self.run_measure()
        path.write_text(json.dumps({**data, "image_sha256": "other"}))
        with self.assertRaisesRegex(ValueError, "image_sha256"):
            self.run_measure()

    def test_every_sheet_without_a_face_width_is_refused(self):
        for sheet in range(5):
            path = self.root / f"{sheet}-pass-1.json"
            data = json.loads(path.read_text())
            data["missing"]["cheekL"] = "hidden"
            del data["points"]["cheekL"]
            path.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, "usable face width"):
            self.run_measure()


if __name__ == "__main__":
    unittest.main()
