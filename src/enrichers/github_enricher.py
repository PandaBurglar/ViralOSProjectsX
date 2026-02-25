"""Fetch repository metadata from the GitHub API."""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from typing import Any, Optional

import requests

from src.config import GITHUB_TOKEN

_REPO_SLUG_RE = re.compile(
    r"https?://github\.com/([A-Za-z0-9_.\-]+)/([A-Za-z0-9_.\-]+)"
)

_API_BASE = "https://api.github.com"


def _headers() -> dict[str, str]:
    h: dict[str, str] = {"Accept": "application/vnd.github+json"}
    if GITHUB_TOKEN:
        h["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return h


def _get_json(url: str) -> Optional[dict[str, Any]]:
    """GET *url* and return parsed JSON, or None on failure."""
    for attempt in range(3):
        try:
            resp = requests.get(url, headers=_headers(), timeout=15)
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code == 403:
                # Likely rate-limited — back off
                wait = 2 ** attempt
                print(f"[github] 403 — backing off {wait}s…")
                time.sleep(wait)
                continue
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
        except requests.RequestException as exc:
            print(f"[github] Request error: {exc}")
            time.sleep(2 ** attempt)
    return None


@dataclass
class RepoInfo:
    """Enriched GitHub repository metadata."""

    url: str
    owner: str
    repo_name: str
    description: str
    stars: int
    forks: int
    watchers: int  # "subscribers_count" = people watching the repo
    open_issues: int
    language: str
    license: str
    topics: list[str] = field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""
    homepage: str = ""


@dataclass
class OwnerInfo:
    """GitHub user / org profile data."""

    login: str
    name: str
    bio: str
    company: str
    location: str
    email: str  # public email (if set)
    blog: str  # may contain personal site / LinkedIn
    twitter_username: str  # GitHub profile field
    avatar_url: str
    profile_url: str
    followers: int
    public_repos: int


def parse_repo_slug(github_url: str) -> Optional[tuple[str, str]]:
    """Extract (owner, repo) from a GitHub URL. Returns None if invalid."""
    m = _REPO_SLUG_RE.search(github_url)
    if not m:
        return None
    owner = m.group(1)
    repo = m.group(2).rstrip(".git")
    return owner, repo


def fetch_repo_info(github_url: str) -> Optional[RepoInfo]:
    """Fetch repository metadata for a GitHub URL."""
    slug = parse_repo_slug(github_url)
    if slug is None:
        return None

    owner, repo = slug
    data = _get_json(f"{_API_BASE}/repos/{owner}/{repo}")
    if data is None:
        return None

    license_info = data.get("license") or {}
    return RepoInfo(
        url=data.get("html_url", github_url),
        owner=owner,
        repo_name=repo,
        description=data.get("description") or "",
        stars=data.get("stargazers_count", 0),
        forks=data.get("forks_count", 0),
        watchers=data.get("subscribers_count", 0),
        open_issues=data.get("open_issues_count", 0),
        language=data.get("language") or "",
        license=license_info.get("spdx_id") or license_info.get("name") or "",
        topics=data.get("topics") or [],
        created_at=data.get("created_at") or "",
        updated_at=data.get("updated_at") or "",
        homepage=data.get("homepage") or "",
    )


def fetch_owner_info(owner: str) -> Optional[OwnerInfo]:
    """Fetch public profile data for a GitHub user or organisation."""
    data = _get_json(f"{_API_BASE}/users/{owner}")
    if data is None:
        return None

    return OwnerInfo(
        login=data.get("login", owner),
        name=data.get("name") or "",
        bio=data.get("bio") or "",
        company=data.get("company") or "",
        location=data.get("location") or "",
        email=data.get("email") or "",
        blog=data.get("blog") or "",
        twitter_username=data.get("twitter_username") or "",
        avatar_url=data.get("avatar_url") or "",
        profile_url=data.get("html_url", f"https://github.com/{owner}"),
        followers=data.get("followers", 0),
        public_repos=data.get("public_repos", 0),
    )
