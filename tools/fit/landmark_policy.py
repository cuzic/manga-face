"""Apply the R4 calibration and zoom checks before a reference fit."""
import hashlib
import math

from landmark_calibration import generated_files, raster_digest, summarize, truth_digest
from vision_checkpoint import digest

OCCLUSION_REQUIRED = {"cheekL", "cheekR", "earL", "earR", "eyeL_outer", "eyeR_outer", "browL", "browR"}
LIMITS = {"min_visible": 2, "min_detection": 0.9, "max_rms_px": 2, "max_zoom_px": 3, "min_occluded": 2}
# Increment logic when changing the rules independently of their numeric limits.
POLICY_VERSION = digest({"logic": 4, "limits": LIMITS, "occlusion_required": sorted(OCCLUSION_REQUIRED)})


def qualified_points(first, second, zoom, report):
    if report.get("invalid_responses") != 0:
        raise ValueError("fit needs a calibration report without invalid responses")
    fixture_set = report.get("fixture_set") or {}
    rasters = {}
    current = generated_files()
    for reading in report["readings"]:
        name = reading.get("fixture")
        # Every reading of a fixture must carry the same raster, and the SVG the current generator writes.
        if (rasters.setdefault(name, reading.get("png_sha256")) != reading.get("png_sha256")
               
                or reading.get("svg_sha256") != hashlib.sha256(current.get(f"{name}.svg", b"")).hexdigest()):
            raise ValueError("calibration report was made for a different fixture set; calibrate again")
    if (fixture_set.get("truth_sha256") != truth_digest(current)
            or fixture_set.get("raster_sha256") != raster_digest(rasters)):
        raise ValueError("calibration report was made for a different fixture set; calibrate again")
    model = first["model_version"]
    configuration = first["sent_configuration_sha256"]
    if (len(configuration) != 64 or report["model_version"] != model
            or second["model_version"] != model or second["sent_configuration_sha256"] != configuration
            or any(reading.get("source_size") != reading["size"] for reading in (first, second))):
        raise ValueError("fit needs two readings from the calibrated configuration")
    bound_fields = ("reference_id", "image_sha256", "record_sha256", "image", "size", "position", "origin", "expression")
    if (zoom.get("pass") != "zoom" or zoom.get("model_version") != model
            or zoom.get("sent_configuration_sha256") != configuration
            or zoom.get("source_size") != [dimension * 2 for dimension in first["size"]]
            or any(zoom.get(field) != first[field] for field in bound_fields)
            or not zoom.get("inference_id") or zoom["inference_id"] in {first["inference_id"], second["inference_id"]}):
        raise ValueError("zoom reading does not match the fitted reference")
    metrics = [reading["metrics"] for reading in report["readings"]
               if reading.get("sent_configuration_sha256") == configuration and reading.get("size") == first["size"]]
    if len(metrics) < 2:
        raise ValueError("fit needs repeated calibration of the configuration used for this expression")
    stats = summarize(metrics)
    allowed = set()
    for name in first["points"].keys() & second["points"].keys() & zoom["points"].keys():
        item = stats[name]
        if (item["visible_readings"] >= LIMITS["min_visible"] and item["detection_rate"] >= LIMITS["min_detection"]
                and item["rms_px"] is not None and item["rms_px"] <= LIMITS["max_rms_px"]
                and item["false_positive_on_occluded"] == 0
                and (name not in OCCLUSION_REQUIRED or item["occluded_readings"] >= LIMITS["min_occluded"])
                and all(math.dist(reading["points"][name], zoom["points"][name]) <= LIMITS["max_zoom_px"]
                        for reading in (first, second))):
            allowed.add(name)
    return allowed
