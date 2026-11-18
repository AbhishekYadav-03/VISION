#!/usr/bin/env python3
"""Long-lived face processing worker.

The Node API keeps this process alive and talks to it over newline-delimited
JSON on stdin/stdout. Loading the InsightFace model is the expensive part of
face extraction (seconds), so it is done exactly once per server lifetime
instead of once per upload.

Protocol
--------
request  : {"id": 1, "cmd": "extract", "path": "C:/tmp/photo.jpg"}
           {"id": 2, "cmd": "crop", "path": "...", "bbox": [x1,y1,x2,y2], "out": "..."}
           {"id": 3, "cmd": "ping"}
           {"id": 4, "cmd": "shutdown"}
response : {"id": 1, "ok": true, "count": 1, "faces": [{"bbox": [...], "embedding": [...]}]}
           {"type": "ready", "model": "buffalo_l", ...}
           {"id": 1, "ok": false, "error": "...", "errorType": "..."}

Only protocol messages are written to the real stdout. Anything InsightFace
or OpenCV print is redirected to stderr so it can never corrupt the stream.
"""

import json
import os
import sys
import traceback

_PROTOCOL = sys.stdout
sys.stdout = sys.stderr


def send(payload):
    try:
        _PROTOCOL.write(json.dumps(payload, separators=(",", ":")) + "\n")
        _PROTOCOL.flush()
    except (BrokenPipeError, OSError):
        raise SystemExit(0)


def load_settings():
    return {
        "model": os.environ.get("FACE_MODEL", "buffalo_l"),
        "ctx_id": int(os.environ.get("FACE_CTX_ID", "-1")),
        "det_size": int(os.environ.get("FACE_DET_SIZE", "640")),
        "crop_padding": int(os.environ.get("FACE_CROP_PADDING", "40")),
        "avatar_size": int(os.environ.get("FACE_AVATAR_SIZE", "256")),
    }


def build_app(settings, cv2):
    from insightface.app import FaceAnalysis

    providers = ["CPUExecutionProvider"]
    if settings["ctx_id"] >= 0:
        providers.insert(0, "CUDAExecutionProvider")

    app = FaceAnalysis(name=settings["model"], providers=providers)
    app.prepare(
        ctx_id=settings["ctx_id"],
        det_size=(settings["det_size"], settings["det_size"]),
    )
    return app


def read_image(cv2, path):
    image = cv2.imread(path)
    if image is None:
        raise FileNotFoundError(f"Could not read image: {path}")
    return image


def handle_extract(app, cv2, request):
    image = read_image(cv2, request["path"])
    faces = app.get(image)
    result = [
        {"bbox": face.bbox.tolist(), "embedding": face.embedding.tolist()}
        for face in faces
    ]
    return {"ok": True, "count": len(result), "faces": result}


def handle_crop(app, cv2, request, settings):
    image = read_image(cv2, request["path"])
    height, width = image.shape[:2]

    x1, y1, x2, y2 = (int(float(value)) for value in request["bbox"])
    padding = settings["crop_padding"]

    x1 = max(0, min(width - 1, x1 - padding))
    y1 = max(0, min(height - 1, y1 - padding))
    x2 = max(x1 + 1, min(width, x2 + padding))
    y2 = max(y1 + 1, min(height, y2 + padding))

    crop = image[y1:y2, x1:x2]
    if crop.size == 0:
        raise ValueError("Face crop is empty")

    size = settings["avatar_size"]
    crop = cv2.resize(crop, (size, size), interpolation=cv2.INTER_AREA)

    out_path = request["out"]
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    if not cv2.imwrite(out_path, crop):
        raise OSError(f"Could not write avatar: {out_path}")

    return {"ok": True, "out": out_path}


def main():
    try:
        import cv2
    except Exception as exc:  # pragma: no cover - environment failure
        send({"type": "fatal", "error": f"OpenCV could not be imported: {exc}"})
        return 1

    settings = load_settings()

    try:
        app = build_app(settings, cv2)
    except Exception as exc:  # pragma: no cover - model/environment failure
        send({
            "type": "fatal",
            "error": f"InsightFace could not be initialised: {exc}",
            "detail": traceback.format_exc(limit=3),
        })
        return 1

    send({
        "type": "ready",
        "model": settings["model"],
        "ctx_id": settings["ctx_id"],
        "det_size": settings["det_size"],
    })

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
        except json.JSONDecodeError as exc:
            send({"ok": False, "error": f"Invalid JSON request: {exc}"})
            continue

        request_id = request.get("id")
        command = request.get("cmd")

        if command == "shutdown":
            send({"id": request_id, "ok": True})
            break

        try:
            if command == "ping":
                response = {"ok": True, "ready": True}
            elif command == "extract":
                response = handle_extract(app, cv2, request)
            elif command == "crop":
                response = handle_crop(app, cv2, request, settings)
            else:
                response = {"ok": False, "error": f"Unknown command: {command!r}"}
        except Exception as exc:
            response = {
                "ok": False,
                "error": str(exc),
                "errorType": type(exc).__name__,
            }

        response["id"] = request_id
        response.setdefault("ok", False)
        send(response)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
