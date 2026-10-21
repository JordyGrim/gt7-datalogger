import { afterEach, describe, expect, it, vi } from "vitest";

// The store hydrates from localStorage as it is created, so each case puts
// its stored copy in place and then imports a fresh module.
async function hydrate(state: Record<string, unknown>) {
  const stored = JSON.stringify({ state, version: 1 });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (key === "gt7-settings" ? stored : null),
    setItem: () => {},
    removeItem: () => {},
  });
  vi.resetModules();
  const { useSettings } = await import("./settings");
  return useSettings.getState();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the remembered lens", () => {
  it("comes back as it was stored", async () => {
    expect((await hydrate({ mapLens: "tire_temp" })).mapLens).toBe("tire_temp");
  });

  it("is Inputs when the stored copy has none, or one this build does not draw", async () => {
    expect((await hydrate({ units: "imperial" })).mapLens).toBe("inputs");
    expect((await hydrate({ mapLens: "tyres" })).mapLens).toBe("inputs");
  });
});

describe("the remembered map layers", () => {
  it("start a layer the stored copy predates at its default", async () => {
    // Stored before the hover readout (#159) had a switch.
    const layers = (await hydrate({ mapLayers: { others: false, events: true } })).mapLayers;
    expect(layers.readout).toBe(true);
    expect(layers.others).toBe(false);
    expect(layers.events).toBe(true);
  });

  it("keep the readout off once it is switched off", async () => {
    expect((await hydrate({ mapLayers: { readout: false } })).mapLayers.readout).toBe(false);
  });
});
