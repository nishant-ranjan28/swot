"""Thin async Supabase PostgREST client using the service-role key (backend only).

The service-role key bypasses RLS. It is sent only as request headers and never
appears in errors or logs. Filter values are passed through httpx ``params=`` so
they are URL-encoded; ids used in ``in.(...)`` / ``eq.`` filters are validated as
UUIDs first so a crafted value can't inject extra PostgREST filter syntax.

List reads page with ``order=id.asc&limit=1000&offset=N`` until a short page, and
profile lookups are chunked 100 ids per request.

Duplicate-send protection: ``claim_events`` atomically stamps ``claimed_at`` on a
user's unsent events (only those unclaimed or with a stale claim) and returns the
rows it claimed; a concurrent run gets nothing back for them. ``fire_alert`` (a
security-definer SQL function) deactivates an alert and inserts its event in one
transaction, so an alert can only fire once.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Callable, Iterable

import httpx

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE
)
_MARKETS = ("in", "us")

ALERT_SELECT = "id,user_id,market,symbol,name,condition,target"
EVENT_SELECT = (
    "id,user_id,price,triggered_at,alert:price_alerts(symbol,name,market,condition,target)"
)
PROFILE_SELECT = "id,email,display_name,email_alerts"

PAGE_SIZE = 1000  # PostgREST's default max-rows; page explicitly so nothing is silently cut
PROFILE_CHUNK = 100  # ids per profiles request, keeps the in.(...) URL short


class SupabaseAdminError(Exception):
    """A Supabase request failed. ``status`` is the HTTP status, or 0 for transport errors.

    The message is deliberately generic: it never includes response bodies, headers
    or the key.
    """

    def __init__(self, status: int, message: str = "supabase request failed"):
        self.status = status
        self.message = message
        super().__init__(f"{message} ({status})")

    def __repr__(self) -> str:
        return f"SupabaseAdminError(status={self.status})"


def _is_uuid(value) -> bool:
    return isinstance(value, str) and bool(_UUID_RE.match(value))


def _valid_ids(ids: Iterable) -> list[str]:
    return [i for i in ids if _is_uuid(i)]


def _in_filter(ids: list[str]) -> str:
    return f"in.({','.join(ids)})"


def _quoted(value: str) -> str:
    """Double-quote a value inside a PostgREST logic tree (``or=(...)``).

    Quoting keeps reserved characters (``,`` ``.`` ``:`` ``(`` ``)``) in timestamps from
    being parsed as syntax. Values here are our own ISO timestamps; quotes and
    backslashes are rejected rather than escaped.
    """
    if '"' in value or "\\" in value:
        raise ValueError("unexpected character in filter value")
    return f'"{value}"'


def _fired_event(row) -> dict | None:
    """The event returned by ``rpc/fire_alert``, or None when the alert didn't fire.

    A SQL function returning a composite type that returns NULL comes back from
    PostgREST as an all-null row (or an empty body), so "fired" means "has an id".
    """
    if isinstance(row, list):
        row = row[0] if row else None
    if isinstance(row, dict) and row.get("id"):
        return row
    return None


class SupabaseAdmin:
    def __init__(
        self,
        url: str,
        service_role_key: str,
        client: httpx.AsyncClient,
        *,
        clock: Callable[[], datetime] | None = None,
    ):
        self._base = f"{url.rstrip('/')}/rest/v1"
        self._key = service_role_key
        self._client = client
        self._clock = clock or (lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:  # never show the key
        return f"SupabaseAdmin(base={self._base!r})"

    # ---- low level ---------------------------------------------------------

    async def _request(
        self,
        method: str,
        table: str,
        *,
        params: dict | None = None,
        json: dict | None = None,
        representation: bool = False,
    ):
        headers = {
            "apikey": self._key,
            "Authorization": f"Bearer {self._key}",
            "Accept": "application/json",
        }
        if representation:
            headers["Prefer"] = "return=representation"
        try:
            resp = await self._client.request(
                method, f"{self._base}/{table}", params=params, json=json, headers=headers
            )
        except httpx.HTTPError as exc:
            raise SupabaseAdminError(0, f"supabase transport error: {type(exc).__name__}") from None
        if not 200 <= resp.status_code < 300:
            raise SupabaseAdminError(resp.status_code)
        if resp.status_code == 204 or not resp.content:
            return None
        try:
            return resp.json()
        except ValueError:
            raise SupabaseAdminError(resp.status_code, "supabase returned invalid json") from None

    async def _get_all(self, table: str, params: dict) -> list[dict]:
        """GET every row, paging by ``id`` until a page comes back short."""
        rows: list[dict] = []
        offset = 0
        while True:
            page = await self._request(
                "GET",
                table,
                params={**params, "order": "id.asc", "limit": str(PAGE_SIZE),
                        "offset": str(offset)},
            )
            page = page if isinstance(page, list) else []
            rows.extend(page)
            if len(page) < PAGE_SIZE:
                return rows
            offset += PAGE_SIZE

    # ---- queries -----------------------------------------------------------

    async def active_alerts(self, market: str) -> list[dict]:
        if market not in _MARKETS:
            raise ValueError("market must be 'in' or 'us'")
        return await self._get_all(
            "price_alerts",
            {"market": f"eq.{market}", "active": "eq.true", "select": ALERT_SELECT},
        )

    async def record_triggers(self, triggers: list[dict]) -> list[dict]:
        """Fire each alert via ``rpc/fire_alert`` and return the recorded events.

        The function deactivates the alert and inserts its event in one transaction,
        guarded by ``active``; an alert that's already inactive (a concurrent run
        fired it, or it was deleted/disarmed) returns NULL and is skipped. The event's
        user_id comes from the alert row, not from the caller.
        """
        events: list[dict] = []
        for t in triggers:
            alert_id = t.get("alert_id")
            if not _is_uuid(alert_id):
                continue
            row = await self._request(
                "POST",
                "rpc/fire_alert",
                json={"p_alert_id": alert_id, "p_price": t.get("price")},
            )
            event = _fired_event(row)
            if event is not None:
                events.append(event)
        return events

    async def pending_events(self, since_iso: str) -> list[dict]:
        return await self._get_all(
            "alert_events",
            {"emailed": "eq.false", "triggered_at": f"gte.{since_iso}", "select": EVENT_SELECT},
        )

    async def expire_events(self, before_iso: str) -> int:
        rows = await self._request(
            "PATCH",
            "alert_events",
            params={"emailed": "eq.false", "triggered_at": f"lt.{before_iso}"},
            json={"emailed": True},
            representation=True,
        )
        return len(rows or [])

    async def profiles(self, user_ids: Iterable[str]) -> dict[str, dict]:
        ids = _valid_ids(dict.fromkeys(user_ids))
        if not ids:
            return {}
        result: dict[str, dict] = {}
        for i in range(0, len(ids), PROFILE_CHUNK):
            chunk = ids[i:i + PROFILE_CHUNK]
            rows = await self._request(
                "GET", "profiles", params={"id": _in_filter(chunk), "select": PROFILE_SELECT}
            )
            for r in rows or []:
                result[r["id"]] = {
                    "email": r.get("email"),
                    "display_name": r.get("display_name"),
                    "email_alerts": r.get("email_alerts"),
                }
        return result

    async def claim_events(
        self, user_id: str, event_ids: Iterable[str], now_iso: str, stale_before_iso: str
    ) -> list[dict]:
        """Claim a user's unsent events for sending; returns the rows actually claimed.

        One PATCH, so the claim is atomic per row: only events that are still unsent
        and either unclaimed or claimed before ``stale_before_iso`` are stamped with
        ``claimed_at = now_iso``. Rows another run holds (fresh claim) or already
        emailed are not returned.
        """
        ids = _valid_ids(dict.fromkeys(event_ids))
        if not ids or not _is_uuid(user_id):
            return []
        rows = await self._request(
            "PATCH",
            "alert_events",
            params={
                "id": _in_filter(ids),
                "user_id": f"eq.{user_id}",
                "emailed": "eq.false",
                "or": f"(claimed_at.is.null,claimed_at.lt.{_quoted(stale_before_iso)})",
                "select": "id",
            },
            json={"claimed_at": now_iso},
            representation=True,
        )
        return rows if isinstance(rows, list) else []

    async def release_events(self, event_ids: Iterable[str]) -> None:
        """Drop the claim on events (after a failed send) so the next run retries them."""
        ids = _valid_ids(dict.fromkeys(event_ids))
        if not ids:
            return
        await self._request(
            "PATCH", "alert_events", params={"id": _in_filter(ids)}, json={"claimed_at": None}
        )

    async def mark_emailed(self, event_ids: Iterable[str]) -> None:
        ids = _valid_ids(dict.fromkeys(event_ids))
        if not ids:
            return
        await self._request(
            "PATCH", "alert_events", params={"id": _in_filter(ids)}, json={"emailed": True}
        )
