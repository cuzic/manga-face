"""Reference metadata tests using the existing PD fixture and synthetic AI records."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from jsonschema import ValidationError

import reference_record


class ReferenceRecordTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.image = Path(temp.name) / "sheet.png"
        self.image.write_bytes(b"synthetic test content")
        self.data = {
            "id": "ai-0001", "kind": "ai-generated",
            "domain": "young", "review": "accepted", "reviewer": "owner",
            "date": "2026-11-23", "reviewed_at": "2026-11-23", "model": "test model",
            "request": {"prompt": "non-public instruction"},
            "provenance_metadata": "none",
            "sha256": hashlib.sha256(self.image.read_bytes()).hexdigest(),
            "used_for": "none",
            "cells": [{"position": 0, "expression": "neutral", "review": "accepted", "ink_threshold": 140}],
        }

    def validate(self, record, **kwargs):
        return reference_record.validate(self.image, json.dumps(record).encode(), **kwargs)

    def test_validated_public_row_uses_allowlisted_fields(self):
        accepted = self.validate(self.data, for_fit=True)
        row = reference_record.public_row(self.data, accepted)
        self.assertIn(accepted["image_sha256"], row)
        self.assertNotIn(self.data["request"]["prompt"], row)
        self.assertEqual(accepted["domain"], "young")

    def test_missing_domain_and_wrong_hash_are_refused(self):
        incomplete = dict(self.data)
        del incomplete["domain"]
        with self.assertRaises(ValidationError):
            self.validate(incomplete)
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            self.validate({**self.data, "sha256": "0" * 64})

    def test_fit_requires_a_reviewed_threshold(self):
        del self.data["cells"][0]["ink_threshold"]
        self.validate(self.data)
        with self.assertRaisesRegex(ValueError, "ink threshold"):
            self.validate(self.data, for_fit=True)

    def test_existing_pd_is_explicitly_a_fixture(self):
        repo = Path(__file__).resolve().parents[2]
        image = repo / "refs/pd/commons-surprising-face-2022.png"
        metadata = image.with_suffix(".provenance.json").read_bytes()
        with self.assertRaisesRegex(ValueError, "tool regression"):
            reference_record.validate(image, metadata)
        result = reference_record.validate(image, metadata, fixture=True)
        self.assertEqual((result["kind"], result["domain"]), ("pd-cc0", "out"))

    def test_fit_binds_landmark_passes_to_the_approved_cell(self):
        from PIL import Image

        Image.new("RGB", (32, 32), "white").save(self.image)
        self.data["sha256"] = hashlib.sha256(self.image.read_bytes()).hexdigest()
        record = self.image.with_suffix(".provenance.json")
        record.write_text(json.dumps(self.data))
        identity = self.validate(self.data, for_fit=True)
        first = self.image.with_name("first.json")
        second = self.image.with_name("second.json")
        shared = {**identity, "image": self.image.name, "size": [16, 16], "position": 0,
                  "origin": [0, 0], "expression": "neutral", "points": {}}
        first.write_text(json.dumps({**shared, "pass": 1, "inference_id": "one"}))
        second_record = {**shared, "pass": 2, "inference_id": "two"}
        second.write_text(json.dumps(second_record))
        result, _, _ = reference_record.fit_inputs(self.image, None, (first, second))
        self.assertEqual(result, identity)
        for key, value in [("record_sha256", "0" * 64), ("origin", [16, 0]), ("inference_id", "one")]:
            with self.subTest(key=key):
                second.write_text(json.dumps({**second_record, key: value}))
                with self.assertRaises(ValueError):
                    reference_record.fit_inputs(self.image, None, (first, second))
