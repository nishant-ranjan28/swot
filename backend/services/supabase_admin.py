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
transaction, so an alert can only fire once. ``claim_digest`` inserts a
``digest_sends`` row (ignoring duplicates) or reclaims a failed/stale one, and
``claim_welcome`` stamps ``welcome_sent_at`` only while it is null, so re-runs of the
digest and welcome jobs never double-send.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
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
RECIPIENT_SELECT = "id,email,display_name"
WATCHLIST_SELECT = "user_id,symbol,name"
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}\Z")
DIGEST_STATUSES = ("claimed", "sent", "failed", "skipped")
DIGEST_STALE_MINUTES = 30  # a 'claimed' digest row older than this may be reclaimed

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


def _check_market(market) -> None:
    if market not in _MARKETS:
        raise ValueError("market must be 'in' or 'us'")


def _check_uuid(value) -> None:
    if not _is_uuid(value):
        raise ValueError("user_id must be a uuid")


def _check_digest_key(user_id, market, digest_date) -> None:
    _check_uuid(user_id)
    _check_market(market)
    if not isinstance(digest_date, str) or not _DATE_RE.match(digest_date):
        raise ValueError("digest_date must be YYYY-MM-DD")


def _check_iso(value, name: str) -> None:
    """Reject anything that isn't an ISO-8601 timestamp, before any request is made."""
    if not isinstance(value, str) or not value:
        raise ValueError(f"{name} must be an ISO timestamp")
    try:
        datetime.fromisoformat(value)
    except ValueError:
        raise ValueError(f"{name} must be an ISO timestamp") from None


def _digest_filter(user_id: str, market: str, digest_date: str) -> dict:
    return {
        "user_id": f"eq.{user_id}",
        "market": f"eq.{market}",
        "digest_date": f"eq.{digest_date}",
    }


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
        prefer: str | None = None,
    ):
        headers = {
            "apikey": self._key,
            "Authorization": f"Bearer {self._key}",
            "Accept": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        elif representation:
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

    async def _get_all(self, table: str, params: dict, order: str = "id.asc") -> list[dict]:
        """GET every row, paging by ``order`` (must be total) until a page comes back short."""
        rows: list[dict] = []
        offset = 0
        while True:
            page = await self._request(
                "GET",
                table,
                params={**params, "order": order, "limit": str(PAGE_SIZE),
                        "offset": str(offset)},
            )
            page = page if isinstance(page, list) else []
            rows.extend(page)
            if len(page) < PAGE_SIZE:
                return rows
            offset += PAGE_SIZE

    # ---- queries -----------------------------------------------------------

    async def active_alerts(self, market: str) -> list[dict]:
        _check_market(market)
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

    # ---- daily digest ------------------------------------------------------

    async def digest_recipients(self, market: str) -> list[dict]:
        """Profiles opted in to the ``market`` digest that have an email."""
        _check_market(market)
        return await self._get_all(
            "profiles",
            {
                "daily_digest": "eq.true",
                "digest_market": f"eq.{market}",
                "email": "not.is.null",
                "select": RECIPIENT_SELECT,
            },
        )

    async def watchlists(
        self, user_ids: Iterable[str], market: str
    ) -> dict[str, list[dict]]:
        """Each user's ``market`` watchlist as ``[{symbol, name}]`` in the order added.

        Invalid ids are dropped; users with no rows are absent from the result.
        """
        _check_market(market)
        ids = _valid_ids(dict.fromkeys(user_ids))
        result: dict[str, list[dict]] = {}
        for i in range(0, len(ids), PROFILE_CHUNK):
            chunk = ids[i:i + PROFILE_CHUNK]
            rows = await self._get_all(
                "watchlist_items",
                {"user_id": _in_filter(chunk), "market": f"eq.{market}",
                 "select": WATCHLIST_SELECT},
                # id breaks added_at ties so offset paging is stable
                order="added_at.asc,id.asc",
            )
            for r in rows:
                uid = r.get("user_id")
                if uid:
                    result.setdefault(uid, []).append(
                        {"symbol": r.get("symbol"), "name": r.get("name")}
                    )
        return result

    async def claim_digest(
        self,
        user_id: str,
        market: str,
        digest_date: str,
        *,
        stale_minutes: int = DIGEST_STALE_MINUTES,
    ) -> str | None:
        """Claim the (user, market, date) digest for sending.

        Returns the ``claimed_at`` timestamp this call set (pass it to
        ``finish_digest``), or None when another run holds the row or it's done.

        Inserts the row, ignoring a duplicate (PostgREST then returns ``[]``). If it
        already existed, reclaims it only when it ``failed`` or its claim is older than
        ``stale_minutes``. Both steps are single statements, so two concurrent runs
        can't both win.
        """
        _check_digest_key(user_id, market, digest_date)
        now = self._clock()
        claimed_at = now.isoformat()
        rows = await self._request(
            "POST",
            "digest_sends",
            params={"on_conflict": "user_id,market,digest_date"},
            json={"user_id": user_id, "market": market, "digest_date": digest_date,
                  "claimed_at": claimed_at},
            prefer="return=representation,resolution=ignore-duplicates",
        )
        if isinstance(rows, list) and rows:
            return claimed_at
        stale_before = (now - timedelta(minutes=stale_minutes)).isoformat()
        rows = await self._request(
            "PATCH",
            "digest_sends",
            params={
                **_digest_filter(user_id, market, digest_date),
                "or": (
                    "(status.eq.failed,"
                    f"and(status.eq.claimed,claimed_at.lt.{_quoted(stale_before)}))"
                ),
            },
            json={"status": "claimed", "claimed_at": claimed_at},
            representation=True,
        )
        return claimed_at if isinstance(rows, list) and rows else None

    async def finish_digest(
        self, user_id: str, market: str, digest_date: str, status: str, claimed_at: str
    ) -> None:
        """Record the outcome of a claimed digest; ``sent_at`` is stamped only when sent.

        ``claimed_at`` is the value ``claim_digest`` returned. The update only matches
        while the row still carries that claim, so a run whose claim went stale and was
        taken over can't overwrite the new owner's row. It's a top-level ``eq.`` filter:
        not quoted (quotes are only for logic trees); httpx URL-encodes it.
        """
        _check_digest_key(user_id, market, digest_date)
        if status not in DIGEST_STATUSES:
            raise ValueError("invalid digest status")
        _check_iso(claimed_at, "claimed_at")
        body: dict = {"status": status}
        if status == "sent":
            body["sent_at"] = self._clock().isoformat()
        await self._request(
            "PATCH",
            "digest_sends",
            params={**_digest_filter(user_id, market, digest_date),
                    "claimed_at": f"eq.{claimed_at}"},
            json=body,
        )

    # ---- welcome email -----------------------------------------------------

    async def welcome_candidates(self, since_iso: str) -> list[dict]:
        """Profiles created since ``since_iso`` with an email and no welcome sent yet.

        ``since_iso`` must parse with ``datetime.fromisoformat``; anything else raises
        ValueError before a request is made.
        """
        _check_iso(since_iso, "since_iso")
        return await self._get_all(
            "profiles",
            {
                "welcome_sent_at": "is.null",
                "email": "not.is.null",
                "created_at": f"gte.{since_iso}",
                "select": RECIPIENT_SELECT,
            },
        )

    async def claim_welcome(self, user_id: str, now_iso: str) -> dict | None:
        """Atomically stamp ``welcome_sent_at``; returns the profile, or None if taken."""
        _check_uuid(user_id)
        rows = await self._request(
            "PATCH",
            "profiles",
            params={"id": f"eq.{user_id}", "welcome_sent_at": "is.null",
                    "select": RECIPIENT_SELECT + ",welcome_sent_at"},
            json={"welcome_sent_at": now_iso},
            representation=True,
        )
        if isinstance(rows, list) and rows and isinstance(rows[0], dict):
            return rows[0]
        return None

    async def release_welcome(self, user_id: str, claimed_iso: str) -> None:
        """Undo a welcome claim after a failed send.

        Filters on the exact timestamp this run claimed with, so a later claimer's
        stamp is never cleared. The value is quoted inside an ``and=(...)`` logic tree,
        where PostgREST strips the quotes.
        """
        _check_uuid(user_id)
        if not isinstance(claimed_iso, str) or not claimed_iso:
            raise ValueError("claimed_iso is required")
        await self._request(
            "PATCH",
            "profiles",
            params={"id": f"eq.{user_id}",
                    "and": f"(welcome_sent_at.eq.{_quoted(claimed_iso)})"},
            json={"welcome_sent_at": None},
        )
