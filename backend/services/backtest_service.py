# backend/services/backtest_service.py
import yfinance as yf
import pandas as pd
from backtesting import Backtest, Strategy
from backtesting.lib import crossover
from backtesting.test import SMA
from utils.cache import cache_manager


class SmaCross(Strategy):
    fast = 10
    slow = 30

    def init(self):
        price = self.data.Close
        self.ma_fast = self.I(SMA, price, self.fast)
        self.ma_slow = self.I(SMA, price, self.slow)

    def next(self):
        if crossover(self.ma_fast, self.ma_slow):
            self.buy()
        elif crossover(self.ma_slow, self.ma_fast):
            self.sell()


class RsiStrategy(Strategy):
    rsi_period = 14
    overbought = 70
    oversold = 30

    def init(self):
        close = pd.Series(self.data.Close)
        delta = close.diff()
        gain = delta.where(delta > 0, 0).rolling(self.rsi_period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(self.rsi_period).mean()
        rs = gain / loss
        self.rsi = self.I(lambda: 100 - (100 / (1 + rs)))

    def next(self):
        if self.rsi[-1] < self.oversold:
            self.buy()
        elif self.rsi[-1] > self.overbought:
            self.sell()


STRATEGIES = {
    "sma_crossover": {"class": SmaCross, "params": {"fast": 10, "slow": 30}, "name": "SMA Crossover"},
    "rsi": {"class": RsiStrategy, "params": {"rsi_period": 14, "overbought": 70, "oversold": 30}, "name": "RSI Strategy"},
}


class BacktestService:
    def run_backtest(self, symbol: str, strategy_name: str = "sma_crossover",
                     period: str = "2y", cash: float = 100000, **params) -> dict | None:
        cache_key = f"{symbol}_{strategy_name}_{period}_{cash}_{str(params)}"
        cached = cache_manager.get("backtest", cache_key)
        if cached is not None:
            return cached

        try:
            ticker = yf.Ticker(symbol)
            df = ticker.history(period=period)
            if df.empty or len(df) < 100:
                return None

            # Clean data for backtesting lib
            df = df[["Open", "High", "Low", "Close", "Volume"]].dropna()

            strat_config = STRATEGIES.get(strategy_name)
            if not strat_config:
                return None

            strat_class = strat_config["class"]
            merged_params = {**strat_config["params"], **params}

            bt = Backtest(df, strat_class, cash=cash, commission=0.001)
            stats = bt.run(**merged_params)

            # Extract trade log
            trades = []
            if hasattr(stats, '_trades') and stats._trades is not None:
                for _, trade in stats._trades.iterrows():
                    trades.append({
                        "entry_date": str(trade.get("EntryTime", "")),
                        "exit_date": str(trade.get("ExitTime", "")),
                        "entry_price": round(float(trade.get("EntryPrice", 0)), 2),
                        "exit_price": round(float(trade.get("ExitPrice", 0)), 2),
                        "pnl": round(float(trade.get("PnL", 0)), 2),
                        "return_pct": round(float(trade.get("ReturnPct", 0) * 100), 2),
                        "type": "Long" if trade.get("Size", 0) > 0 else "Short",
                    })

            # Build equity curve
            equity = stats._equity_curve
            equity_data = []
            if equity is not None:
                sampled = equity.iloc[::max(1, len(equity)//100)]  # Max 100 points
                for idx, row in sampled.iterrows():
                    equity_data.append({
                        "date": idx.strftime("%Y-%m-%d"),
                        "equity": round(float(row.get("Equity", cash)), 2),
                    })

            result = {
                "symbol": symbol,
                "strategy": strat_config["name"],
                "period": period,
                "initial_cash": cash,
                "final_equity": round(float(stats["Equity Final [$]"]), 2),
                "total_return_pct": round(float(stats["Return [%]"]), 2),
                "buy_hold_return_pct": round(float(stats["Buy & Hold Return [%]"]), 2),
                "max_drawdown_pct": round(float(stats["Max. Drawdown [%]"]), 2),
                "sharpe_ratio": round(float(stats["Sharpe Ratio"]), 2) if stats["Sharpe Ratio"] == stats["Sharpe Ratio"] else None,
                "win_rate_pct": round(float(stats["Win Rate [%]"]), 2),
                "total_trades": int(stats["# Trades"]),
                "avg_trade_pct": round(float(stats["Avg. Trade [%]"]), 2),
                "best_trade_pct": round(float(stats["Best Trade [%]"]), 2),
                "worst_trade_pct": round(float(stats["Worst Trade [%]"]), 2),
                "profit_factor": round(float(stats["Profit Factor"]), 2) if stats["Profit Factor"] == stats["Profit Factor"] else None,
                "trades": trades[:50],  # Limit to 50 trades
                "equity_curve": equity_data,
                "available_strategies": list(STRATEGIES.keys()),
            }

            from services.stock_service import sanitize_json
            result = sanitize_json(result)
            cache_manager.set("backtest", cache_key, result, ttl=3600)
            return result
        except Exception as e:
            print(f"Backtest error: {e}")
            return None


backtest_service = BacktestService()
