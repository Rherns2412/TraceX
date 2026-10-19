#!/usr/bin/env python3
"""Offline per-frame person detection and same-camera ByteTrack association."""

from __future__ import annotations

import argparse
import json
import math
import os
import signal
import sys
import time
from pathlib import Path
from typing import Any, Callable

import torch
import cv2
from ultralytics import YOLO


cancel_requested = False


def request_cancel(_signal: int, _frame: Any) -> None:
    global cancel_requested
    cancel_requested = True


def emit(event: dict[str, Any]) -> None:
    print(json.dumps(event, separators=(",", ":"), allow_nan=False), flush=True)


def valid_box(xyxy: list[float], frame_width: int, frame_height: int) -> bool:
    if len(xyxy) != 4 or not all(math.isfinite(value) for value in xyxy):
        return False
    x1, y1, x2, y2 = xyxy
    return 0 <= x1 < x2 <= frame_width and 0 <= y1 < y2 <= frame_height


def process_video(
    video_path: str,
    camera_id: str,
    model_path: str,
    confidence: float,
    image_size: int,
    emit_event: Callable[[dict[str, Any]], None] = emit,
    capture_factory: Callable[[str], Any] = cv2.VideoCapture,
    model_factory: Callable[[str], Any] = YOLO,
) -> dict[str, Any]:
    capture = capture_factory(video_path)
    if not capture.isOpened():
        capture.release()
        raise RuntimeError(f"Video decoder could not open {video_path}.")

    fps = float(capture.get(cv2.CAP_PROP_FPS))
    total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if not math.isfinite(fps) or fps <= 0:
        capture.release()
        raise RuntimeError("Video metadata did not contain a valid FPS.")
    if frame_width <= 0 or frame_height <= 0:
        capture.release()
        raise RuntimeError("Video metadata did not contain valid frame dimensions.")

    emit_event({"type": "stage", "stage": f"Loading {Path(model_path).name} person detector and ByteTrack…"})
    model = model_factory(model_path)
    emit_event({
        "type": "metadata",
        "fps": fps,
        "totalFrames": max(0, total_frames),
        "frameWidth": frame_width,
        "frameHeight": frame_height,
        "model": Path(model_path).name,
        "tracker": "ByteTrack",
        "device": "cuda" if torch.cuda.is_available() else "cpu",
        "confidence": confidence,
        "imageSize": image_size,
    })

    start_time = time.perf_counter()
    frame_idx = 0
    frames_with_detections = 0
    total_detections = 0
    previous_timestamp = -1.0
    try:
        while not cancel_requested:
            success, frame = capture.read()
            if not success:
                break

            height, width = frame.shape[:2]
            if width <= 0 or height <= 0:
                raise RuntimeError(f"Decoder returned invalid dimensions for frame {frame_idx}.")
            if width != frame_width or height != frame_height:
                frame_width, frame_height = width, height

            timestamp = float(capture.get(cv2.CAP_PROP_POS_MSEC)) / 1000.0
            if not math.isfinite(timestamp) or timestamp < 0 or (frame_idx > 0 and timestamp <= previous_timestamp):
                timestamp = frame_idx / fps
            previous_timestamp = timestamp

            result = model.track(
                frame,
                persist=True,
                tracker="bytetrack.yaml",
                classes=[0],
                conf=confidence,
                imgsz=image_size,
                verbose=False,
            )[0]
            detections: list[dict[str, Any]] = []
            boxes = result.boxes
            if boxes is not None and len(boxes) > 0:
                pixel_boxes = boxes.xyxy.cpu().tolist()
                scores = boxes.conf.cpu().tolist()
                track_ids = boxes.id.int().cpu().tolist() if boxes.id is not None else [None] * len(pixel_boxes)

                for box_index, (coordinates, score, track_id) in enumerate(zip(pixel_boxes, scores, track_ids)):
                    coordinates = [float(value) for value in coordinates]
                    if not valid_box(coordinates, width, height):
                        continue
                    x1, y1, x2, y2 = coordinates
                    detections.append({
                        "id": f"{camera_id}:{frame_idx}:{box_index}",
                        "frameIdx": frame_idx,
                        "timestampSec": timestamp,
                        "frameWidth": width,
                        "frameHeight": height,
                        "bbox": {
                            "x1": x1 / width,
                            "y1": y1 / height,
                            "x2": x2 / width,
                            "y2": y2 / height,
                        },
                        "bboxPixels": {
                            "x1": x1,
                            "y1": y1,
                            "x2": x2,
                            "y2": y2,
                        },
                        "confidence": float(score),
                        "localTrackId": f"{camera_id}-track-{track_id}" if track_id is not None else "",
                    })

            if detections:
                frames_with_detections += 1
                total_detections += len(detections)
            frame_idx += 1
            emit_event({
                "type": "frame",
                "frameIdx": frame_idx - 1,
                "timestampSec": timestamp,
                "detections": detections,
                "framesWithDetections": frames_with_detections,
                "totalDetections": total_detections,
                "elapsedSec": time.perf_counter() - start_time,
                "totalFrames": max(0, total_frames),
            })

        if not cancel_requested and total_frames > 0 and frame_idx != total_frames:
            raise RuntimeError(f"Decoded {frame_idx} frames, but video metadata reports {total_frames}; refusing partial results.")
    finally:
        capture.release()

    elapsed = time.perf_counter() - start_time
    summary = {
        "type": "cancelled" if cancel_requested else "complete",
        "framesProcessed": frame_idx,
        "framesWithDetections": frames_with_detections,
        "totalDetections": total_detections,
        "processingTimeSec": elapsed,
        "fps": fps,
        "totalFrames": max(total_frames, frame_idx),
    }
    emit_event(summary)
    return summary


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--camera-id", required=True)
    parser.add_argument("--model", default=os.environ.get("TRACEX_MODEL", "yolo11n.pt"))
    parser.add_argument("--confidence", type=float, default=float(os.environ.get("TRACEX_CONFIDENCE", "0.4")))
    parser.add_argument("--imgsz", type=int, default=int(os.environ.get("TRACEX_IMAGE_SIZE", "640")))
    args = parser.parse_args()
    if not 0.1 <= args.confidence <= 0.9:
        parser.error("--confidence must be between 0.1 and 0.9")
    if args.imgsz < 320 or args.imgsz > 1280:
        parser.error("--imgsz must be between 320 and 1280")
    signal.signal(signal.SIGTERM, request_cancel)
    signal.signal(signal.SIGINT, request_cancel)
    try:
        process_video(args.video, args.camera_id, args.model, args.confidence, args.imgsz)
        return 0
    except Exception as error:
        emit({"type": "error", "message": str(error)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
