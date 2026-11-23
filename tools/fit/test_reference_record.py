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
