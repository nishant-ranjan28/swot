from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

PREVIEW = "https://swot-analyse-jskd3xsjn-nishants-projects-b0da7be3.vercel.app"


def preflight(origin):
    return client.options(
        "/api/health",
        headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
    )


def test_production_origins_allowed():
    for origin in ("https://swot.iamnishant.in", "https://swot-analyse.vercel.app", "http://localhost:3000"):
        assert preflight(origin).headers.get("access-control-allow-origin") == origin


def test_this_projects_vercel_previews_allowed():
    assert preflight(PREVIEW).headers.get("access-control-allow-origin") == PREVIEW
    branch = "https://swot-analyse-git-revamp-openstock-ui-nishants-projects-b0da7be3.vercel.app"
    assert preflight(branch).headers.get("access-control-allow-origin") == branch


def test_other_vercel_apps_rejected():
    for origin in (
        "https://evil.vercel.app",
        "https://swot-analyse-x-someone-else.vercel.app",
        "https://swot-analyse-x-nishants-projects-b0da7be3.vercel.app.evil.com",
        "http://swot-analyse-x-nishants-projects-b0da7be3.vercel.app",
    ):
        assert "access-control-allow-origin" not in preflight(origin).headers
