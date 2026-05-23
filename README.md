# StockPulse — AI Stock Analytics Dashboard

A real-time stock market analytics dashboard with AI-powered technical analysis, portfolio simulation, and peer comparison.

![Python](https://img.shields.io/badge/Python-3.x-blue) ![Flask](https://img.shields.io/badge/Flask-3.0-green) ![Chart.js](https://img.shields.io/badge/Chart.js-4.x-orange)

## Features

- **Live Watchlist** — Track up to 10 stocks with real-time prices, sparklines, and auto-refresh (30s)
- **AI Recommendation Engine** — BUY / HOLD / SELL signals with confidence scores based on 6 technical indicators
- **Technical Indicators** — RSI, MACD, Bollinger Bands, SMA crossover, Momentum, Volatility
- **Portfolio Simulator** — "What if I invested $X?" calculator with performance chart
- **Peer Comparison** — Side-by-side table comparing fundamentals across your watchlist
- **Detailed Fundamentals** — Market Cap, P/E, EPS, Revenue, EBITDA, Profit Margin, ROE, and 20+ metrics
- **Analyst Price Targets** — Wall Street consensus with visual target bar
- **Volume Chart** — Color-coded trading volume bars (green = up day, red = down day)
- **Comparison Mode** — Overlay multiple stock price charts

## Tech Stack

- **Backend:** Python 3, Flask, yfinance, NumPy, Pandas
- **Frontend:** HTML5, CSS3 (Custom Dark Mode), Vanilla JavaScript (ES6+)
- **Charts:** Chart.js 4.x (via CDN)

## Quick Start

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/stock-dashboard.git
cd stock-dashboard

# Install dependencies
pip install -r requirements.txt

# Run
python app.py
```

Open **stock-dashboard-steel-ten.vercel.app** in your browser.

## Project Structure

```
stock-dashboard/
├── app.py              # Flask backend + AI analysis engine
├── requirements.txt    # Python dependencies
├── templates/
│   └── index.html      # Dashboard UI
└── static/
    ├── style.css       # Dark mode styles
    └── script.js       # Frontend logic
```

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/stock?ticker=AAPL` | 6-month historical prices + 50-day SMA |
| `GET /api/quote?tickers=AAPL,MSFT` | Batch real-time quotes with sparklines |
| `GET /api/analysis?ticker=AAPL` | AI technical analysis + recommendation |
| `GET /api/fundamentals?ticker=AAPL` | Company fundamentals (20+ metrics) |
| `GET /api/portfolio_sim?ticker=AAPL&amount=10000&months=6` | Investment simulator |
| `GET /api/peers?tickers=AAPL,MSFT,GOOGL` | Peer comparison data |
| `GET /api/validate?ticker=AAPL` | Ticker validation |
| `GET /api/batch_analysis?tickers=AAPL,MSFT` | Batch AI signals |

## Disclaimer

This tool is for educational purposes only. AI recommendations are based on technical indicators and do not constitute financial advice.
