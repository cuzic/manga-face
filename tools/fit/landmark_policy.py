"""Apply the R4 calibration and zoom checks before a reference fit."""
import math

from landmark_calibration import summarize


def qualified_points(first, second, zoom, report):
    model = first["model_version"]
    configuration = first["sent_configuration_sha256"]
    if (len(configuration) != 64 or report["model_version"] != model
            or second["model_version"] != model or second["sent_configuration_sha256"] != configuration):
        raise ValueError("fit needs two readings from the calibrated configuration")
    bound_fields = ("reference_id", "image_sha256", "record_sha256", "image", "size", "position", "origin", "expression")
    if (zoom.get("pass") != "zoom" or zoom.get("model_version") != model
            or any(zoom.get(field) != first[field] for field in bound_fields)
            or not zoom.get("inference_id") or zoom["inference_id"] in {first["inference_id"], second["inference_id"]}):
        raise ValueError("zoom reading does not match the fitted reference")
    metrics = [reading["metrics"] for reading in report["readings"]
               if reading.get("sent_configuration_sha256") == configuration]
    if len(metrics) < 2:
        raise ValueError("fit needs repeated calibration of the configuration used for this expression")
    stats = summarize(metrics)
    allowed = set()
    for name in first["points"].keys() & second["points"].keys() & zoom["points"].keys():
        item = stats[name]
        if (item["visible_readings"] >= 2 and item["detection_rate"] >= 0.9
                and item["rms_px"] is not None and item["rms_px"] <= 2
                and item["false_positive_on_occluded"] == 0
                and all(math.dist(reading["points"][name], zoom["points"][name]) <= 3
                        for reading in (first, second))):
            allowed.add(name)
    return allowed
