"""
StockPulse Analytics Dashboard — Flask Backend
Real-time quotes, technical analysis, fundamentals, portfolio simulator, and peer comparison.
"""

from flask import Flask, render_template, request, jsonify
import yfinance as yf
import numpy as np
import pandas as pd
import time

app = Flask(__name__)

# ── Simple in-memory cache for Vercel serverless ──
_cache = {}
def cached(key, ttl, fn):
    now = time.time()
    if key in _cache and now - _cache[key]["t"] < ttl:
        return _cache[key]["v"]
    val = fn()
    _cache[key] = {"v": val, "t": now}
    return val


def get_currency(sym):
    """Detect currency based on ticker suffix."""
    s = sym.upper()
    if s.endswith(".NS") or s.endswith(".BO"):
        return {"symbol": "\u20b9", "code": "INR", "locale": "en-IN"}
    if s.endswith(".L") or s.endswith(".IL"):
        return {"symbol": "\u00a3", "code": "GBP", "locale": "en-GB"}
    if s.endswith(".TO") or s.endswith(".V"):
        return {"symbol": "C$", "code": "CAD", "locale": "en-CA"}
    return {"symbol": "$", "code": "USD", "locale": "en-US"}


# ═══════════════════════════════════════════════════════════════════
#  Technical Analysis
# ═══════════════════════════════════════════════════════════════════

def compute_rsi(prices, period=14):
    deltas = np.diff(prices)
    gains = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)
    ag = pd.Series(gains).rolling(window=period, min_periods=period).mean().iloc[-1]
    al = pd.Series(losses).rolling(window=period, min_periods=period).mean().iloc[-1]
    if al == 0: return 100.0
    return round(100.0 - (100.0 / (1.0 + ag / al)), 2)

def compute_macd(prices, fast=12, slow=26, signal=9):
    s = pd.Series(prices)
    ef = s.ewm(span=fast, adjust=False).mean()
    es = s.ewm(span=slow, adjust=False).mean()
    ml = ef - es; sl = ml.ewm(span=signal, adjust=False).mean(); h = ml - sl
    return {"macd": round(float(ml.iloc[-1]),4), "signal": round(float(sl.iloc[-1]),4), "histogram": round(float(h.iloc[-1]),4)}

def compute_bollinger(prices, period=20, sd=2):
    s = pd.Series(prices); sma = s.rolling(window=period).mean(); std = s.rolling(window=period).std()
    u = float((sma + sd * std).iloc[-1]); lo = float((sma - sd * std).iloc[-1])
    return {"upper": round(u,2), "middle": round(float(sma.iloc[-1]),2), "lower": round(lo,2),
            "position": round((prices[-1] - lo) / max(u - lo, 0.01), 2)}

def compute_sma(prices, w):
    return round(float(np.mean(prices[-w:])), 2) if len(prices) >= w else None

def compute_momentum(prices, p=10):
    return round(((prices[-1] - prices[-p-1]) / prices[-p-1]) * 100, 2) if len(prices) >= p+1 else 0.0

def compute_volatility(prices, p=20):
    if len(prices) < p: return 0.0
    r = np.diff(prices[-p:]) / prices[-p:-1]
    return round(float(np.std(r) * np.sqrt(252) * 100), 2)

def generate_ai_recommendation(prices, volumes):
    signals = []; rb = []; rs = []
    rsi = compute_rsi(prices)
    if rsi < 30: signals.append(("buy", .85)); rb.append(f"RSI at {rsi} — oversold, strong buy signal")
    elif rsi < 40: signals.append(("buy", .55)); rb.append(f"RSI at {rsi} — approaching oversold")
    elif rsi > 70: signals.append(("sell", .85)); rs.append(f"RSI at {rsi} — overbought, risk of pullback")
    elif rsi > 60: signals.append(("sell", .45)); rs.append(f"RSI at {rsi} — elevated, watch for reversal")
    else: signals.append(("hold", .5))

    macd = compute_macd(prices)
    if macd["histogram"] > 0 and macd["macd"] > macd["signal"]:
        signals.append(("buy", .7)); rb.append("MACD bullish crossover — positive momentum")
    elif macd["histogram"] < 0 and macd["macd"] < macd["signal"]:
        signals.append(("sell", .7)); rs.append("MACD bearish crossover — downward momentum")
    else: signals.append(("hold", .5))

    bb = compute_bollinger(prices)
    if bb["position"] < .15: signals.append(("buy", .75)); rb.append("Price near lower Bollinger Band — bounce likely")
    elif bb["position"] > .85: signals.append(("sell", .75)); rs.append("Price near upper Bollinger Band — may pull back")
    else: signals.append(("hold", .5))

    sma20 = compute_sma(prices, 20); sma50 = compute_sma(prices, 50)
    if sma20 and sma50:
        if sma20 > sma50: signals.append(("buy", .65)); rb.append(f"SMA-20 (${sma20}) > SMA-50 (${sma50}) — bullish")
        else: signals.append(("sell", .65)); rs.append(f"SMA-20 (${sma20}) < SMA-50 (${sma50}) — bearish")

    mom = compute_momentum(prices)
    if mom > 3: signals.append(("buy", .6)); rb.append(f"10-day momentum +{mom}% — strong uptrend")
    elif mom < -3: signals.append(("sell", .6)); rs.append(f"10-day momentum {mom}% — downward pressure")
    else: signals.append(("hold", .5))

    if len(volumes) >= 20:
        av = float(np.mean(volumes[-20:])); rv = float(np.mean(volumes[-5:]))
        if rv > av * 1.3:
            if prices[-1] > prices[-5]: signals.append(("buy", .6)); rb.append("High volume + rising price — institutional buying")
            else: signals.append(("sell", .6)); rs.append("High volume + falling price — distribution")
        else: signals.append(("hold", .4))

    vol = compute_volatility(prices)
    risk = "Low" if vol < 20 else ("Medium" if vol < 35 else "High")
    bs = sum(x[1] for x in signals if x[0]=="buy")
    ss = sum(x[1] for x in signals if x[0]=="sell")
    hs = sum(x[1] for x in signals if x[0]=="hold")
    t = bs + ss + hs or 1
    bp = round(bs/t*100); sp = round(ss/t*100); hp = 100 - bp - sp
    if bs > ss and bs > hs: a, c = "BUY", min(bp+10, 95)
    elif ss > bs and ss > hs: a, c = "SELL", min(sp+10, 95)
    else: a, c = "HOLD", max(hp, 40)
    return {"action": a, "confidence": c, "buy_pct": bp, "sell_pct": sp, "hold_pct": hp,
            "reasons_buy": rb, "reasons_sell": rs, "risk_level": risk, "volatility": vol,
            "indicators": {"rsi": rsi, "macd": macd, "bollinger": bb, "sma_20": sma20, "sma_50": sma50, "momentum_10d": mom}}


def _dl_raw(sym, period="6mo"):
    """Robust download — tries yf.download (most reliable), then Ticker.history."""
    try:
        df = yf.download(sym, period=period, progress=False, timeout=5)
        if not df.empty:
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            return df
    except Exception:
        pass
    try:
        df = yf.Ticker(sym).history(period=period)
        if not df.empty:
            return df
    except Exception:
        pass
    return pd.DataFrame()

def _dl(sym, period="6mo"):
    """Cached download — avoids re-fetching within TTL."""
    ttl = 60 if period in ("1d", "5d") else 120
    return cached(f"dl:{sym}:{period}", ttl, lambda: _dl_raw(sym, period))


# ═══════════════════════════════════════════════════════════════════
#  Routes
# ═══════════════════════════════════════════════════════════════════

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/validate", methods=["GET"])
def validate_ticker():
    """Validate a ticker using yf.download (most reliable method)."""
    sym = request.args.get("ticker", "").strip().upper()
    if not sym:
        return jsonify({"valid": False, "error": "Empty ticker"}), 400

    df = _dl(sym, "5d")
    if df.empty:
        # Suggest suffix for international stocks
        hint = ""
        if "." not in sym:
            hint = " For Indian stocks add .NS (e.g. RELIANCE.NS). For London add .L."
        return jsonify({"valid": False, "error": f"'{sym}' not found.{hint}"}), 404

    name = sym
    try:
        info = yf.Ticker(sym).info
        if info:
            name = info.get("shortName") or info.get("longName") or sym
    except Exception:
        pass
    return jsonify({"valid": True, "ticker": sym, "name": name})


@app.route("/api/stock", methods=["GET"])
def get_stock_data():
    ticker = request.args.get("ticker", "AAPL").strip().upper()
    if not ticker:
        return jsonify({"error": "Ticker required."}), 400
    df = _dl(ticker, "6mo")
    if df.empty:
        return jsonify({"error": f"No data for '{ticker}'."}), 404

    df.index = pd.to_datetime(df.index)
    dates = df.index.strftime("%Y-%m-%d").tolist()
    prices = df["Close"].round(2).tolist()
    volumes = df["Volume"].tolist() if "Volume" in df.columns else []

    ca = np.array(prices, dtype=float)
    if len(ca) >= 50:
        sv = np.round(np.convolve(ca, np.ones(50)/50, mode="valid"), 2)
        sma = [None]*49 + sv.tolist()
    else:
        sma = [None]*len(ca)

    return jsonify({"ticker": ticker, "dates": dates, "prices": prices, "sma": sma, "volumes": volumes, "currency": get_currency(ticker)})


@app.route("/api/quote", methods=["GET"])
def get_quote():
    raw = request.args.get("tickers", "AAPL").strip().upper()
    symbols = [s.strip() for s in raw.split(",") if s.strip()][:10]
    results = {}
    for sym in symbols:
        try:
            df = _dl(sym, "1mo")
            if df.empty: results[sym] = {"error": "No data"}; continue
            c = df["Close"]
            cur = round(float(c.iloc[-1]), 2)
            prev = round(float(c.iloc[-2]), 2) if len(c) >= 2 else cur
            ch = round(cur - prev, 2)
            cp = round((ch / prev) * 100, 2) if prev else 0.0
            sp = c.round(2).tolist()
            results[sym] = {"price": cur, "prev_close": prev, "change": ch, "change_pct": cp, "sparkline": sp, "currency": get_currency(sym)}
        except Exception:
            results[sym] = {"error": "Failed"}
    return jsonify({"quotes": results})


@app.route("/api/fundamentals", methods=["GET"])
def get_fundamentals():
    sym = request.args.get("ticker", "AAPL").strip().upper()
    try:
        info = yf.Ticker(sym).info or {}
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    cur = get_currency(sym)
    g = lambda k, fb=None: info.get(k, fb) if info.get(k) is not None else fb
    return jsonify({
        "ticker": sym, "name": g("shortName", g("longName", sym)),
        "currency": cur,
        "sector": g("sector","—"), "industry": g("industry","—"),
        "market_cap": g("marketCap"), "pe_ratio": g("trailingPE"), "forward_pe": g("forwardPE"),
        "eps": g("trailingEps"), "peg_ratio": g("pegRatio"), "price_to_book": g("priceToBook"),
        "dividend_yield": g("dividendYield"), "dividend_rate": g("dividendRate"), "beta": g("beta"),
        "fifty_two_week_high": g("fiftyTwoWeekHigh"), "fifty_two_week_low": g("fiftyTwoWeekLow"),
        "fifty_day_avg": g("fiftyDayAverage"), "two_hundred_day_avg": g("twoHundredDayAverage"),
        "avg_volume": g("averageVolume"), "revenue": g("totalRevenue"), "ebitda": g("ebitda"),
        "net_income": g("netIncomeToCommon"), "profit_margin": g("profitMargins"),
        "revenue_growth": g("revenueGrowth"), "earnings_growth": g("earningsGrowth"),
        "return_on_equity": g("returnOnEquity"), "debt_to_equity": g("debtToEquity"),
        "free_cash_flow": g("freeCashflow"),
        "target_high": g("targetHighPrice"), "target_low": g("targetLowPrice"),
        "target_mean": g("targetMeanPrice"), "recommendation": g("recommendationKey","N/A"),
        "num_analysts": g("numberOfAnalystOpinions"), "current_price": g("currentPrice"),
    })


@app.route("/api/analysis", methods=["GET"])
def get_analysis():
    sym = request.args.get("ticker", "AAPL").strip().upper()
    df = _dl(sym, "6mo")
    if df.empty:
        return jsonify({"error": f"No data for '{sym}'."}), 404
    prices = df["Close"].values.astype(float).tolist()
    volumes = df["Volume"].values.astype(float).tolist() if "Volume" in df.columns else []
    rec = generate_ai_recommendation(prices, volumes)
    rec["ticker"] = sym
    return jsonify(rec)


@app.route("/api/batch_analysis", methods=["GET"])
def batch_analysis():
    raw = request.args.get("tickers", "").strip().upper()
    symbols = [s.strip() for s in raw.split(",") if s.strip()][:10]
    results = {}
    for sym in symbols:
        try:
            df = _dl(sym, "6mo")
            if df.empty: continue
            p = df["Close"].values.astype(float).tolist()
            v = df["Volume"].values.astype(float).tolist() if "Volume" in df.columns else []
            r = generate_ai_recommendation(p, v)
            results[sym] = {"action": r["action"], "confidence": r["confidence"],
                            "risk_level": r["risk_level"], "buy_pct": r["buy_pct"],
                            "sell_pct": r["sell_pct"], "hold_pct": r["hold_pct"]}
        except Exception:
            pass
    return jsonify({"analyses": results})


@app.route("/api/portfolio_sim", methods=["GET"])
def portfolio_sim():
    sym = request.args.get("ticker", "AAPL").strip().upper()
    amount = float(request.args.get("amount", "10000"))
    months = int(request.args.get("months", "6"))
    pmap = {1:"1mo",3:"3mo",6:"6mo",12:"1y",24:"2y",60:"5y"}
    df = _dl(sym, pmap.get(months, "6mo"))
    if df.empty:
        return jsonify({"error": f"No data for '{sym}'."}), 404
    c = df["Close"]
    sp = float(c.iloc[0]); ep = float(c.iloc[-1])
    shares = amount / sp; cv = round(shares * ep, 2)
    profit = round(cv - amount, 2); rp = round((profit / amount) * 100, 2)
    dates = df.index.strftime("%Y-%m-%d").tolist()
    pv = [round(shares * float(p), 2) for p in c.values]
    return jsonify({"ticker": sym, "investment": amount, "months": months,
                    "start_price": round(sp,2), "end_price": round(ep,2),
                    "shares": round(shares,4), "current_value": cv,
                    "profit": profit, "return_pct": rp, "dates": dates, "portfolio_values": pv,
                    "currency": get_currency(sym)})


@app.route("/api/peers", methods=["GET"])
def get_peers():
    raw = request.args.get("tickers", "").strip().upper()
    symbols = [s.strip() for s in raw.split(",") if s.strip()][:10]
    results = {}
    for sym in symbols:
        try:
            info = yf.Ticker(sym).info or {}
            df = _dl(sym, "6mo")
            c = df["Close"] if not df.empty else pd.Series()
            price = round(float(c.iloc[-1]),2) if not c.empty else None
            start = round(float(c.iloc[0]),2) if not c.empty else None
            ch6m = round(((price-start)/start)*100,2) if price and start else None
            results[sym] = {
                "name": info.get("shortName", sym), "price": price, "change_6m": ch6m,
                "market_cap": info.get("marketCap"), "pe_ratio": info.get("trailingPE"),
                "eps": info.get("trailingEps"), "beta": info.get("beta"),
                "dividend_yield": info.get("dividendYield"), "revenue": info.get("totalRevenue"),
                "profit_margin": info.get("profitMargins"),
                "52w_high": info.get("fiftyTwoWeekHigh"), "52w_low": info.get("fiftyTwoWeekLow"),
                "currency": get_currency(sym),
            }
        except Exception:
            results[sym] = {"error": "Failed"}
    return jsonify({"peers": results})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
