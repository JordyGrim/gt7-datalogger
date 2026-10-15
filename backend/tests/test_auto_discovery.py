"""Auto-discovery: the heartbeat finds the console again on a new address.

With no console IP configured the heartbeat is broadcast until a console
answers, then sent to that console alone. When the stream goes stale (rest
mode, a router reboot, a new DHCP lease) it is broadcast again, so a console
that comes back somewhere else is picked up without Find console. Most tests
record the heartbeats on a stand-in transport; the last one runs the real
heartbeat loop against a fake console on loopback.
"""

import asyncio
from collections.abc import Callable

from app.config import Settings
from app.models import TelemetryPacket
from app.telemetry import listener
from app.telemetry.crypto import encrypt_packet
from app.telemetry.listener import (
    BROADCAST_ADDR,
    STALE_AFTER,
    PacketCallback,
    UdpTelemetrySource,
)
from app.telemetry.packet import build_packet
from tests.test_discover_console import FakeConsole

# High ports, apart from the Find console tests' pair.
TELEMETRY_PORT = 43744
HEARTBEAT_PORT = 43745
# TEST-NET-1: the console's address before and after its lease changed.
IP_A = "192.0.2.10"
IP_B = "192.0.2.20"


class RecordingTransport:
    """Stands in for the UDP socket and keeps what was sent where."""

    def __init__(self) -> None:
        self.sent: list[tuple[bytes, tuple[str, int]]] = []

    def sendto(self, data: bytes, addr: tuple[str, int]) -> None:
        self.sent.append((data, addr))


def make_source(ps_ip: str = "", on_packet: PacketCallback | None = None) -> UdpTelemetrySource:
    settings = Settings(
        source="udp", ps_ip=ps_ip, telemetry_port=TELEMETRY_PORT, heartbeat_port=HEARTBEAT_PORT
    )

    async def ignore(_: TelemetryPacket) -> None:
        return None

    return UdpTelemetrySource(settings, on_packet or ignore)


def recording(source: UdpTelemetrySource) -> RecordingTransport:
    transport = RecordingTransport()
    source._transport = transport  # type: ignore[assignment]
    source._running = True
    return transport


def heartbeat(source: UdpTelemetrySource, transport: RecordingTransport) -> list[str]:
    """Send one heartbeat tick and return the hosts it went to."""
    transport.sent.clear()
    source._send_heartbeat()
    assert all(port == HEARTBEAT_PORT for _, (_, port) in transport.sent)
    return [host for _, (host, _) in transport.sent]


def wire(packet_id: int) -> bytes:
    return encrypt_packet(build_packet(packet_id=packet_id))


def go_stale(source: UdpTelemetrySource) -> None:
    """Age the last packet past STALE_AFTER, as if the console went quiet."""
    source._last_packet_at -= STALE_AFTER + 1


async def test_broadcasts_until_a_console_answers() -> None:
    source = make_source()
    transport = recording(source)
    assert heartbeat(source, transport) == [BROADCAST_ADDR]


async def test_console_found_at_a_new_address_after_the_stream_goes_stale() -> None:
    source = make_source()
    transport = recording(source)

    # Found at A: the heartbeat goes to A alone.
    source._handle_datagram(wire(0), (IP_A, HEARTBEAT_PORT))
    assert source.connected
    assert heartbeat(source, transport) == [IP_A]

    # The stream goes stale: broadcast again, and keep trying A.
    go_stale(source)
    assert not source.connected
    assert heartbeat(source, transport) == [BROADCAST_ADDR, IP_A]

    # The console answers the broadcast from its new lease at B.
    source._handle_datagram(wire(1), (IP_B, HEARTBEAT_PORT))
    assert source.connected
    assert source.stats["console_ip"] == IP_B
    assert source.stats["packets_received"] == 2
    assert source._queue.qsize() == 2
    assert heartbeat(source, transport) == [IP_B]


async def test_a_configured_ip_never_broadcasts() -> None:
    source = make_source(ps_ip=IP_A)
    transport = recording(source)
    # Nothing heard yet.
    assert heartbeat(source, transport) == [IP_A]
    # Heard, then stale.
    source._handle_datagram(wire(0), (IP_A, HEARTBEAT_PORT))
    go_stale(source)
    assert not source.connected
    assert heartbeat(source, transport) == [IP_A]


async def test_find_console_still_quarantines_a_second_console_while_live() -> None:
    # Auto-discovery with the console live at A: Find console's broadcast
    # wakes another console at B. B stays out of the pipeline, A is the
    # answer, and the heartbeat keeps going to A alone.
    source = make_source()
    transport = recording(source)
    source._handle_datagram(wire(0), (IP_A, HEARTBEAT_PORT))
    task = asyncio.create_task(source.discover(window=0.3))
    await asyncio.sleep(0)
    source._handle_datagram(wire(1), (IP_B, HEARTBEAT_PORT))
    assert heartbeat(source, transport) == [IP_A]
    source._handle_datagram(wire(2), (IP_A, HEARTBEAT_PORT))
    assert await task == IP_A
    # The quarantine tail still holds after the window closes.
    source._handle_datagram(wire(3), (IP_B, HEARTBEAT_PORT))
    assert source.stats["console_ip"] == IP_A
    assert source.stats["packets_received"] == 2


async def until(cond: Callable[[], bool], timeout: float = 2.0) -> None:
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while not cond():
        assert loop.time() < deadline, "timed out"
        await asyncio.sleep(0.01)


async def test_the_heartbeat_loop_picks_up_the_console_on_its_new_address(monkeypatch) -> None:
    # Real sockets. The console was last heard at A, a TEST-NET address
    # where heartbeats go nowhere; it is now on loopback, which stands in
    # for the broadcast address so nothing leaves the machine.
    monkeypatch.setattr(listener, "BROADCAST_ADDR", "127.0.0.1")
    monkeypatch.setattr(listener, "HEARTBEAT_INTERVAL", 0.02)
    loop = asyncio.get_running_loop()
    console_transport, console = await loop.create_datagram_endpoint(
        FakeConsole, local_addr=("127.0.0.1", HEARTBEAT_PORT)
    )
    received: list[TelemetryPacket] = []

    async def collect(packet: TelemetryPacket) -> None:
        received.append(packet)

    source = make_source(on_packet=collect)
    source._handle_datagram(wire(0), (IP_A, HEARTBEAT_PORT))
    await source.start()
    try:
        # While A is live the console on its new address hears nothing.
        await asyncio.sleep(0.1)
        assert console.heartbeats == 0
        go_stale(source)
        await until(lambda: source.stats["console_ip"] == "127.0.0.1")
        assert source.connected
        assert console.heartbeats >= 1
        await until(lambda: len(received) > 1)
    finally:
        await source.stop()
        console_transport.close()
