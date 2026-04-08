# backend/services/mf_service.py
from datetime import datetime, timedelta
import httpx
from utils.cache import cache_manager
from services.stock_service import sanitize_json

MFDATA_BASE = "https://mfdata.in/api/v1"


class MFService:
    """Mutual Fund analytics service using mfdata.in and mfapi.in APIs."""

    # Search queries per category to find popular funds dynamically
    CATEGORY_SEARCHES = {
        "Equity Large Cap": ["SBI large cap direct growth", "HDFC large cap direct growth", "ICICI large cap direct growth"],
        "Equity Mid Cap": ["HDFC mid cap direct growth", "Kotak midcap direct growth", "Axis midcap direct growth"],
        "Equity Small Cap": ["SBI small cap direct growth", "Nippon small cap direct growth", "HDFC small cap direct growth"],
        "ELSS": ["Mirae asset tax saver direct growth", "Axis ELSS direct growth", "SBI long term equity direct growth"],
        "Debt": ["HDFC corporate bond direct growth", "ICICI corporate bond direct growth", "SBI magnum medium direct growth"],
        "Hybrid": ["SBI equity hybrid direct growth", "HDFC balanced advantage direct growth", "ICICI equity debt direct growth"],
        "Index": ["UTI nifty 50 index direct growth", "HDFC index nifty 50 direct growth", "Motilal nifty next 50 direct growth"],
    }

    def search(self, query: str) -> list[dict]:
        """Search mutual fund schemes using mfdata.in API."""
        try:
            resp = httpx.get(f"{MFDATA_BASE}/search", params={"q": query, "limit": 20}, timeout=10)
            data = resp.json()
            if data.get("status") != "success":
                return []

            results = []
            for item in data.get("data", []):
                results.append({
                    "scheme_code": str(item.get("amfi_code", "")),
                    "scheme_name": item.get("name", ""),
                    "nav": item.get("nav"),
                    "category": item.get("category"),
                    "plan_type": item.get("plan_type"),
                    "expense_ratio": item.get("expense_ratio"),
                    "amc": item.get("amc_name"),
                })

            # Sort: prefer Direct Growth plans first
            def sort_key(item):
                name = item["scheme_name"].lower()
                is_direct = "direct" in name
                is_growth = "growth" in name
                if is_direct and is_growth:
                    return 0
                elif is_direct:
                    return 1
                elif is_growth:
                    return 2
                return 3

            results.sort(key=sort_key)
            return sanitize_json(results)
        except Exception:
            return []

    def get_nav(self, scheme_code: str) -> dict | None:
        """Get current NAV for a scheme using mfdata.in."""
        cache_key = f"nav_{scheme_code}"
        cached = cache_manager.get("mf_nav", cache_key)
        if cached is not None:
            return cached

        try:
            resp = httpx.get(f"{MFDATA_BASE}/schemes/{scheme_code}", timeout=10)
            data = resp.json()
            if data.get("status") != "success":
                return None

            d = data["data"]
            result = {
                "scheme_code": str(scheme_code),
                "scheme_name": d.get("name", ""),
                "nav": d.get("nav"),
                "nav_date": d.get("nav_date", ""),
                "category": d.get("category"),
                "expense_ratio": d.get("expense_ratio"),
                "aum": d.get("aum"),
                "risk_label": d.get("risk_label"),
                "returns": d.get("returns"),
            }
            result = sanitize_json(result)
            cache_manager.set("mf_nav", cache_key, result, ttl=3600)
            return result
        except Exception:
            return None

    def get_history(self, scheme_code: str, period: str = "1y") -> dict | None:
        """Get historical NAV data using mfapi.in (richer data than mfdata.in)."""
        cache_key = f"hist_{scheme_code}_{period}"
        cached = cache_manager.get("mf_history", cache_key)
        if cached is not None:
            return cached

        try:
            resp = httpx.get(f"https://api.mfapi.in/mf/{scheme_code}", timeout=15)
            data = resp.json()
            if data.get("status") != "SUCCESS" or not data.get("data"):
                return None

            scheme_name = data.get("meta", {}).get("scheme_name", "")

            # mfapi.in returns all history, newest first: [{date: "DD-MM-YYYY", nav: "123.45"}, ...]
            period_days = {"1y": 365, "3y": 365 * 3, "5y": 365 * 5, "max": None}
            max_days = period_days.get(period)
            cutoff = datetime.now() - timedelta(days=max_days) if max_days else None

            records = []
            for item in data["data"]:
                try:
                    nav_val = float(item["nav"])
                    dt = datetime.strptime(item["date"], "%d-%m-%Y")
                    if cutoff and dt < cutoff:
                        break  # Data is sorted newest first, so we can stop
                    records.append({"date": dt.strftime("%Y-%m-%d"), "nav": nav_val})
                except (ValueError, TypeError, KeyError):
                    continue

            records.reverse()  # Oldest first for charting

            result = {
                "scheme_code": str(scheme_code),
                "scheme_name": scheme_name,
                "period": period,
                "data": records,
            }
            result = sanitize_json(result)
            cache_manager.set("mf_history", cache_key, result, ttl=21600)
            return result
        except Exception:
            return None

    def get_top_funds(self, category: str = "all") -> list[dict]:
        """Get top mutual funds by category dynamically from mfdata.in."""
        cache_key = f"top_{category}"
        cached = cache_manager.get("mf_top", cache_key)
        if cached is not None:
            return cached

        results = []
        if category.lower() == "all":
            categories = self.CATEGORY_SEARCHES
        else:
            categories = {k: v for k, v in self.CATEGORY_SEARCHES.items() if category.lower() in k.lower()}

        seen_codes = set()
        for display_name, queries in categories.items():
            for query in queries:
                try:
                    resp = httpx.get(
                        f"{MFDATA_BASE}/search",
                        params={"q": query, "limit": 3},
                        timeout=10,
                    )
                    data = resp.json()
                    if data.get("status") != "success":
                        continue
                    for item in data.get("data", []):
                        code = str(item.get("amfi_code", ""))
                        if code in seen_codes:
                            continue
                        # Only direct growth plans
                        if item.get("plan_type") != "direct":
                            continue
                        if "growth" not in item.get("name", "").lower():
                            continue
                        seen_codes.add(code)
                        results.append({
                            "scheme_code": code,
                            "scheme_name": item.get("name", ""),
                            "nav": item.get("nav"),
                            "category": display_name,
                            "expense_ratio": item.get("expense_ratio"),
                            "amc": item.get("amc_name"),
                            "aum": item.get("aum"),
                            "rating": item.get("morningstar"),
                        })
                        break  # One result per search query
                except Exception:
                    continue

        results = sanitize_json(results)
        if results:
            cache_manager.set("mf_top", cache_key, results, ttl=21600)
        return results

    def _get_family_id(self, scheme_code: str) -> int | None:
        """Get family_id for a scheme from mfdata.in."""
        cache_key = f"family_{scheme_code}"
        cached = cache_manager.get("mf_family", cache_key)
        if cached is not None:
            return cached
        try:
            resp = httpx.get(f"{MFDATA_BASE}/schemes/{scheme_code}", timeout=10)
            data = resp.json()
            if data.get("status") == "success":
                fid = data["data"].get("family_id")
                if fid:
                    cache_manager.set("mf_family", cache_key, fid, ttl=86400)
                return fid
        except Exception:
            pass
        return None

    def get_holdings(self, scheme_code: str) -> dict | None:
        """Get stock-level holdings for a mutual fund from mfdata.in."""
        cache_key = f"holdings_{scheme_code}"
        cached = cache_manager.get("mf_holdings", cache_key)
        if cached is not None:
            return cached

        family_id = self._get_family_id(scheme_code)
        if not family_id:
            return None

        try:
            resp = httpx.get(f"{MFDATA_BASE}/families/{family_id}/holdings", timeout=15)
            data = resp.json()
            if data.get("status") != "success":
                return None

            holdings_data = data["data"]
            equity = holdings_data.get("equity_holdings", [])

            result = {
                "scheme_code": scheme_code,
                "month": holdings_data.get("month"),
                "total_aum": holdings_data.get("total_aum"),
                "equity_pct": holdings_data.get("equity_pct"),
                "debt_pct": holdings_data.get("debt_pct"),
                "holdings": [
                    {
                        "name": h.get("stock_name"),
                        "sector": h.get("sector"),
                        "weight": h.get("weight_pct"),
                        "value": h.get("market_value"),
                    }
                    for h in equity[:20]
                ],
            }

            result = sanitize_json(result)
            cache_manager.set("mf_holdings", cache_key, result, ttl=21600)
            return result
        except Exception:
            return None

    def get_overlap(self, code1: str, code2: str) -> dict | None:
        """Get portfolio overlap between two MF schemes using mfdata.in."""
        cache_key = f"overlap_{code1}_{code2}"
        cached = cache_manager.get("mf_overlap", cache_key)
        if cached is not None:
            return cached

        try:
            resp = httpx.get(
                f"{MFDATA_BASE}/overlap",
                params={"scheme_codes": f"{code1},{code2}"},
                timeout=15,
            )
            data = resp.json()
            if data.get("status") != "success":
                return None

            overlap_data = data["data"]
            schemes = overlap_data.get("schemes", {})

            result = {
                "fund1": {"scheme_code": code1, "name": schemes.get(code1, code1)},
                "fund2": {"scheme_code": code2, "name": schemes.get(code2, code2)},
                "overlap_pct": overlap_data.get("overlap_percentage", 0),
                "common_count": overlap_data.get("common_stocks", 0),
                "holdings": [
                    {
                        "name": h.get("stock_name"),
                        "weight1": h.get("schemes", {}).get(code1, 0),
                        "weight2": h.get("schemes", {}).get(code2, 0),
                        "avg_weight": h.get("avg_weight", 0),
                    }
                    for h in overlap_data.get("holdings", [])[:30]
                ],
            }

            result = sanitize_json(result)
            cache_manager.set("mf_overlap", cache_key, result, ttl=21600)
            return result
        except Exception:
            return None

    def compare(self, codes: list[str]) -> dict:
        """Compare multiple funds by their 1-year NAV history."""
        result = {"funds": []}

        for code in codes[:5]:  # Limit to 5 funds
            history = self.get_history(code, "1y")
            if history:
                result["funds"].append({
                    "scheme_code": str(code),
                    "scheme_name": history.get("scheme_name", ""),
                    "data": history.get("data", []),
                })

        return sanitize_json(result)


# Singleton instance
mf_service = MFService()
