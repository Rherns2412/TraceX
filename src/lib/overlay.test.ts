import assert from 'node:assert/strict';
import test from 'node:test';
import { findDetectionsForFrame, getObjectContainRect, normalizePixelBox } from './overlay.ts';
import type { Detection } from '../types/index.ts';

const detection = (frameIdx: number, timestampSec: number): Detection => ({
  id: `d-${frameIdx}`,
  frameIdx,
  timestampSec,
  frameWidth: 360,
  frameHeight: 288,
  bbox: { x1: 0.1, y1: 0.2, x2: 0.4, y2: 0.8 },
  bboxPixels: { x1: 36, y1: 57.6, x2: 144, y2: 230.4 },
  confidence: 0.9,
  localTrackId: 'cam-1-track-1',
});

test('selects detections from only the nearest exact frame and supports forward/backward seeking', () => {
  const rows = [detection(0, 0), detection(1, 0.04), detection(2, 0.08)];
  assert.deepEqual(findDetectionsForFrame(rows, 0.079, 25).map(item => item.frameIdx), [2]);
  assert.deepEqual(findDetectionsForFrame(rows, 0.001, 25).map(item => item.frameIdx), [0]);
  assert.deepEqual(findDetectionsForFrame(rows, 0.061, 25).map(item => item.frameIdx), [2]);
  assert.deepEqual(findDetectionsForFrame(rows, 0.1, 25), []);
});

test('returns no boxes for a processed empty frame or timestamp outside a frame interval', () => {
  const rows = [detection(3, 0.12), detection(5, 0.2)];
  assert.deepEqual(findDetectionsForFrame(rows, 0.16, 25), []);
});

test('computes object-contain content bounds without stretching an overlay', () => {
  assert.deepEqual(getObjectContainRect(360, 288, 640, 360), {
    width: 450,
    height: 360,
    offsetX: 95,
    offsetY: 0,
  });
  assert.deepEqual(getObjectContainRect(360, 288, 0, 360), {
    width: 0,
    height: 0,
    offsetX: 0,
    offsetY: 0,
  });
});

test('converts original-frame pixel coordinates only when the box is valid', () => {
  assert.deepEqual(normalizePixelBox({ x1: 36, y1: 28.8, x2: 180, y2: 230.4 }, 360, 288), {
    x1: 0.1,
    y1: 0.1,
    x2: 0.5,
    y2: 0.8,
  });
  assert.equal(normalizePixelBox({ x1: 30, y1: 20, x2: 400, y2: 100 }, 360, 288), null);
  assert.equal(normalizePixelBox({ x1: 40, y1: 20, x2: 40, y2: 100 }, 360, 288), null);
});
