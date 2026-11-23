"""Renders reference | traced ink | baseline (young default, global map only) | fitted model side by side, and measures an appearance residual (chamfer distance of the ink edges).
usage: python tools/fit/compare.py <ref.png> <pass1.json> <pass2.json> <outdir>   (needs out/fit/fit.json from fit.py and vectorize output; playwright-chromium for the PNGs)
The reference image is embedded in the figure (out/ is not committed).
"""
import sys, json, base64, subprocess
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

ROOT = Path(__file__).resolve().parents[2]

def render_group(character, s, tx, ty, prefix):
    r = subprocess.run(['node', str(ROOT / 'tools/fit/render.ts')], input=json.dumps({'character': character, 'expression': 'neutral', 's': s, 'tx': tx, 'ty': ty, 'prefix': prefix}), capture_output=True, text=True, check=True, cwd=ROOT)
    return r.stdout

def svg_page(w, h, inner):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><rect width="{w}" height="{h}" fill="#ffffff"/>{inner}</svg>'

def png(svg_path, png_path, scale=1):
    subprocess.run(['node', str(ROOT / 'tools/png.mjs'), str(svg_path), str(png_path), str(scale)], check=True, cwd=ROOT)

def main(ref, p1, p2, outdir):
    out = Path(outdir); out.mkdir(parents=True, exist_ok=True)
    fit = json.loads((out / 'fit.json').read_text()); meta = json.loads(Path(p1).read_text())
    expression = fit['expression']
    W, H = meta['size']
    b64 = base64.b64encode(Path(ref).read_bytes()).decode()
    img = f'<image href="data:image/png;base64,{b64}" width="{W}" height="{H}"/>'
    traced = (out / 'ink.svg').read_text(); i0 = traced.index(' d="') + 4; d = traced[i0:traced.index('"', i0)]
    sys.path.insert(0, str(Path(__file__).parent)); import fit as F
    names, M0, _, _ = F.model(F.BASE, expression)
    P, sigma, present, _ = F.load_landmarks(p1, p2, names)
    w = present.astype(float)
    s0, t0 = F.similarity(P[present], M0[present], w[present])
    s1, tx1, ty1 = fit['map']['s'], fit['map']['tx'], fit['map']['ty']
    ch = fit['character']
    def group(character, s, tx, ty, prefix, hair=True):
        r = subprocess.run(['node', str(ROOT / 'tools/fit/render.ts')], input=json.dumps({'character': character, 'expression': expression, 's': s, 'tx': tx, 'ty': ty, 'prefix': prefix, 'hair': hair}), capture_output=True, text=True, check=True, cwd=ROOT)
        return r.stdout
    base_g, fit_g = group(F.BASE, s0, t0[0], t0[1], 'b-'), group(ch, s1, tx1, ty1, 'f-')
    P1 = json.loads(Path(p1).read_text())['points']
    dots = ''.join(f'<circle cx="{x}" cy="{y}" r="6" fill="#00a050"/>' for x, y in P1.values())
    _, M1, _, _ = F.model(ch, expression); back = (M1 - np.array([tx1, ty1])) / s1
    mdots = ''.join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="7" fill="none" stroke="#e02020" stroke-width="3"/>' for (x, y), p in zip(back, present) if p)
    labels = ['reference (CC0)', 'traced ink (potrace)', 'young default, aligned', 'fitted (landmarks)', 'landmarks: hand (green), model (red ring)']
    panels = [img, f'<path d="{d}" fill="#22201b" fill-rule="evenodd"/>', base_g, fit_g, img + dots + mdots]
    cell = 0.42; gap = 10; inner = ''
    for i, (lab, body) in enumerate(zip(labels, panels)):
        x = i * (W * cell + gap)
        inner += f'<text x="{x + 4}" y="16" font-family="sans-serif" font-size="14" fill="#22201b">{lab}</text><g transform="translate({x} 24) scale({cell})"><svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" overflow="hidden"><rect width="{W}" height="{H}" fill="#fff" stroke="#ccc" stroke-width="2"/>{body}</svg></g>'
    TW = int(len(panels) * (W * cell + gap)); TH = int(H * cell + 30)
    (out / 'compare.svg').write_text(svg_page(TW, TH, inner)); png(out / 'compare.svg', out / 'compare.png')
    # appearance residual: distance to the INK MASK, both ways (0 inside the ink), in the face region (x 215..730, y 300..700: the ear and the hair are outside), model rendered without hair
    box = (215, 300, 730, 700)
    for name, character, s, tx, ty in (('base', F.BASE, s0, t0[0], t0[1]), ('fit', ch, s1, tx1, ty1)):
        (out / f'model-{name}.svg').write_text(svg_page(W, H, group(character, s, tx, ty, name[0] + '-', hair=False))); png(out / f'model-{name}.svg', out / f'model-{name}.png')
    def mask(path, thr):
        g = np.asarray(Image.open(path).convert('L')); m = g < thr
        x0, y0, x1, y1 = box; region = np.zeros_like(m); region[y0:y1, x0:x1] = True
        return m, region
    ref_m, region = mask(ref, 140)
    res = {'box': box, 'unit': 'px of the reference (the face is about 500 px wide); distance to the ink mask both ways, mean, inside the box', 'ref_ink_pixels_in_box': int((ref_m & region).sum())}
    for name in ('base', 'fit'):
        mod_m, _ = mask(out / f'model-{name}.png', 110)
        to_model = distance_transform_edt(~mod_m)[ref_m & region].mean(); to_ref = distance_transform_edt(~ref_m)[mod_m & region].mean()
        res[f'{name}_ref_to_model_px'] = float(to_model); res[f'{name}_model_to_ref_px'] = float(to_ref); res[f'{name}_symmetric_px'] = float((to_model + to_ref) / 2)
        res[f'{name}_pct_of_face_width'] = float((to_model + to_ref) / 2 / 500 * 100)
    fit['appearance_distance_to_ink'] = res
    (out / 'fit.json').write_text(json.dumps(fit, indent=2) + '\n')
    print(json.dumps(res, indent=2))

if __name__ == '__main__':
    main(*sys.argv[1:5])
