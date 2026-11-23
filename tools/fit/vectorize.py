"""Vectorizes the dark layer (ink and black hair) and the silhouette of a reference with potrace's algorithm (the pure-Python port `potracer`).
usage: python tools/fit/vectorize.py <ref.png> <outdir>
The result is a measurement and an input to later steps (ADR 0002 D3); a traced shape ships only under the rule of ADR 0002 D6.
"""
import sys, json, hashlib
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

def main(ref, outdir):
    out = Path(outdir); out.mkdir(parents=True, exist_ok=True)
    gray, alpha = load(ref)
    h, w = gray.shape
    stats = {}
    for name, mask in (('ink', gray < 80), ('silhouette', alpha > 128)):
        pl = trace(mask)
        d = to_svg_path(pl)
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><rect width="{w}" height="{h}" fill="#ffffff"/><path d="{d}" fill="#22201b" fill-rule="evenodd"/></svg>\n'
        (out / f'{name}.svg').write_text(svg)
        stats[name] = {'curves': len(pl), 'segments': count_nodes(pl), 'svg_bytes': len(svg.encode()), 'mask_pixels': int(mask.sum()), 'sha256': hashlib.sha256(svg.encode()).hexdigest()[:16]}
    (out / 'vectorize.json').write_text(json.dumps(stats, indent=2) + '\n')
    print(json.dumps(stats, indent=2))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
