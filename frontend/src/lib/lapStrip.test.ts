import { describe, expect, it } from "vitest";
import { dragRange, grabAt, hasDragged, isFullLap, lineDragRange, wheelRange } from "./lapStrip";

const L = 1000; // metres
const W = 500; // pixels, so 2 m per pixel

describe("grabAt", () => {
  it("takes hold of the window's edges within a few pixels", () => {
    expect(grabAt(203, W, L, [400, 600]).mode).toBe("left");
    expect(grabAt(296, W, L, [400, 600]).mode).toBe("right");
  });

  it("takes hold of the window itself inside it, remembering where", () => {
    const grab = grabAt(250, W, L, [400, 600]);
    expect(grab.mode).toBe("move");
    expect(grab.offset).toBe(100);
  });

  it("starts a new stretch on empty bar, or with no window at all", () => {
    expect(grabAt(50, W, L, [400, 600]).mode).toBe("new");
    expect(grabAt(250, W, L, null)).toEqual({ mode: "new", start: 500, offset: 0 });
  });
});

describe("dragRange", () => {
  it("draws a new stretch from where the pointer went down, either way", () => {
    const grab = grabAt(100, W, L, null);
    expect(dragRange(grab, 350, null, L)).toEqual([200, 350]);
    expect(dragRange(grab, 50, null, L)).toEqual([50, 200]);
  });

  it("moves an edge but keeps the window at least 40 m wide", () => {
    const left = grabAt(200, W, L, [400, 600]);
    expect(dragRange(left, 300, [400, 600], L)).toEqual([300, 600]);
    expect(dragRange(left, 590, [400, 600], L)).toEqual([560, 600]);
    const right = grabAt(300, W, L, [400, 600]);
    expect(dragRange(right, 405, [400, 600], L)).toEqual([400, 440]);
  });

  it("slides the window without changing its width or leaving the lap", () => {
    const grab = grabAt(250, W, L, [400, 600]);
    expect(dragRange(grab, 600, [400, 600], L)).toEqual([500, 700]);
    expect(dragRange(grab, 50, [400, 600], L)).toEqual([0, 200]);
    expect(dragRange(grab, 990, [400, 600], L)).toEqual([800, 1000]);
  });
});

describe("hasDragged", () => {
  it("tells a click from a drag by how far the pointer moved", () => {
    const grab = grabAt(100, W, L, null);
    expect(hasDragged(grab, 205)).toBe(false);
    expect(hasDragged(grab, 230)).toBe(true);
  });
});

describe("wheelRange", () => {
  it("zooms about the pointer, keeping it in place", () => {
    const next = wheelRange([400, 600], L, 450, false)!;
    expect(next[1] - next[0]).toBeCloseTo(160);
    // The pointer was a quarter of the way in, and still is.
    expect((450 - next[0]) / 160).toBeCloseTo(0.25);
  });

  it("never goes narrower than 80 m, and returns the full lap past 95 %", () => {
    expect(wheelRange([400, 480], L, null, false)![1] - 400).toBe(80);
    expect(wheelRange([0, 900], L, null, true)).toBeNull();
    expect(wheelRange(null, L, 500, true)).toBeNull();
  });
});

describe("lineDragRange", () => {
  it("pads a drag along the line, and ignores one too short to mean it", () => {
    expect(lineDragRange([100, 200], L)).toEqual([85, 215]);
    expect(lineDragRange([100, 130], L)).toBeNull();
    expect(lineDragRange([0, 990], L)).toEqual([0, 1000]);
  });
});

describe("isFullLap", () => {
  it("treats nearly all of the lap as all of it", () => {
    expect(isFullLap(null, L)).toBe(true);
    expect(isFullLap([5, 995], L)).toBe(true);
    expect(isFullLap([100, 900], L)).toBe(false);
  });
});
