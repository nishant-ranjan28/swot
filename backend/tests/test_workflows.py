"""Static checks on the cron workflows that call the job endpoints."""

import re
from pathlib import Path

import pytest

yaml = pytest.importorskip("yaml")

WORKFLOWS = Path(__file__).resolve().parents[2] / ".github" / "workflows"


def load(name):
    return yaml.safe_load((WORKFLOWS / name).read_text(encoding="utf-8"))


def curl_budget_seconds(run: str) -> int:
    """Worst case for one curl call: every attempt hits --max-time, plus retry delays."""
    max_time = int(re.search(r"--max-time (\d+)", run).group(1))
    retries = int(re.search(r"--retry (\d+)", run).group(1))
    delay = int(re.search(r"--retry-delay (\d+)", run).group(1))
    return (retries + 1) * max_time + retries * delay


@pytest.mark.parametrize("name", ["digest.yml", "welcome.yml"])
def test_workflow_parses(name):
    assert isinstance(load(name), dict)


def test_digest_timeout_fits_all_retries():
    job = load("digest.yml")["jobs"]["digest"]
    assert job["timeout-minutes"] == 20
    run = job["steps"][0]["run"]
    assert "--max-time 300" in run
    assert curl_budget_seconds(run) < job["timeout-minutes"] * 60  # 3x300s + 2x15s = 930s


def test_welcome_timeout_unchanged():
    job = load("welcome.yml")["jobs"]["welcome"]
    assert job["timeout-minutes"] == 5
    run = job["steps"][0]["run"]
    assert "--max-time 60" in run
    assert curl_budget_seconds(run) < job["timeout-minutes"] * 60


CRON_LIKE = re.compile(r"^\S+( \S+){4}$")


def digest_schedule_and_cases():
    wf = load("digest.yml")
    # PyYAML (YAML 1.1) reads the bare key "on" as True.
    on = wf.get("on", wf.get(True))
    crons = [entry["cron"] for entry in on["schedule"]]
    run = wf["jobs"]["digest"]["steps"][0]["run"]
    cases = re.findall(r"^\s*'([^']+)'\)\s*market=(\w+);;", run, re.MULTILINE)
    return crons, dict(cases), run


def test_digest_every_schedule_is_mapped_in_the_case():
    crons, cases, _ = digest_schedule_and_cases()
    assert crons, "digest.yml has no schedule"
    for cron in crons:
        assert cron in cases, f"cron {cron!r} has no case pattern"


def test_digest_every_cron_like_case_pattern_is_scheduled():
    crons, _, run = digest_schedule_and_cases()
    patterns = re.findall(r"^\s*'([^']+)'\)", run, re.MULTILINE)
    cron_like = [p for p in patterns if CRON_LIKE.match(p)]
    assert cron_like
    for pattern in cron_like:
        assert pattern in crons, f"case pattern {pattern!r} is not in on.schedule"


def test_digest_has_a_same_day_retry_per_market():
    crons, cases, _ = digest_schedule_and_cases()
    assert sorted(cases.values()) == ["in", "in", "us", "us"]
    assert cases["0 11 * * 1-5"] == "in" and cases["0 12 * * 1-5"] == "in"
    assert cases["30 21 * * 1-5"] == "us" and cases["30 22 * * 1-5"] == "us"


def test_digest_keeps_the_concurrency_group():
    wf = load("digest.yml")
    assert wf["concurrency"] == {"group": "daily-digest", "cancel-in-progress": False}
