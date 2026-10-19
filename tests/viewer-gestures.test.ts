import assert from "node:assert/strict";
import test from "node:test";
import {
  WheelGestures,
  fromTrackpad,
  type WheelInput,
} from "../src/features/model-viewer/gestures";

function wheel(event: Partial<WheelInput>): WheelInput {
  return {
    deltaMode: 0,
    deltaX: 0,
    deltaY: 0,
    ctrlKey: false,
    shiftKey: false,
    ...event,
  };
}

test("notched mouse wheels still zoom", () => {
  // Chromium on Windows: 100 px a notch at 100%, other sizes under display
  // or browser zoom, but always 120 legacy units a notch.
  assert.equal(fromTrackpad(wheel({ deltaY: 100, wheelDeltaY: -120 })), false);
  assert.equal(
    fromTrackpad(wheel({ deltaY: 90.909, wheelDeltaY: -120 })),
    false,
  );
  assert.equal(fromTrackpad(wheel({ deltaY: -250, wheelDeltaY: 240 })), false);
  // Firefox scrolls a wheel by lines.
  assert.equal(fromTrackpad(wheel({ deltaMode: 1, deltaY: 3 })), false);
  // macOS steps a wheel in multiples of 4.000244140625.
  assert.equal(
    fromTrackpad(wheel({ deltaY: 3 * 4.000244140625, wheelDeltaY: -36 })),
    false,
  );
});

test("a trackpad's two-finger drag is told from a wheel", () => {
  // Sideways movement.
  assert.equal(fromTrackpad(wheel({ deltaX: -3.5, deltaY: 2 })), true);
  // Straight up or down, with a precise device's legacy units.
  assert.equal(fromTrackpad(wheel({ deltaY: 7, wheelDeltaY: -8 })), true);
  assert.equal(fromTrackpad(wheel({ deltaY: 7, wheelDeltaY: 0 })), true);
  // Firefox gives no legacy units, so only sideways movement tells there.
  assert.equal(fromTrackpad(wheel({ deltaY: 7 })), false);
});

test("two fingers turn, Shift pans, and pinches and wheels zoom", () => {
  assert.equal(new WheelGestures().read(wheel({ deltaX: 4 }), 0), "turn");
  assert.equal(
    new WheelGestures().read(wheel({ deltaX: 4, shiftKey: true }), 0),
    "pan",
  );
  // Browsers send a pinch as Ctrl + wheel.
  assert.equal(
    new WheelGestures().read(wheel({ deltaY: -2.3, ctrlKey: true }), 0),
    "zoom",
  );
  assert.equal(
    new WheelGestures().read(wheel({ deltaY: 100, wheelDeltaY: -120 }), 0),
    "zoom",
  );
});

test("a trackpad gesture keeps turning until it pauses", () => {
  const gestures = new WheelGestures();
  const notchLike = wheel({ deltaY: 100, wheelDeltaY: -120 });
  assert.equal(gestures.read(wheel({ deltaX: -2, deltaY: 5 }), 0), "turn");
  // A step that looks like a wheel's, mid-gesture or in its momentum.
  assert.equal(gestures.read(notchLike, 16), "turn");
  assert.equal(gestures.read(notchLike, 200), "turn");
  // A pinch mid-gesture still zooms.
  assert.equal(gestures.read(wheel({ deltaY: 1, ctrlKey: true }), 210), "zoom");
  // After a pause, a wheel zooms again.
  assert.equal(gestures.read(notchLike, 600), "zoom");
});
