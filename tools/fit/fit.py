"""Stage (a) of ADR 0002 D4: a landmark least-squares fit of the parametric model to the hand-marked landmarks of a reference.
usage: python tools/fit/fit.py <landmarks.json> <outdir>
Unknowns: a global map image -> model (scale s, shift tx, ty; no rotation, the references are frontal; closed form for given parameters) and 9 model parameters (cheek, chin, eyes.w/h/y/gap, brows.dy, mouth.w/y).
The model's landmarks come from `node tools/fit/landmarks.ts`, so the numbers are the TypeScript model's own (no second copy of the formulas).
Deterministic: a coordinate descent on the parameter grid (the model snaps parameters to the steps of RANGES, so there is no gradient), from the young default.
"""
import sys, json, subprocess
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
PARAMS = [  # (path, lo, hi): the ranges of src/params.ts RANGES
    ('head.cheek', 74, 96), ('head.chin', 90, 98), ('eyes.w', 18, 28), ('eyes.h', 13, 26), ('eyes.y', 14, 28), ('eyes.gap', 36, 48),
    ('brows.dy', -20, 8), ('mouth.w', 10, 48), ('mouth.y', 58, 70),
]
BASE = {  # the young default (src/styles.ts DIRECTIONS.young + defaultCharacter)
    'id': 'fit', 'name': 'fit', 'head': {'cheek': 86, 'chin': 96, 'jaw': 0.65, 'chinW': 4},
    'eyes': {'w': 25, 'h': 23, 'tilt': 0, 'iris': 1, 'y': 20, 'gap': 42, 'lashes': True, 'lidW': 7}, 'brows': {'thick': 6, 'dy': 0},
    'mouth': {'w': 16, 'y': 64}, 'nose': 'dot',
    'hair': {'template': 'short', 'strands': 4, 'parting': 0.5, 'ahoge': 'none', 'highlight': True, 'sideLen': 36},
    'palette': {'skin': 'fair', 'hair': 'black', 'top': 'blue', 'iris': 'blue'},
}

def with_params(theta):
    ch = json.loads(json.dumps(BASE))
    for (path, _, _), v in zip(PARAMS, theta):
        a, b = path.split('.'); ch[a][b] = float(v)
    return ch

def model_landmarks(ch):
    r = subprocess.run(['node', str(ROOT / 'tools/fit/landmarks.ts')], input=json.dumps({'character': ch}), capture_output=True, text=True, check=True, cwd=ROOT)
    d = json.loads(r.stdout); return d['names'], np.array(d['points'])

def similarity(p, m, w):
    """Least squares s, t with m ~ s * p + t (weighted; no rotation)."""
    W = w[:, None]; pc = (p * W).sum(0) / w.sum(); mc = (m * W).sum(0) / w.sum()
    s = (W * (p - pc) * (m - mc)).sum() / (W * (p - pc) ** 2).sum()
    return s, mc - s * pc

def main(lm_path, outdir):
    out = Path(outdir); out.mkdir(parents=True, exist_ok=True)
    lm = json.loads(Path(lm_path).read_text())
    names, _ = model_landmarks(BASE)
    P = np.array([lm['points'][n] for n in names], float)
    w = np.array([lm.get('weights', {}).get(n, 1.0) for n in names], float)
    theta0 = np.array([float(BASE[a][b]) for (path, _, _) in PARAMS for a, b in [path.split('.')]])
    # baseline: only the global map is fitted; the model keeps the young default
    _, M0 = model_landmarks(BASE); s0, t0 = similarity(P, M0, w)
    res0 = M0 - (s0 * P + t0)
    # The model snaps its parameters to the steps of RANGES, so the objective is piecewise constant: no gradient. Given the parameters, the best global map
    # is the closed-form weighted similarity, so the search runs over the parameters only: a deterministic coordinate descent on the step grid.
    STEP = {'head.cheek': 2, 'head.chin': 1, 'eyes.w': 1, 'eyes.h': 1, 'eyes.y': 1, 'eyes.gap': 1, 'brows.dy': 1, 'mouth.w': 1, 'mouth.y': 1}
    cache = {}
    def cost(theta):
        key = tuple(theta)
        if key not in cache:
            _, M = model_landmarks(with_params(theta)); s_, t_ = similarity(P, M, w)
            r = (M - (s_ * P + t_)) * np.sqrt(w)[:, None]; cache[key] = (float((r ** 2).sum()), s_, t_)
        return cache[key][0]
    theta = theta0.copy(); best = cost(theta); evals = 0
    for _round in range(8):
        improved = False
        for i, (path, plo, phi) in enumerate(PARAMS):
            for direction in (+1, -1):
                k = 1
                while True:
                    cand = theta.copy(); cand[i] = min(phi, max(plo, theta[i] + direction * k * STEP[path]))
                    if cand[i] == theta[i]: break
                    c = cost(cand)
                    if c < best - 1e-9: theta, best, improved = cand, c, True; k *= 2
                    else: break
        if not improved: break
    _, s, t = (best, cache[tuple(theta)][1], cache[tuple(theta)][2])
    class Sol: pass
    sol = Sol(); sol.nfev = len(cache); sol.cost = best / 2; sol.x = np.concatenate([[s, t[0], t[1]], theta])
    s, tx, ty = sol.x[:3]; ch = with_params(sol.x[3:]); _, M = model_landmarks(ch)
    res = M - (s * P + np.array([tx, ty]))
    def summary(r, scale=1.0):
        d = np.sqrt((r ** 2).sum(1)); return {'rms': float(np.sqrt((d ** 2).mean())), 'max': float(d.max()), 'argmax': names[int(d.argmax())]}
    result = {
        'reference': lm['image'], 'unit': 'model units (the head circle has r = 100)', 'nfev': int(sol.nfev), 'cost': float(sol.cost),
        'baseline_young_default': summary(res0), 'fitted': summary(res),
        'map': {'s': float(s), 'tx': float(tx), 'ty': float(ty)},
        'params': {p[0]: round(float(v), 2) for p, v in zip(PARAMS, sol.x[3:])},
        'at_bound': [p[0] for p, v in zip(PARAMS, sol.x[3:]) if abs(v - p[1]) < 1e-6 or abs(v - p[2]) < 1e-6],
        'residual_by_landmark': {n: round(float(np.sqrt((r ** 2).sum())), 1) for n, r in zip(names, res)},
        'baseline_residual_by_landmark': {n: round(float(np.sqrt((r ** 2).sum())), 1) for n, r in zip(names, res0)},
        'character': ch,
    }
    (out / 'fit.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['nfev', 'baseline_young_default', 'fitted', 'map', 'params', 'at_bound']}, indent=2))
    print('worst landmarks after fit:', sorted(result['residual_by_landmark'].items(), key=lambda kv: -kv[1])[:5])

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
