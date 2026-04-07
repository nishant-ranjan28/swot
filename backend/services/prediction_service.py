# backend/services/prediction_service.py
import numpy as np
import pandas as pd
import yfinance as yf
from sklearn.preprocessing import MinMaxScaler
from sklearn.linear_model import Ridge
from sklearn.ensemble import GradientBoostingRegressor
from utils.cache import cache_manager
from services.stock_service import sanitize_json


class PredictionService:
    def predict(self, symbol: str, days: int = 7) -> dict | None:
        cache_key = f"{symbol}_{days}"
        cached = cache_manager.get("prediction", cache_key)
        if cached is not None:
            return cached

        try:
            ticker = yf.Ticker(symbol)
            df = ticker.history(period="2y")
            if df.empty or len(df) < 100:
                return None

            # Feature engineering: predict the price N days ahead directly
            df_feat = df[["Close", "High", "Low", "Volume"]].copy()

            # Technical features
            df_feat["return_1d"] = df_feat["Close"].pct_change(1)
            df_feat["return_5d"] = df_feat["Close"].pct_change(5)
            df_feat["return_20d"] = df_feat["Close"].pct_change(20)
            df_feat["ma_5"] = df_feat["Close"].rolling(5).mean()
            df_feat["ma_20"] = df_feat["Close"].rolling(20).mean()
            df_feat["ma_50"] = df_feat["Close"].rolling(50).mean()
            df_feat["ma_ratio_5_20"] = df_feat["ma_5"] / df_feat["ma_20"]
            df_feat["ma_ratio_20_50"] = df_feat["ma_20"] / df_feat["ma_50"]
            df_feat["volatility_10"] = df_feat["Close"].rolling(10).std() / df_feat["Close"]
            df_feat["volatility_20"] = df_feat["Close"].rolling(20).std() / df_feat["Close"]
            df_feat["high_low_range"] = (df_feat["High"] - df_feat["Low"]) / df_feat["Close"]
            df_feat["volume_ratio"] = df_feat["Volume"] / df_feat["Volume"].rolling(20).mean()

            # RSI
            delta = df_feat["Close"].diff()
            gain = delta.where(delta > 0, 0).rolling(14).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
            rs = gain / loss
            df_feat["rsi"] = 100 - (100 / (1 + rs))

            # Target: future return (not future price — avoids scale issues)
            df_feat["target"] = df_feat["Close"].shift(-days) / df_feat["Close"] - 1
            df_feat = df_feat.dropna()

            if len(df_feat) < 60:
                return None

            feature_cols = [
                "return_1d", "return_5d", "return_20d",
                "ma_ratio_5_20", "ma_ratio_20_50",
                "volatility_10", "volatility_20",
                "high_low_range", "volume_ratio", "rsi",
            ]

            X = df_feat[feature_cols].values
            y = df_feat["target"].values

            # Scale features (not target — target is already a ratio)
            scaler_X = MinMaxScaler()
            X_scaled = scaler_X.fit_transform(X)

            # Train/test split — last 60 days for testing
            if len(df_feat) < 120:
                split = -max(20, len(df_feat) // 4)
            else:
                split = -60
            X_train, X_test = X_scaled[:split], X_scaled[split:]
            y_train, y_test = y[:split], y[split:]

            # Model 1: Ridge Regression (stable, prevents overfitting)
            ridge = Ridge(alpha=1.0)
            ridge.fit(X_train, y_train)
            ridge_score = ridge.score(X_test, y_test)

            # Model 2: Gradient Boosting
            gb = GradientBoostingRegressor(
                n_estimators=100, max_depth=3, learning_rate=0.05,
                subsample=0.8, random_state=42
            )
            gb.fit(X_train, y_train)
            gb_score = gb.score(X_test, y_test)

            # Pick best model
            if gb_score > ridge_score and gb_score > 0:
                best_model = gb
                best_name = "Gradient Boosting"
                best_score = gb_score
            else:
                best_model = ridge
                best_name = "Ridge Regression"
                best_score = ridge_score

            # Predict future return using latest features
            latest_features = X_scaled[-1:].copy()
            predicted_return = float(best_model.predict(latest_features)[0])

            # Clamp prediction to reasonable range (-30% to +30%)
            predicted_return = max(-0.30, min(0.30, predicted_return))

            current_price = float(df["Close"].iloc[-1])
            predicted_price = round(current_price * (1 + predicted_return), 2)

            # Generate daily interpolated predictions
            predictions = []
            last_date = df.index[-1]
            trading_day = 0
            for i in range(days * 2):  # iterate enough to skip weekends
                pred_date = last_date + pd.Timedelta(days=i + 1)
                if pred_date.weekday() >= 5:
                    continue
                trading_day += 1
                # Linear interpolation from current to predicted
                progress = trading_day / days
                daily_price = round(current_price + (predicted_price - current_price) * progress, 2)
                predictions.append({
                    "date": pred_date.strftime("%Y-%m-%d"),
                    "predicted_price": daily_price,
                })
                if trading_day >= days:
                    break

            direction = "Bullish" if predicted_return > 0.005 else "Bearish" if predicted_return < -0.005 else "Neutral"
            change_pct = round(predicted_return * 100, 2)

            # MAPE on test set
            test_pred = best_model.predict(X_test)
            # Calculate MAPE on the return predictions
            nonzero = y_test != 0
            if np.sum(nonzero) > 0:
                mape = round(float(np.mean(np.abs((y_test[nonzero] - test_pred[nonzero]) / y_test[nonzero])) * 100), 2)
            else:
                mape = 0

            result = sanitize_json({
                "symbol": symbol,
                "model": best_name,
                "model_accuracy": round(max(best_score, 0) * 100, 2),
                "mape": min(mape, 999),  # cap display
                "current_price": round(current_price, 2),
                "predicted_price": predicted_price,
                "predictions": predictions,
                "direction": direction,
                "predicted_change_pct": change_pct,
                "prediction_days": days,
                "disclaimer": "AI predictions are experimental and should not be used as the sole basis for investment decisions.",
            })

            cache_manager.set("prediction", cache_key, result, ttl=86400)
            return result
        except Exception as e:
            print(f"Prediction error: {e}")
            import traceback
            traceback.print_exc()
            return None


prediction_service = PredictionService()
