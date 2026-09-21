import logging

import pytest

from services.quotes import fetch_quotes


class Quotes:
    def __init__(self, fail_on=None, result=None):
        self.chunks: list[list[str]] = []
        self.fail_on = fail_on
        self.result = result

    def __call__(self, symbols):
        self.chunks.append(list(symbols))
        if self.fail_on and self.fail_on in symbols:
            raise ConnectionError("upstream said <secret-ish body>")
        if self.result is not None:
            return self.result
        return {s: {"price": 1.0} for s in symbols}


@pytest.mark.asyncio
async def test_fetches_in_chunks_and_merges():
    q = Quotes()
    symbols = [f"S{i}" for i in range(45)]
    quotes, errors = await fetch_quotes(q, symbols)
    assert [len(c) for c in q.chunks] == [20, 20, 5]
    assert set(quotes) == set(symbols)
    assert errors == []


@pytest.mark.asyncio
async def test_chunk_size_is_configurable():
    q = Quotes()
    await fetch_quotes(q, ["A", "B", "C"], chunk=2)
    assert q.chunks == [["A", "B"], ["C"]]


@pytest.mark.asyncio
async def test_empty_symbols_makes_no_call():
    q = Quotes()
    assert await fetch_quotes(q, []) == ({}, [])
    assert q.chunks == []


@pytest.mark.asyncio
async def test_failed_chunk_is_reported_and_others_still_merge(caplog):
    q = Quotes(fail_on="S3")
    with caplog.at_level(logging.WARNING):
        quotes, errors = await fetch_quotes(q, [f"S{i}" for i in range(25)], label="digest job")
    assert errors == ["quotes:ConnectionError"]
    assert set(quotes) == {f"S{i}" for i in range(20, 25)}
    messages = [r.getMessage() for r in caplog.records]
    assert messages == ["digest job: quote fetch failed: ConnectionError"]
    assert "secret" not in " ".join(messages)


@pytest.mark.asyncio
async def test_default_log_label_is_neutral(caplog):
    with caplog.at_level(logging.WARNING):
        await fetch_quotes(Quotes(fail_on="A"), ["A"])
    (record,) = caplog.records
    assert record.getMessage() == "quotes: quote fetch failed: ConnectionError"
    assert "alert" not in record.getMessage()


@pytest.mark.asyncio
async def test_non_dict_result_is_ignored():
    quotes, errors = await fetch_quotes(Quotes(result=["junk"]), ["A"])
    assert quotes == {} and errors == []


def test_alert_and_digest_jobs_use_the_shared_helper():
    from services import alert_job, digest_job, quotes

    assert alert_job.fetch_quotes is quotes.fetch_quotes
    assert digest_job.fetch_quotes is quotes.fetch_quotes
    assert not hasattr(alert_job, "_fetch_quotes")
