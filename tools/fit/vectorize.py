"""Vectorizes the dark layer (ink lines) and the silhouette of a reference with potrace's algorithm (the pure-Python port `potracer`).
usage: python tools/fit/vectorize.py <ref.png> <outdir> [ink_threshold=140]
Sheet mode: python tools/fit/vectorize.py <sheet.png> <outdir> --sheet-record <reviewed.json>
The result is a measurement and an input to later steps (ADR 0002 D3); a traced shape ships only under the rule of ADR 0002 D6.
Note: potrace outlines FILLED shapes, so a drawn line of width w comes out as one closed contour around the stroke (two edges). For line-art references the
vectorized outline is therefore used for the hair silhouette and as the ink mask of the distance measure (ADR 0002 D5), not as a centre line.
"""
import argparse
import hashlib
from io import BytesIO
import json
import tempfile
from pathlib import Path
import numpy as np
from PIL import Image
import potrace

def load(path):
    im = Image.open(path).convert('RGBA'); bg = Image.new('RGBA', im.size, 'white'); bg.alpha_composite(im)
    return np.asarray(bg.convert('L')), np.asarray(im)[:, :, 3]

def trace(mask, turdsize=8, alphamax=1.0, opttolerance=0.4):
    bm = potrace.Bitmap(~mask)  # potracer traces the False pixels
    return bm.trace(turdsize=turdsize, alphamax=alphamax, opticurve=True, opttolerance=opttolerance)

def to_svg_path(plist):
    parts = []
    for curve in plist:
        s = curve.start_point
        parts.append(f"M{s.x:.1f} {s.y:.1f}")
        for seg in curve.segments:
            if seg.is_corner:
                parts.append(f"L{seg.c.x:.1f} {seg.c.y:.1f}L{seg.end_point.x:.1f} {seg.end_point.y:.1f}")
            else:
                parts.append(f"C{seg.c1.x:.1f} {seg.c1.y:.1f} {seg.c2.x:.1f} {seg.c2.y:.1f} {seg.end_point.x:.1f} {seg.end_point.y:.1f}")
        parts.append('Z')
    return ''.join(parts)

def count_nodes(plist):
    return sum(len(c.segments) for c in plist)

def vectorize_mask(mask):
    h, w = mask.shape
    curves = trace(mask)
    d = to_svg_path(curves)
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><rect width="{w}" height="{h}" fill="#ffffff"/><path d="{d}" fill="#22201b" fill-rule="evenodd"/></svg>\n'
    stats = {'curves': len(curves), 'segments': count_nodes(curves), 'svg_bytes': len(svg.encode()), 'mask_pixels': int(mask.sum()), 'sha256': hashlib.sha256(svg.encode()).hexdigest()[:16]}
    return svg, stats


def main(ref, outdir, thr=140):
    out = Path(outdir); out.mkdir(parents=True, exist_ok=True)
    gray, alpha = load(ref)
    stats = {}
    for name, mask in (('ink', gray < thr), ('silhouette', alpha > 128)):
        svg, stats[name] = vectorize_mask(mask)
        (out / f'{name}.svg').write_text(svg)
    (out / 'vectorize.json').write_text(json.dumps(stats, indent=2) + '\n')
    print(json.dumps(stats, indent=2))

def prepare_sheet(image, record, out):
    from reference_record import validate

    if out.exists():
        raise ValueError("sheet output directory must be new")
    raw_record = record.read_bytes()
    identity = validate(image, raw_record, for_fit=True)
    if identity["kind"] != "ai-generated":
        raise ValueError("sheet mode requires an accepted generated reference")
    raw_image = image.read_bytes()
    if hashlib.sha256(raw_image).hexdigest() != identity["image_sha256"]:
        raise ValueError("source image changed during preparation")
    gray, _ = load(BytesIO(raw_image))
    height, width = gray.shape
    if width % 2 or height % 2:
        raise ValueError("sheet dimensions must divide into a 2×2 grid")
    w, h = width // 2, height // 2
    cells = []
    with tempfile.TemporaryDirectory(dir=out.parent, prefix="prepare-sheet-") as work:
        stage = Path(work) / "output"
        stage.mkdir()
        for cell in sorted(json.loads(raw_record)["cells"], key=lambda item: item["position"]):
            if cell["review"] != "accepted":
                continue
            position = cell["position"]
            x, y = position % 2 * w, position // 2 * h
            threshold = cell["ink_threshold"]
            mask = gray[y:y + h, x:x + w] < threshold
            svg, stats = vectorize_mask(mask)
            data = f"P5\n{w} {h}\n255\n".encode("ascii") + np.where(mask, 0, 255).astype("uint8").tobytes()
            expression = cell["expression"]
            (stage / f"{expression}.pgm").write_bytes(data)
            (stage / f"{expression}.svg").write_text(svg)
            cells.append({"position": position, "origin": [x, y], "expression": expression,
                          "ink_threshold": threshold, "ink_pixels": stats["mask_pixels"],
                          "mask_sha256": hashlib.sha256(data).hexdigest(),
                          "trace_sha256": hashlib.sha256(svg.encode()).hexdigest()})
        manifest = {**identity, "cell_size": [w, h], "cells": cells}
        (stage / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        if out.exists():
            raise ValueError("sheet output directory must be new")
        stage.rename(out)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path)
    parser.add_argument("out", type=Path)
    parser.add_argument("threshold", type=int, nargs="?")
    parser.add_argument("--sheet-record", type=Path)
    args = parser.parse_args()
    if args.sheet_record:
        if args.threshold is not None:
            parser.error("sheet mode uses the per-cell thresholds in provenance")
        prepare_sheet(args.image, args.sheet_record, args.out)
    else:
        main(args.image, args.out, args.threshold if args.threshold is not None else 140)
