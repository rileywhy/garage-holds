// How the 3D viewer's view moves, kept free of three.js so pages can describe
// the viewer before loading it.

// For every viewer's accessible label.
export const VIEWER_CONTROLS =
  "Drag or swipe with two fingers to turn, adding Shift to pan; scroll or pinch to zoom. Arrow keys turn, plus and minus zoom, and 0 fits the view.";

// Browsers report a mouse wheel, a trackpad's two-finger drag and its pinch
// all as wheel events. The viewer zooms on a wheel or a pinch, but a
// two-finger drag should turn the hold the way a drag does (or pan it, with
// Shift). There is no flag for the device, so this reads the signs each
// device leaves, and when unsure it zooms, as a wheel always has.

// The parts of a WheelEvent that tell the devices apart. `wheelDeltaY` is the
// legacy notch count that Chromium and Safari still report; Firefox has none.
export interface WheelInput {
  deltaMode: number;
  deltaX: number;
  deltaY: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  wheelDeltaY?: number;
}

export type WheelIntent = "zoom" | "turn" | "pan";

// A notched wheel turns 120 legacy units a notch.
const NOTCH = 120;
// Chromium and Safari on macOS step a notched wheel in multiples of this
// (the constant Mapbox GL relies on for the same question).
const MAC_WHEEL_STEP = 4.000244140625;
// A trackpad drag, momentum included, sends events closer together than
// this; a longer pause starts a new gesture.
const GESTURE_GAP_MS = 250;

export function fromTrackpad(event: WheelInput) {
  // Only a notched wheel scrolls by lines or pages.
  if (event.deltaMode !== 0) return false;
  // Wheels scroll up and down. (Shift + wheel, which browsers turn sideways,
  // lands here too and pans sideways, which suits it.)
  if (event.deltaX !== 0) return true;
  if (event.deltaY % MAC_WHEEL_STEP === 0) return false;
  const notches = event.wheelDeltaY;
  return notches !== undefined && (notches === 0 || notches % NOTCH !== 0);
}

// Classifies each wheel event over a viewer. A gesture that has shown it
// came from a trackpad stays one until it pauses, so a stray step that looks
// like a wheel's cannot zoom in the middle of a turn.
export class WheelGestures {
  private trackpadUntil = -Infinity;

  read(event: WheelInput, now: number): WheelIntent {
    // A pinch arrives as Ctrl + wheel, as does Ctrl + a real wheel.
    if (event.ctrlKey) return "zoom";
    if (now >= this.trackpadUntil && !fromTrackpad(event)) return "zoom";
    this.trackpadUntil = now + GESTURE_GAP_MS;
    return event.shiftKey ? "pan" : "turn";
  }
}
