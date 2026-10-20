"""Race Engineer chase reference: coaching against a stored lap (#152)."""

import asyncio
import json
from datetime import UTC, datetime

import pytest

from app.api.ws import _handle_client_message
from app.config import Settings
from app.processing.cars import Car, CarDatabase
from app.processing.laps import CompletedLap, SessionInfo
from app.race_engineer.manager import RaceEngineerManager
from app.service import TelemetryService
from app.storage.db import init_db, make_engine, make_session_factory
from app.storage.repository import Repository
from tests.test_ws_broadcast import FakeWS


def manager(track: str = "Suzuka") -> RaceEngineerManager:
    mgr = RaceEngineerManager()
    mgr.on_session(SessionInfo(car_id=7, started_at="now"), session_id=1)
    mgr.ctx.track_name = track
    return mgr


def samples():
    return {"dist": [0.0, 100.0], "t": [0.0, 1.0]}


def make_lap(number, time_ms, telemetry, valid=True, car_id=7):
    """Construct a completed lap for Chase Reference tests."""
    lap = CompletedLap(
        number=number,
        time_ms=time_ms,
        finished_at=datetime.now(UTC).isoformat(),
        car_id=car_id,
        samples=telemetry,
        fuel_start=10.0,
        fuel_end=8.0,
        full_lap=valid,
    )
    lap.span_confirmed = valid
    return lap


def test_historical_reference_selection():
    mgr = manager()
    historical = samples()

    assert mgr.reference_mode == "session_best"

    mgr.select_chase_reference(42, 90_000, historical)

    assert mgr.reference_mode == "chase"
    assert mgr.reference_lap_id == 42
    assert mgr.reference_time_ms == 90_000
    assert mgr._pending_reference is historical


@pytest.mark.parametrize(
    ("time_ms", "telemetry"),
    [
        (0, {"dist": [0.0]}),
        (-1, {"dist": [0.0]}),
        (90_000, {"dist": []}),
    ],
)
def test_unusable_historical_reference_is_rejected(time_ms, telemetry):
    mgr = manager()

    with pytest.raises(ValueError, match="no usable telemetry"):
        mgr.select_chase_reference(42, time_ms, telemetry)

    assert mgr.reference_mode == "session_best"


def test_chase_reference_can_be_reset_to_session_best():
    mgr = manager()
    mgr.select_chase_reference(42, 90_000, samples())

    mgr.select_session_best_reference()

    assert mgr.reference_mode == "session_best"
    assert mgr.reference_lap_id is None
    assert mgr.reference_time_ms is None
    assert mgr._chase_base is None
    assert mgr._pending_reference is None


def test_invalidated_promoted_lap_restores_historical_reference():
    mgr = manager()
    historical = samples()
    promoted = samples()

    mgr.select_chase_reference(42, 90_000, historical)
    mgr.on_lap(make_lap(1, 89_000, promoted))

    assert mgr.reference_time_ms == 89_000
    assert mgr.reference_lap_id is None

    mgr.apply_best_override({1}, None)

    assert mgr.reference_mode == "chase"
    assert mgr.reference_lap_id == 42
    assert mgr.reference_time_ms == 90_000
    assert mgr._pending_reference is historical


def test_faster_valid_lap_promotes_reference():
    mgr = manager()
    historical = samples()
    faster = samples()

    mgr.select_chase_reference(42, 90_000, historical)
    mgr.on_lap(make_lap(1, 89_000, faster))

    assert mgr.reference_mode == "chase"
    assert mgr.reference_lap_id is None
    assert mgr.reference_time_ms == 89_000
    assert mgr._pending_reference is faster


def test_slower_lap_does_not_replace_reference():
    mgr = manager()
    historical = samples()
    slower = samples()

    mgr.select_chase_reference(42, 90_000, historical)
    mgr.on_lap(make_lap(1, 91_000, slower))

    assert mgr.reference_lap_id == 42
    assert mgr.reference_time_ms == 90_000
    assert mgr._pending_reference is historical


def test_invalid_lap_does_not_replace_reference():
    mgr = manager()
    historical = samples()
    invalid = samples()

    mgr.select_chase_reference(42, 90_000, historical)
    mgr.on_lap(make_lap(1, 88_000, invalid, valid=False))

    assert mgr.reference_lap_id == 42
    assert mgr.reference_time_ms == 90_000
    assert mgr._pending_reference is historical


def test_promoted_lap_found_partial_later_falls_back():
    """The span guard re-judging the lap that took over, not a ruling by hand."""
    mgr = manager()
    historical = samples()
    mgr.select_chase_reference(42, 90_000, historical)
    mgr.on_lap(make_lap(1, 89_000, samples()))
    assert mgr.reference_time_ms == 89_000

    later = make_lap(2, 91_000, samples())
    later.invalidated_best = True
    later.excluded_lap_numbers = [1]
    mgr.on_lap(later)

    assert mgr.reference_lap_id == 42
    assert mgr.reference_time_ms == 90_000
    assert mgr._pending_reference is historical


async def test_restart_keeps_the_chase_until_the_circuit_is_known():
    mgr = manager()
    historical = samples()
    mgr.select_chase_reference(42, 90_000, historical)
    await mgr.refresh_reference()

    mgr.on_session(SessionInfo(car_id=7, started_at="later"), session_id=2)

    assert mgr.reference_mode == "chase"
    assert mgr.reference_lap_id == 42
    # Parked: nothing coaches against it, and a lap of an unknown circuit
    # can't take it over.
    assert mgr.ctx.reference is None
    await mgr.on_track("")
    mgr.on_lap(make_lap(1, 80_000, samples(), valid=False))
    assert mgr.reference_time_ms == 90_000
    assert mgr._pending_reference is None
    assert mgr.ctx.reference is None

    await mgr.on_track("Suzuka")

    assert mgr.ctx.reference is historical
    assert mgr.reference_lap_id == 42


async def test_a_parked_lap_takes_over_once_the_circuit_matches():
    mgr = manager()
    mgr.select_chase_reference(42, 90_000, samples())
    mgr.on_session(SessionInfo(car_id=7, started_at="later"), session_id=2)
    quicker = samples()
    mgr.on_lap(make_lap(1, 89_000, quicker))
    assert mgr.reference_time_ms == 90_000  # not yet: which circuit is unknown

    await mgr.on_track("Suzuka")

    assert mgr.reference_time_ms == 89_000
    assert mgr.ctx.reference is quicker


async def test_restart_carries_a_lap_that_took_over():
    mgr = manager()
    faster = samples()
    mgr.select_chase_reference(42, 90_000, samples())
    mgr.on_lap(make_lap(1, 89_000, faster))

    mgr.on_session(SessionInfo(car_id=7, started_at="later"), session_id=2)
    await mgr.on_track("Suzuka")

    assert mgr.reference_mode == "chase"
    assert mgr.reference_lap_id is None
    assert mgr.reference_time_ms == 89_000
    assert mgr.ctx.reference is faster


def test_new_car_ends_the_chase():
    mgr = manager()
    mgr.select_chase_reference(42, 90_000, samples())

    mgr.on_session(SessionInfo(car_id=8, started_at="later"), session_id=2)

    assert mgr.reference_mode == "session_best"
    assert mgr.reference_lap_id is None
    assert mgr._chase_base is None


async def test_another_circuit_ends_the_chase():
    mgr = manager()
    mgr.select_chase_reference(42, 90_000, samples())
    mgr.on_session(SessionInfo(car_id=7, started_at="later"), session_id=2)

    await mgr.on_track("Monza")

    assert mgr.reference_mode == "session_best"
    assert mgr.ctx.reference is None
    # Back to the session best: the next lap is the reference.
    lap = make_lap(1, 100_000, samples())
    mgr.on_lap(lap)
    assert mgr._pending_reference is lap.samples


# --- service and WebSocket ---------------------------------------------------


@pytest.fixture
async def service(tmp_path):
    settings = Settings(
        source="udp", db_path=tmp_path / "test.db", ws_rate=1000, telemetry_port=43749
    )
    engine = make_engine(settings.db_path)
    await init_db(engine)
    repo = Repository(make_session_factory(engine))
    svc = TelemetryService(settings, repo, CarDatabase())
    yield svc
    await svc.stop()
    await engine.dispose()


async def stored_lap(repo, track, number, time_ms, counts=True) -> int:
    session_id = await repo.create_session(
        SessionInfo(car_id=7, started_at="2026-10-19T00:00:00Z"), Car(id=7, name="Car 7")
    )
    await repo.set_session_track(session_id, track)
    lap = make_lap(number, time_ms, samples(), valid=counts)
    return await repo.save_lap(session_id, lap)


def send(service: TelemetryService, ws, **data: object) -> None:
    message = {"type": "set_engineer_reference", "data": data}
    _handle_client_message(service, ws, json.dumps(message))


async def settle(service: TelemetryService) -> None:
    if service._reference_task is not None:
        await service._reference_task
    await asyncio.sleep(0.01)  # let the client's sender drain


async def test_ws_chases_a_stored_lap(service) -> None:
    lap_id = await stored_lap(service.repo, "Suzuka", 3, 90_000)
    service.track_name = "Suzuka"
    ws = FakeWS()
    await service.register(ws)

    send(service, ws, lap_id=lap_id)
    await settle(service)

    assert service.engineer.reference_mode == "chase"
    assert service.engineer.reference_lap_id == lap_id
    assert service.engineer.ctx.reference is not None
    status = ws.messages("race_engineer_status")[-1]["data"]
    assert status["reference_mode"] == "chase"
    assert status["reference_time_ms"] == 90_000

    send(service, ws, lap_id=None)
    await settle(service)

    assert service.engineer.reference_mode == "session_best"
    assert ws.messages("race_engineer_status")[-1]["data"]["reference_mode"] == "session_best"


@pytest.mark.parametrize("lap_id", ["7", 0, -3, True, 1.5])
async def test_ws_refuses_a_malformed_lap_id(service, lap_id) -> None:
    ws = FakeWS()
    await service.register(ws)

    send(service, ws, lap_id=lap_id)
    await asyncio.sleep(0.01)

    assert service._reference_task is None
    (error,) = ws.messages("error")
    assert error["data"]["request"] == "set_engineer_reference"


async def test_ws_refuses_laps_it_cannot_chase(service) -> None:
    elsewhere = await stored_lap(service.repo, "Monza", 1, 100_000)
    partial = await stored_lap(service.repo, "Suzuka", 1, 45_000, counts=False)
    ws = FakeWS()
    await service.register(ws)

    send(service, ws, lap_id=elsewhere)  # circuit not identified yet
    await settle(service)
    service.track_name = "Suzuka"
    for lap_id in (elsewhere, partial, 9999):
        send(service, ws, lap_id=lap_id)
        await settle(service)

    errors = [m["data"]["message"] for m in ws.messages("error")]
    assert len(errors) == 4
    assert "identified" in errors[0]
    assert "another circuit" in errors[1]
    assert "full lap" in errors[2]
    assert "no longer exists" in errors[3]
    assert service.engineer.reference_mode == "session_best"


async def test_requests_collapse_into_the_latest(service, monkeypatch) -> None:
    applied: list[int | None] = []

    async def record(lap_id):
        applied.append(lap_id)

    monkeypatch.setattr(service, "select_engineer_reference", record)
    ws = FakeWS()
    await service.register(ws)

    for lap_id in (1, 2, 3):
        send(service, ws, lap_id=lap_id)
    await settle(service)

    assert applied == [3]


async def test_a_failing_request_answers_and_the_next_still_runs(service, monkeypatch) -> None:
    calls = 0

    async def flaky(lap_id):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise OverflowError("int too large")

    monkeypatch.setattr(service, "select_engineer_reference", flaky)
    ws = FakeWS()
    await service.register(ws)

    send(service, ws, lap_id=1)
    await settle(service)
    send(service, ws, lap_id=2)
    await settle(service)

    assert calls == 2
    (error,) = ws.messages("error")
    assert error["data"]["message"] == "Could not load that lap"
