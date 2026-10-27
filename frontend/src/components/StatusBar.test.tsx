import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/Tooltip";
import type { ConnectionStatus } from "@/lib/types";
import { StatusBar } from "./StatusBar";

// Server rendering sees a zustand store's initial state, so the status the
// bar reads is supplied here instead.
const store = vi.hoisted(() => ({ status: null as unknown }));
vi.mock("@/store/telemetry", () => ({
  useTelemetry: () => ({ status: store.status, wsConnected: true, setStatus: () => {} }),
}));

const status: ConnectionStatus = {
  source: "udp",
  recording: true,
  session_id: null,
  track_name: "",
  connected: true,
  console_ip: "192.168.1.50",
  packets_received: 10,
  decode_errors: 0,
};

function render(s: ConnectionStatus): string {
  store.status = s;
  return renderToStaticMarkup(
    <TooltipProvider>
      <StatusBar view="live" />
    </TooltipProvider>,
  );
}

describe("StatusBar replay toggle", () => {
  it("sits between REC and the units toggle, off by default", () => {
    const html = render(status);
    const rec = html.indexOf("REC");
    const replay = html.indexOf(">replay<");
    const units = html.indexOf("km/h");
    expect(rec).toBeGreaterThan(-1);
    expect(replay).toBeGreaterThan(rec);
    expect(units).toBeGreaterThan(replay);
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain("REPLAY");
  });

  it("reads REPLAY and is pressed while the server reports it on", () => {
    const html = render({ ...status, record_replays: true });
    expect(html).toContain("REPLAY");
    expect(html).toContain('aria-pressed="true"');
  });
});
