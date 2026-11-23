"""Generate known-coordinate face fixtures or score recognition JSON for one fixture."""
import argparse
import hashlib
import json
import math
from pathlib import Path
from statistics import mean

POINTS = {
    'chin': (160, 224), 'cheekL': (88, 144), 'cheekR': (232, 144),
    'earL': (69, 143), 'earR': (251, 143),
    'eyeL_outer': (100, 124), 'eyeL_inner': (140, 124),
    'eyeR_inner': (180, 124), 'eyeR_outer': (220, 124),
    'eyeL_top': (120, 112), 'eyeL_bottom': (120, 136),
    'eyeR_top': (200, 112), 'eyeR_bottom': (200, 136),
    'browL': (120, 100), 'browR': (200, 100),
    'noseTip': (160, 158), 'mouthL': (140, 185), 'mouthR': (180, 185), 'mouthC': (160, 185),
}
FACE = '''<ellipse cx="80" cy="143" rx="11" ry="15" fill="white"/>
<ellipse cx="240" cy="143" rx="11" ry="15" fill="white"/>
<ellipse cx="160" cy="144" rx="72" ry="80" fill="white"/>
<ellipse cx="120" cy="124" rx="20" ry="12" fill="white"/>
<ellipse cx="200" cy="124" rx="20" ry="12" fill="white"/>
<path d="M107 100h26m54 0h26 M140 185h40" />
<path d="M155 151l5 7" />
<circle cx="120" cy="124" r="6" fill="#151515"/>
<circle cx="200" cy="124" r="6" fill="#151515"/>'''
OCCLUSION = '<path d="M88 82 Q108 53 137 68 Q152 81 144 114 L126 102 Q112 118 94 117 Q101 99 88 82Z" fill="white"/>'


BASE_CASES = ("neutral", "translated", "scaled-occluded")
HAIR_CASES = {
    "left-side-hidden": ('<path d="M52 82 Q96 52 140 66 Q142 86 139 110 L115 108 L105 135 Q96 156 61 165 Q62 130 52 82Z" fill="white"/>',
                         {"cheekL", "earL", "eyeL_outer", "browL"}),
    "right-side-hidden": ('<g transform="translate(320 0) scale(-1 1)"><path d="M52 82 Q96 52 140 66 Q142 86 139 110 L115 108 L105 135 Q96 156 61 165 Q62 130 52 82Z" fill="white"/></g>',
                          {"cheekR", "earR", "eyeR_outer", "browR"}),
}

EXPRESSION_CASES = {
    "smile": (
        FACE.replace('M140 185h40', '')
            + '<ellipse cx="160" cy="185" rx="23" ry="8" />',
        {"mouthL": (137, 185), "mouthR": (183, 185)},
    ),
    "angry": (
        FACE.replace('M107 100h26m54 0h26 M140 185h40',
                     'M107 94l26 12 M187 106l26-12')
            + '<ellipse cx="160" cy="185" rx="14" ry="3" />',
        {"mouthL": (146, 185), "mouthR": (174, 185)},
    ),
}


def case_names(name):
    if name not in EXPRESSION_CASES and not name.startswith("expression-"):
        return POINTS.keys()
    return POINTS.keys() - {"chin", "cheekL", "cheekR", "earL", "earR", "noseTip"}


def generate(output):
    output.mkdir(parents=True, exist_ok=True)
    for name, scale, dx, dy, hidden in (
        ('neutral', 1, 0, 0, False),
        ('translated', 1, 36, 24, False),
        ('scaled-occluded', 1.25, 5, 16, True),
        ('smile', 1, 15, 10, False),
        ('angry', 1, 20, 18, False),
        ('left-side-hidden', 1, 20, 18, False),
        ('right-side-hidden', 1, 20, 18, False),
        ('expression-left-side-hidden', 1, 20, 18, False),
        ('expression-right-side-hidden', 1, 20, 18, False),
    ):
        cover, hidden_names = HAIR_CASES.get(name.removeprefix("expression-"), (OCCLUSION, {'browL'}) if hidden else ('', set()))
        expression = {"expression-left-side-hidden": "angry", "expression-right-side-hidden": "smile"}.get(name, name)
        face, changes = EXPRESSION_CASES.get(expression, (FACE, {}))
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="408" height="408" viewBox="0 0 408 408"><rect width="408" height="408" fill="white"/><g transform="translate({dx} {dy}) scale({scale})" fill="none" stroke="#151515" stroke-width="1">{face}{cover}</g></svg>\n'
        image = output / f'{name}.svg'
        image.write_text(svg)
        points = {key: [x * scale + dx, y * scale + dy] for key, (x, y) in (POINTS | changes).items()
                  if key in case_names(name) and key not in hidden_names}
        record = dict(image_sha256=hashlib.sha256(image.read_bytes()).hexdigest(),
                      size=[408, 408], points=points, missing=sorted(hidden_names & case_names(name)))
        image.with_suffix('.truth.json').write_text(json.dumps(record, indent=2) + '\n')


def score(truth, prediction):
    if prediction['image_sha256'] != truth['image_sha256'] or prediction['size'] != truth['size']:
        raise ValueError('prediction does not identify the calibration image')
    points, missing = prediction['points'], prediction['missing']
    if points.keys() & set(missing) or points.keys() | set(missing) != truth['points'].keys() | set(truth['missing']):
        raise ValueError('each landmark must be marked or declared missing exactly once')
    width, height = truth['size']
    for point in points.values():
        if (len(point) != 2 or any(type(value) is not int for value in point)
                or not (0 <= point[0] < width and 0 <= point[1] < height)):
            raise ValueError('coordinate must be an integer pair within the image')
    expected = truth['points']
    errors = {name: math.dist(expected[name], points[name]) for name in sorted(points.keys() & expected.keys())}
    return {
        'visible_landmarks': len(expected), 'detected_visible': len(errors),
        'detection_rate': len(errors) / len(expected),
        'false_positive_on_occluded': sorted(points.keys() - expected.keys()),
        'missed_visible': sorted(expected.keys() - points.keys()),
        'occluded': truth['missing'],
        'rms_px': math.sqrt(mean(value ** 2 for value in errors.values())) if errors else None,
        'error_px': errors,
    }


def summarize(scores):
    """Aggregate accuracy without counting an occlusion as a missed visible point."""
    summary = {}
    for name in POINTS:
        errors = [score["error_px"][name] for score in scores if name in score["error_px"]]
        missed = sum(name in score["missed_visible"] for score in scores)
        false_positives = sum(name in score["false_positive_on_occluded"] for score in scores)
        visible = len(errors) + missed
        occluded = sum(name in score.get("occluded", ()) for score in scores)
        summary[name] = {
            "visible_readings": visible,
            "detected_visible": len(errors),
            "detection_rate": len(errors) / visible if visible else None,
            "occluded_readings": occluded,
            "false_positive_on_occluded": false_positives,
            "rms_px": math.sqrt(mean(error ** 2 for error in errors)) if errors else None,
            "max_px": max(errors, default=None),
        }
    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('generate').add_argument('output', type=Path)
    score_parser = commands.add_parser('score')
    score_parser.add_argument('truth', type=Path)
    score_parser.add_argument('prediction', type=Path)
    args = parser.parse_args()
    try:
        if args.command == 'generate':
            generate(args.output)
        else:
            truth, prediction = (json.loads(path.read_text()) for path in (args.truth, args.prediction))
            print(json.dumps(score(truth, prediction), indent=2))
    except (OSError, KeyError, TypeError, ValueError) as error:
        parser.exit(2, f'{error}\n')
