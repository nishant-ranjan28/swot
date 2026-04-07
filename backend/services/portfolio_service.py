# backend/services/portfolio_service.py
import yfinance as yf
import pandas as pd
from pypfopt import EfficientFrontier, risk_models, expected_returns
from pypfopt.discrete_allocation import DiscreteAllocation, get_latest_prices
from utils.cache import cache_manager
from services.stock_service import sanitize_json


class PortfolioService:
    def optimize(self, symbols: list[str], total_amount: float = 100000) -> dict | None:
        cache_key = f"{'_'.join(sorted(symbols))}_{total_amount}"
        cached = cache_manager.get("portfolio_opt", cache_key)
        if cached is not None:
            return cached

        try:
            # Download historical data
            df = yf.download(symbols, period="2y", auto_adjust=True)["Close"]
            if df.empty:
                return None

            # Handle single stock edge case (returns Series not DataFrame)
            if isinstance(df, pd.Series):
                df = df.to_frame(name=symbols[0])

            # Drop columns with too many NaN
            df = df.dropna(axis=1, thresh=int(len(df) * 0.5))
            df = df.dropna()

            if df.shape[1] < 2:
                return None

            # Calculate expected returns and covariance
            mu = expected_returns.mean_historical_return(df)
            S = risk_models.sample_cov(df)

            # Try max_sharpe with decreasing risk-free rates
            ef = EfficientFrontier(mu, S)
            weights = None
            risk_free = 0.05

            for rf in [0.05, 0.02, 0.01, 0.0]:
                try:
                    ef_attempt = EfficientFrontier(mu, S)
                    ef_attempt.max_sharpe(risk_free_rate=rf)
                    weights = ef_attempt.clean_weights()
                    risk_free = rf
                    ef = ef_attempt
                    break
                except ValueError:
                    continue

            # Fallback to min volatility if max_sharpe fails at all rates
            if weights is None:
                ef = EfficientFrontier(mu, S)
                ef.min_volatility()
                weights = ef.clean_weights()
                risk_free = 0.0

            perf = ef.portfolio_performance(verbose=False, risk_free_rate=risk_free)

            # Discrete allocation
            latest_prices = get_latest_prices(df)
            da = DiscreteAllocation(weights, latest_prices, total_portfolio_value=total_amount)
            allocation, leftover = da.greedy_portfolio()

            # Build response
            allocations = []
            for sym, weight in weights.items():
                shares = allocation.get(sym, 0)
                price = float(latest_prices[sym])
                allocations.append({
                    "symbol": sym,
                    "weight": round(float(weight) * 100, 2),
                    "shares": shares,
                    "price": round(price, 2),
                    "value": round(shares * price, 2),
                })

            result = sanitize_json({
                "symbols": symbols,
                "total_amount": total_amount,
                "leftover_cash": round(float(leftover), 2),
                "expected_return": round(float(perf[0]) * 100, 2),
                "volatility": round(float(perf[1]) * 100, 2),
                "sharpe_ratio": round(float(perf[2]), 2),
                "allocations": sorted(allocations, key=lambda x: x["weight"], reverse=True),
            })

            cache_manager.set("portfolio_opt", cache_key, result, ttl=3600)
            return result
        except Exception as e:
            print(f"Portfolio optimization error: {e}")
            return None


portfolio_service = PortfolioService()
