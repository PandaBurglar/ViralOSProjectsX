"""Scrape X (Twitter) for viral tweets that reference GitHub repositories."""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from typing import Optional

import tweepy

from src.config import (
    MAX_TWEETS,
    MIN_LIKES,
    MIN_RETWEETS,
    X_BEARER_TOKEN,
)

# Regex that captures github.com/<owner>/<repo> links (ignores query strings)
_GITHUB_URL_RE = re.compile(
    r"https?://github\.com/([A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+)", re.IGNORECASE
)

# Search queries designed to surface viral open-source project tweets
SEARCH_QUERIES: list[str] = [
    "github.com open source -is:retweet lang:en",
    "github.com repo stars -is:retweet lang:en",
    "open source project github -is:retweet lang:en",
    '"just open sourced" github.com -is:retweet lang:en',
    '"check out this repo" github.com -is:retweet lang:en',
    "github.com trending -is:retweet lang:en",
]


@dataclass
class TweetHit:
    """A single tweet that references a GitHub repository."""

    tweet_id: str
    text: str
    author_id: str
    author_username: str
    author_name: str
    author_profile_url: str
    likes: int
    retweets: int
    replies: int
    impressions: int
    github_urls: list[str] = field(default_factory=list)
    created_at: Optional[str] = None


def _build_client() -> tweepy.Client:
    if not X_BEARER_TOKEN:
        raise RuntimeError(
            "X_BEARER_TOKEN is not set. "
            "Add it to your .env file (see .env.example)."
        )
    return tweepy.Client(bearer_token=X_BEARER_TOKEN, wait_on_rate_limit=True)


def _extract_github_urls(text: str) -> list[str]:
    """Return de-duplicated GitHub repo URLs found in *text*."""
    matches = _GITHUB_URL_RE.findall(text)
    seen: set[str] = set()
    urls: list[str] = []
    for m in matches:
        # Normalise: strip trailing dots / slashes
        slug = m.strip(".").strip("/")
        # Skip non-repo pages (e.g. github.com/features)
        if "/" not in slug:
            continue
        full = f"https://github.com/{slug}"
        if full.lower() not in seen:
            seen.add(full.lower())
            urls.append(full)
    return urls


def scrape_viral_projects(
    queries: list[str] | None = None,
    max_tweets: int | None = None,
    min_likes: int | None = None,
    min_retweets: int | None = None,
) -> list[TweetHit]:
    """Search X for viral tweets that mention GitHub repos.

    Returns a list of `TweetHit` objects sorted by total engagement
    (likes + retweets) descending.
    """
    client = _build_client()
    queries = queries or SEARCH_QUERIES
    max_tweets = max_tweets or MAX_TWEETS
    min_likes = min_likes if min_likes is not None else MIN_LIKES
    min_retweets = min_retweets if min_retweets is not None else MIN_RETWEETS

    seen_tweet_ids: set[str] = set()
    hits: list[TweetHit] = []

    for query in queries:
        try:
            response = client.search_recent_tweets(
                query=query,
                max_results=min(max_tweets, 100),  # API max per page is 100
                tweet_fields=["author_id", "created_at", "public_metrics"],
                expansions=["author_id"],
                user_fields=["username", "name", "url", "public_metrics"],
            )
        except tweepy.TooManyRequests:
            print(f"[rate-limited] Sleeping 15 s before next query…")
            time.sleep(15)
            continue
        except tweepy.TweepyException as exc:
            print(f"[error] Query failed: {exc}")
            continue
        except Exception as exc:
            # Catch network / proxy errors so the bot doesn't crash
            msg = str(exc)
            if "Proxy" in msg or "Tunnel" in msg:
                raise RuntimeError(
                    "Cannot reach api.twitter.com — a proxy is blocking the "
                    "connection. Run this bot on a machine with direct internet access."
                ) from exc
            print(f"[error] Unexpected error: {exc}")
            continue

        if not response.data:
            continue

        # Build an author lookup from the includes
        users_by_id: dict[str, tweepy.User] = {}
        if response.includes and "users" in response.includes:
            for user in response.includes["users"]:
                users_by_id[user.id] = user

        for tweet in response.data:
            if tweet.id in seen_tweet_ids:
                continue
            seen_tweet_ids.add(tweet.id)

            metrics = tweet.public_metrics or {}
            likes = metrics.get("like_count", 0)
            retweets = metrics.get("retweet_count", 0)

            # Apply viral threshold
            if likes < min_likes and retweets < min_retweets:
                continue

            github_urls = _extract_github_urls(tweet.text)
            if not github_urls:
                continue

            author = users_by_id.get(tweet.author_id)
            author_username = author.username if author else "unknown"
            author_name = author.name if author else "unknown"

            hits.append(
                TweetHit(
                    tweet_id=str(tweet.id),
                    text=tweet.text,
                    author_id=str(tweet.author_id),
                    author_username=author_username,
                    author_name=author_name,
                    author_profile_url=f"https://x.com/{author_username}",
                    likes=likes,
                    retweets=retweets,
                    replies=metrics.get("reply_count", 0),
                    impressions=metrics.get("impression_count", 0),
                    github_urls=github_urls,
                    created_at=str(tweet.created_at) if tweet.created_at else None,
                )
            )

    # Sort by total engagement descending
    hits.sort(key=lambda h: h.likes + h.retweets, reverse=True)
    return hits
