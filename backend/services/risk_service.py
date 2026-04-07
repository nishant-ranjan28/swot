# backend/services/risk_service.py
import numpy as np
import yfinance as yf
from utils.cache import cache_manager
from services.stock_service import sanitize_json


class RiskService:
    def analyze(self, symbols: list[str], weights: list[float] = None) -> dict | None:
        """Calculate portfolio risk metrics."""
        cache_key = f"risk_{'_'.join(sorted(symbols))}"
        cached = cache_manager.get("risk", cache_key)
        if cached is not None:
            return cached

        try:
            df = yf.download(symbols, period="2y", auto_adjust=True)["Close"]
            if df.empty:
                return None

            # Handle single-column edge case (Series instead of DataFrame)
            import pandas as pd
            if isinstance(df, pd.Series):
                df = df.to_frame(name=symbols[0])

            # Reorder columns to match symbols order
            available = [s for s in symbols if s in df.columns]
            if len(available) < 2:
                return None
            df = df[available]
            df = df.dropna()

            if len(df) < 60:
                return None

            returns = df.pct_change().dropna()

            n = len(available)
            if weights is None:
                w = np.array([1.0 / n] * n)
            else:
                w = np.array(weights[:n])
                w = w / w.sum()  # normalize

            # Portfolio returns
            port_returns = returns.dot(w)

            # Annual return and volatility
            annual_return = float(port_returns.mean() * 252)
            annual_vol = float(port_returns.std() * np.sqrt(252))
            sharpe = round(annual_return / annual_vol, 2) if annual_vol > 0 else 0

            # VaR (95% confidence) - daily
            var_95 = round(float(np.percentile(port_returns, 5)) * 100, 2)

            # CVaR (Expected Shortfall) - daily
            var_threshold = np.percentile(port_returns, 5)
            tail = port_returns[port_returns <= var_threshold]
            cvar_95 = round(float(tail.mean()) * 100, 2) if len(tail) > 0 else var_95

            # Max Drawdown
            cum_returns = (1 + port_returns).cumprod()
            rolling_max = cum_returns.cummax()
            drawdown = (cum_returns - rolling_max) / rolling_max
            max_drawdown = round(float(drawdown.min()) * 100, 2)

            # Beta (vs market)
            is_indian = any(s.endswith(".NS") or s.endswith(".BO") for s in available)
            market_sym = "^NSEI" if is_indian else "^GSPC"
            beta = None
            try:
                market_data = yf.download(market_sym, period="2y", auto_adjust=True)["Close"]
                market_returns = market_data.pct_change().dropna()
                common = port_returns.index.intersection(market_returns.index)
                if len(common) > 60:
                    pr = port_returns.loc[common].values
                    mr = market_returns.loc[common].values.flatten()
                    cov_matrix = np.cov(pr, mr)
                    market_var = np.var(mr, ddof=1)
                    if market_var > 0:
                        beta = round(float(cov_matrix[0][1] / market_var), 2)
            except Exception:
                pass

            # Covariance and correlation
            cov = returns.cov() * 252
            corr = returns.corr()

            # Correlation matrix as dict
            correlation = {}
            for sym in available:
                if sym in corr:
                    correlation[sym] = {s: round(float(corr.loc[sym, s]), 2) for s in available if s in corr}

            # Risk contribution per stock (marginal contribution to variance)
            cov_values = cov.values
            port_var = float(w @ cov_values @ w)
            marginal = cov_values @ w
            risk_contrib = []
            for i, sym in enumerate(available):
                mc = float(w[i] * marginal[i])
                pct = round((mc / port_var) * 100, 2) if port_var > 0 else 0
                risk_contrib.append({"symbol": sym, "contribution_pct": pct})

            # Diversification ratio
            individual_vols = np.sqrt(np.diag(cov_values))
            weighted_vol_sum = float(w @ individual_vols)
            port_vol = np.sqrt(port_var)
            diversification = round(float(weighted_vol_sum / port_vol), 2) if port_vol > 0 else 1.0

            result = sanitize_json({
                "symbols": available,
                "annual_return_pct": round(annual_return * 100, 2),
                "annual_volatility_pct": round(annual_vol * 100, 2),
                "sharpe_ratio": sharpe,
                "var_95_daily_pct": var_95,
                "cvar_95_daily_pct": cvar_95,
                "max_drawdown_pct": max_drawdown,
                "beta": beta,
                "diversification_ratio": diversification,
                "risk_contribution": sorted(risk_contrib, key=lambda x: x["contribution_pct"], reverse=True),
                "correlation": correlation,
            })

            cache_manager.set("risk", cache_key, result, ttl=3600)
            return result
        except Exception as e:
            print(f"Risk analysis error: {e}")
            import traceback
            traceback.print_exc()
            return None


risk_service = RiskService()
