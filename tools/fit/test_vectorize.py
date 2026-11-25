import contextlib
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image, ImageDraw

import vectorize


class VectorizationTest(unittest.TestCase):
    def test_pd_ink_matches_the_committed_geometry(self):
        image = Path(__file__).resolve().parents[2] / "refs/pd/commons-surprising-face-2022.png"
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            vectorize.main(image, directory)
            output = Path(directory)
            self.assertEqual((output / "ink.svg").read_bytes(), image.with_suffix(".ink-traced.svg").read_bytes())
            stats = json.loads((output / "vectorize.json").read_text())["ink"]
            self.assertEqual((stats["curves"], stats["segments"], stats["svg_bytes"]), (68, 1955, 70268))

    def test_sheet_crops_and_skips_discarded_cells_deterministically(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            image = root / "sheet.png"
            color = Image.new("RGB", (80, 80), "white")
            drawing = ImageDraw.Draw(color)
            drawing.rectangle((10, 10, 24, 24), fill=(12, 30, 60))
            drawing.ellipse((50, 50, 64, 64), fill=(145, 145, 145))
            color.save(image)
            record = root / "sheet.provenance.json"
            record.write_text(json.dumps({
                "id": "ai-0001", "kind": "ai-generated", "domain": "young", "review": "accepted",
                "reviewer": "owner", "date": "2026-11-23", "model": "test", "used_for": "none",
                "request": {"prompt": "synthetic fixture"}, "provenance_metadata": "none",
                "sha256": hashlib.sha256(image.read_bytes()).hexdigest(),
                "cells": [
                    {"position": 0, "expression": "neutral", "review": "accepted", "ink_threshold": 140},
                    {"position": 1, "expression": "smile", "review": "discarded", "reason": "quality", "ink_threshold": 140},
                    {"position": 3, "expression": "angry", "review": "accepted", "ink_threshold": 150},
                ],
            }))
            one, two = root / "one", root / "two"
            vectorize.prepare_sheet(image, record, one)
            vectorize.prepare_sheet(image, record, two)
            self.assertEqual(sorted(p.name for p in one.iterdir()),
                             ["angry.pgm", "angry.svg", "manifest.json", "neutral.pgm", "neutral.svg"])
            for path in one.iterdir():
                self.assertEqual(path.read_bytes(), (two / path.name).read_bytes())
            manifest = json.loads((one / "manifest.json").read_text())
            self.assertEqual(manifest["cell_size"], [40, 40])
            self.assertEqual([cell["origin"] for cell in manifest["cells"]], [[0, 0], [40, 40]])
            self.assertEqual(manifest["cells"][0]["ink_pixels"], 225)
            self.assertGreater(manifest["cells"][1]["ink_pixels"], 0)
