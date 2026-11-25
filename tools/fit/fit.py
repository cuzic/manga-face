"""Stage (a) of ADR 0002 D5: a landmark least-squares fit of the parametric model to two landmark readings of a reviewed reference.
usage: python tools/fit/fit.py <pass1.json> <pass2.json> <outdir> [expression] --reference-image <image.png>
- The reference's landmarks are the mean of the marking passes; each landmark's noise (sigma, px) is the spread between the passes (floor 2 px); residuals are reported in sigma units.
- Unknowns: a global map image -> model (scale s, shift t; no rotation; closed form for given parameters) and 9 model parameters.
- What is fitted and reported is what the model DRAWS: the landmarks come from `node tools/fit/landmarks.ts`, which applies normalize (the dependent constraints), and the
  reported parameters are the normalized ones. `clamped_by` lists the parameters a dependent constraint holds away from the requested value; `at_bound` the drawn ones on a range end.
- A fit must give a character that `validate` accepts for all 8 ADR 0074 expressions (a violation costs 1e6); the result is refused otherwise.
- No crown landmark (the hair height belongs to the hair).
- Deterministic: a coordinate descent on the parameter grid (the model snaps parameters to the steps of RANGES, so there is no gradient), from the young default.
"""
import argparse, hashlib, json, subprocess
from pathlib import Path
import numpy as np
from jsonschema import ValidationError

from reference_record import fit_inputs

ROOT = Path(__file__).resolve().parents[2]
PARAMS = [  # (path, lo, hi, step): the ranges of src/face.ts RANGES
    ('head.cheek', 74, 96, 2), ('head.chin', 90, 98, 1), ('eyes.w', 18, 28, 1), ('eyes.h', 13, 26, 1), ('eyes.y', 14, 28, 1), ('eyes.gap', 36, 48, 1),
    ('brows.dy', -20, 8, 1), ('mouth.w', 10, 48, 1), ('mouth.y', 58, 70, 1),
]
BASE = {  # the young default (src/face.ts DIRECTIONS.young + HAIR_YOUNG)
    'id': 'fit', 'name': 'fit', 'head': {'cheek': 86, 'chin': 96, 'jaw': 0.65, 'chinW': 4},
    'eyes': {'w': 25, 'h': 23, 'tilt': 0, 'iris': 1, 'y': 20, 'gap': 42, 'lashes': True, 'lidW': 7}, 'brows': {'thick': 6, 'dy': 0},
    'mouth': {'w': 16, 'y': 64}, 'nose': 'dot',
    'hair': {'template': 'short', 'strands': 4, 'parting': 0.5, 'ahoge': 'none', 'highlight': True, 'sideLen': 36},
    'palette': {'skin': 'fair', 'hair': 'black', 'top': 'blue', 'iris': 'blue'},
}

def with_params(theta):
    ch = json.loads(json.dumps(BASE))
    for (path, *_), v in zip(PARAMS, theta):
        a, b = path.split('.'); ch[a][b] = float(v)
    return ch

def get(ch, path):
    a, b = path.split('.'); return float(ch[a][b])

def model(ch, expression):
    r = subprocess.run(['node', str(ROOT / 'tools/fit/landmarks.ts')], input=json.dumps({'character': ch, 'expression': expression}), capture_output=True, text=True, check=True, cwd=ROOT)
    d = json.loads(r.stdout); return d['names'], np.array(d['points']), d['normalized'], d['violations']

def similarity(p, m, w):
    """Least squares s, t with m ~ s * p + t (weighted; no rotation)."""
    W = w[:, None]; pc = (p * W).sum(0) / w.sum(); mc = (m * W).sum(0) / w.sum()
    s = (W * (p - pc) * (m - mc)).sum() / (W * (p - pc) ** 2).sum()
    return s, mc - s * pc

def load_landmarks(a, b, names):
    P = np.zeros((len(names), 2)); sigma = np.full(len(names), np.inf); present = np.zeros(len(names), bool)
    for i, n in enumerate(names):
        if n in a['points'] and n in b['points']:
            x, y = np.array(a['points'][n], float), np.array(b['points'][n], float)
            P[i] = (x + y) / 2; present[i] = True
            sigma[i] = max(2.0, float(np.sqrt(((x - y) ** 2).mean() / 2)))  # per-coordinate std of two readings, floor 2 px
    if present.sum() < 2 or len(np.unique(P[present], axis=0)) < 2:
        raise ValueError("fitting needs at least two distinct landmarks visible in both readings")
    return P, sigma, present, a

def main(p1, p2, outdir, expression=None, *, reference_image, record=None, fixture=False, calibration=None, zoom=None):
    identity, a, b = fit_inputs(reference_image, record, (p1, p2), fixture)
    if identity["kind"] == "ai-generated":
        if calibration is None or zoom is None:
            raise ValueError("AI reference fitting requires --calibration and --zoom")
        from landmark_policy import POLICY_VERSION, qualified_points

        calibration_data, zoom_data = calibration.read_bytes(), zoom.read_bytes()
        allowed = qualified_points(a, b, json.loads(zoom_data), json.loads(calibration_data))
        identity.update(calibration_sha256=hashlib.sha256(calibration_data).hexdigest(),
                        zoom_sha256=hashlib.sha256(zoom_data).hexdigest(), landmark_policy=POLICY_VERSION,
                        excluded_by_policy=sorted(a["points"].keys() & b["points"].keys() - allowed))
        a, b = ({**reading, "points": {name: point for name, point in reading["points"].items() if name in allowed}}
                for reading in (a, b))
    if expression is not None and expression != a["expression"]:
        raise ValueError("requested expression differs from the landmark readings")
    expression = a["expression"]
    names, _, _, _ = model(BASE, 'neutral')
    P, sigma_px, present, meta = load_landmarks(a, b, names)
    out = Path(outdir); out.mkdir(parents=True, exist_ok=True)
    theta0 = np.array([get(BASE, p[0]) for p in PARAMS])
    # Uniform weights over the marked landmarks. (1/sigma^2 weights, with sigma at the 2 px floor, make the objective ill-conditioned: the model's misfit is tens of px,
    # the marking noise 2-8 px. The noise is used to REPORT residuals in sigma units, and for the gates (ADR 0002 D8), not to weight the search.)
    w = present.astype(float)
    def search(w):
        cache = {}
        def evaluate(theta):
            key = tuple(theta)
            if key not in cache:
                _, M, norm, viol = model(with_params(theta), expression)
                use = w > 0
                s_, t_ = similarity(P[use], M[use], w[use])
                r = (M - (s_ * P + t_)) / s_  # residual in image px (divide by the scale)
                c = float((w[:, None] * r ** 2).sum() + 1e6 * len(viol))
                cache[key] = (c, s_, t_, M, norm, viol)
            return cache[key]
        theta, best = theta0.copy(), evaluate(theta0)[0]
        for _round in range(10):
            improved = False
            for i, (path, plo, phi, step) in enumerate(PARAMS):
                for direction in (+1, -1):
                    k = 1
                    while True:
                        cand = theta.copy(); cand[i] = min(phi, max(plo, theta[i] + direction * k * step))
                        if cand[i] == theta[i]: break
                        c = evaluate(cand)[0]
                        if c < best - 1e-9: theta, best, improved = cand, c, True; k *= 2
                        else: break
            if not improved: break
        return theta, evaluate, len(cache)
    theta, evaluate, n1 = search(w)
    n2 = 0
    outliers = []
    c0, s0, t0, M0, norm0, viol0 = evaluate(theta0)
    cache = {'n': n1 + n2}
    c1, s1, t1, M1, norm1, viol1 = evaluate(theta)
    if viol1:
        raise SystemExit(f'the fitted character fails validate: {viol1}')
    def px_res(M, s, t):
        return np.sqrt((((M - (s * P + t)) / s) ** 2).sum(1))
    r0, r1 = px_res(M0, s0, t0), px_res(M1, s1, t1)
    def summary(r):
        rp = r[present]; z = (r / sigma_px)[present]
        return {'rms_px': float(np.sqrt((rp ** 2).mean())), 'max_px': float(rp.max()), 'argmax': [n for n, p in zip(names, present) if p][int(rp.argmax())],
                'rms_in_sigma': float(np.sqrt((z ** 2).mean())), 'rms_model_units': float(np.sqrt((rp ** 2).mean()) * s1)}
    drawn = {p[0]: get(norm1, p[0]) for p in PARAMS}
    requested = {p[0]: float(v) for p, v in zip(PARAMS, theta)}
    result = {
        **identity,
        'reference': meta['image'], 'expression': expression, 'nfev': n1, 'violations': viol1,
        'landmarks_used': [n for n, p in zip(names, present) if p], 'landmarks_missing': [n for n, p in zip(names, present) if not p],
        'sigma_px': {n: round(float(s), 1) for n, s, p in zip(names, sigma_px, present) if p},
        'baseline_young_default': summary(r0), 'fitted': summary(r1),
        'map': {'s': float(s1), 'tx': float(t1[0]), 'ty': float(t1[1])},
        'scale_px_per_model_unit': float(1 / s1),
        'drawn_params': drawn, 'requested_params': requested,
        'clamped_by': {k: {'requested': requested[k], 'drawn': drawn[k]} for k in drawn if abs(drawn[k] - requested[k]) > 1e-9},
        'at_bound': [p[0] for p in PARAMS if abs(drawn[p[0]] - p[1]) < 1e-9 or abs(drawn[p[0]] - p[2]) < 1e-9],
        'residual_px_by_landmark': {n: round(float(r), 1) for n, r, p in zip(names, r1, present) if p},
        'baseline_residual_px_by_landmark': {n: round(float(r), 1) for n, r, p in zip(names, r0, present) if p},
        'character': norm1,
    }
    fit_file = out / 'fit.json'
    fit_file.write_text(json.dumps(result, indent=2) + '\n')
    (out / 'derived.json').write_text(json.dumps({'derived': [{**identity, 'artifact': fit_file.name}]}, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['expression', 'nfev', 'baseline_young_default', 'fitted', 'scale_px_per_model_unit', 'drawn_params', 'clamped_by', 'at_bound']}, indent=2))
    print('worst:', sorted(result['residual_px_by_landmark'].items(), key=lambda kv: -kv[1])[:6])

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("first", type=Path)
    parser.add_argument("second", type=Path)
    parser.add_argument("outdir", type=Path)
    parser.add_argument("expression", nargs="?")
    parser.add_argument("--reference-image", required=True, type=Path)
    parser.add_argument("--record", type=Path)
    parser.add_argument("--fixture", action="store_true")
    parser.add_argument("--calibration", type=Path)
    parser.add_argument("--zoom", type=Path)
    args = parser.parse_args()
    try:
        main(args.first, args.second, args.outdir, args.expression,
             reference_image=args.reference_image, record=args.record, fixture=args.fixture,
             calibration=args.calibration, zoom=args.zoom)
    except ValidationError as error:
        field = ".".join(str(part) for part in error.absolute_path) or "record"
        parser.exit(2, f"Schema validation failed at {field} ({error.validator})\n")
    except (OSError, KeyError, TypeError, ValueError) as error:
        parser.exit(2, f"{error}\n")
