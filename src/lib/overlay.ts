import type { BoundingBox, Detection } from '../types/index.ts';

export interface ContentRect {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

export function findDetectionsForFrame(
  detections: Detection[],
  timestampSec: number,
  fps: number
): Detection[] {
  if (!detections.length || !Number.isFinite(timestampSec)) return [];

  let low = 0;
  let high = detections.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (detections[middle].timestampSec < timestampSec) low = middle + 1;
    else high = middle;
  }

  const candidates = [detections[low], detections[low - 1]].filter(Boolean);
  const nearestTime = candidates.reduce((nearest, item) =>
    Math.abs(item.timestampSec - timestampSec) < Math.abs(nearest - timestampSec)
      ? item.timestampSec
      : nearest,
    candidates[0].timestampSec
  );
  const frameTolerance = 0.5 / (Number.isFinite(fps) && fps > 0 ? fps : 25);
  if (Math.abs(nearestTime - timestampSec) > frameTolerance) return [];
  const anchor = detections[low].timestampSec === nearestTime ? low : low - 1;
  let first = anchor;
  while (first > 0 && detections[first - 1].timestampSec === nearestTime) first -= 1;
  let last = anchor;
  while (last + 1 < detections.length && detections[last + 1].timestampSec === nearestTime) last += 1;
  return detections.slice(first, last + 1).filter(item => item.timestampSec === nearestTime);
}

export function getObjectContainRect(
  videoWidth: number,
  videoHeight: number,
  elementWidth: number,
  elementHeight: number
): ContentRect {
  if ([videoWidth, videoHeight, elementWidth, elementHeight].some(value => !Number.isFinite(value) || value <= 0)) {
    return { width: 0, height: 0, offsetX: 0, offsetY: 0 };
  }

  const scale = Math.min(elementWidth / videoWidth, elementHeight / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return {
    width,
    height,
    offsetX: (elementWidth - width) / 2,
    offsetY: (elementHeight - height) / 2,
  };
}

export function normalizePixelBox(
  box: BoundingBox,
  frameWidth: number,
  frameHeight: number
): BoundingBox | null {
  if (!Number.isFinite(frameWidth) || !Number.isFinite(frameHeight) || frameWidth <= 0 || frameHeight <= 0) {
    return null;
  }
  const { x1, y1, x2, y2 } = box;
  if (
    ![x1, y1, x2, y2].every(Number.isFinite) ||
    x1 < 0 || y1 < 0 || x2 > frameWidth || y2 > frameHeight ||
    x2 <= x1 || y2 <= y1
  ) {
    return null;
  }
  return {
    x1: x1 / frameWidth,
    y1: y1 / frameHeight,
    x2: x2 / frameWidth,
    y2: y2 / frameHeight,
  };
}
