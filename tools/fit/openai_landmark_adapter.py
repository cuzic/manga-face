"""Read one R4 request from stdin and return one Responses API reading."""
import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ENDPOINT = "https://api.openai.com/v1/responses"


def request_body(task):
    instruction, definition_text = task["prompt"].split("\n", 1)
    names = tuple(json.loads(definition_text))
    mark = {
        "type": "object",
        "properties": {
            "x": {"type": ["integer", "null"]},
            "y": {"type": ["integer", "null"]},
            "reason": {"type": ["string", "null"]},
        },
        "required": ["x", "y", "reason"],
        "additionalProperties": False,
    }
    schema = {
        "type": "object",
        "properties": {name: mark for name in names},
        "required": list(names),
        "additionalProperties": False,
    }
    width, height = task["size"]
    prompt = (
        f"{instruction.split('Return points and missing objects.')[0]}\n"
        f"Source dimensions: {width} × {height} pixels. For each point return "
        f"integer x and y and null reason, or null x and y with a missing reason.\n{definition_text}"
    )
    return {
        "model": task["model_version"],
        "store": False,
        "max_output_tokens": 2000,
        "input": [{"role": "user", "content": [
            {"type": "input_text", "text": prompt},
            {"type": "input_image", "image_url": "data:image/png;base64," + task["image_png_base64"],
             "detail": "high"},
        ]}],
        "text": {"format": {"type": "json_schema", "name": "landmark_reading", "strict": True, "schema": schema}},
    }


def parse_reading(response, model, names):
    if response.get("status") != "completed":
        raise ValueError("vision response did not complete")
    if response.get("model") != model:
        raise ValueError("vision response did not return the configured model snapshot")
    messages = [item for output in response["output"] if output["type"] == "message"
                for item in output["content"]]
    if any(item["type"] == "refusal" for item in messages):
        raise ValueError("vision model refused the image")
    text = [item["text"] for item in messages if item["type"] == "output_text"]
    if len(text) != 1:
        raise ValueError("expected one structured landmark response")
    reading = json.loads(text[0])
    if reading.keys() != set(names):
        raise ValueError("vision response is missing requested landmarks")
    points, missing = {}, {}
    for name, item in reading.items():
        x, y, reason = item["x"], item["y"], item["reason"]
        if type(x) is int and type(y) is int and reason is None:
            points[name] = [x, y]
        elif x is None and y is None and isinstance(reason, str) and reason.strip():
            missing[name] = reason
        else:
            raise ValueError("vision model returned an inconsistent point")
    return {"model_version": model, "inference_id": response["id"], "points": points, "missing": missing}


def main(task, key):
    body = request_body(task)
    request = Request(ENDPOINT, data=json.dumps(body).encode(), headers={
        "Authorization": f"Bearer {key}", "Content-Type": "application/json",
    })
    with urlopen(request, timeout=90) as response:
        raw = json.load(response)
    return parse_reading(raw, body["model"], body["text"]["format"]["schema"]["required"])


if __name__ == "__main__":
    try:
        if not (credential := os.environ.get("OPENAI_API_KEY")):
            raise ValueError("set OPENAI_API_KEY in the process environment")
        json.dump(main(json.load(sys.stdin), credential), sys.stdout)
    except HTTPError as error:
        raise SystemExit(f"Responses API HTTP {error.code}") from None
    except (URLError, TimeoutError):
        raise SystemExit("Responses API transport failed") from None
    except (KeyError, TypeError, ValueError) as error:
        raise SystemExit(str(error)) from None
