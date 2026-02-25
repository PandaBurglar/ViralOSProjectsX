"""Centralised configuration loaded from environment variables."""

import os
from dotenv import load_dotenv

load_dotenv()

# ── X / Twitter API ──────────────────────────────────────────────────────────
X_BEARER_TOKEN = os.getenv("X_BEARER_TOKEN", "")
X_API_KEY = os.getenv("X_API_KEY", "")
X_API_SECRET = os.getenv("X_API_SECRET", "")
X_ACCESS_TOKEN = os.getenv("X_ACCESS_TOKEN", "")
X_ACCESS_TOKEN_SECRET = os.getenv("X_ACCESS_TOKEN_SECRET", "")

# ── GitHub ───────────────────────────────────────────────────────────────────
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")

# ── Scraping tunables ────────────────────────────────────────────────────────
MAX_TWEETS = int(os.getenv("MAX_TWEETS", "100"))
MIN_LIKES = int(os.getenv("MIN_LIKES", "50"))
MIN_RETWEETS = int(os.getenv("MIN_RETWEETS", "20"))
