"""Best-effort owner contact / social lookup.

Aggregates data from:
 - The GitHub user profile (twitter, blog, email)
 - The original tweet author info
 - A lightweight web search for LinkedIn profiles
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

import requests
from bs4 import BeautifulSoup

from src.enrichers.github_enricher import OwnerInfo


@dataclass
class OwnerContact:
    """Consolidated contact information for a project owner."""

    github_username: str
    github_profile_url: str
    name: str
    email: str
    twitter_handle: str
    twitter_url: str
    linkedin_url: str
    blog_or_website: str
    bio: str
    company: str
    location: str
    followers: int = 0

    # Source tracking so the user knows where each piece came from
    sources: dict[str, str] = field(default_factory=dict)


def _guess_linkedin_from_blog(blog: str) -> str:
    """If the blog URL is already a LinkedIn profile, return it."""
    if blog and "linkedin.com/in/" in blog.lower():
        return blog
    return ""


def _search_linkedin(name: str, company: str) -> str:
    """Try a lightweight DuckDuckGo HTML search for a LinkedIn profile.

    This is best-effort — it will not work in every environment and
    respects rate limits.  Returns the first linkedin.com/in/ URL
    found, or an empty string.
    """
    if not name:
        return ""

    query_parts = [f'site:linkedin.com/in/ "{name}"']
    if company:
        query_parts.append(company)
    query = " ".join(query_parts)

    try:
        resp = requests.get(
            "https://html.duckduckgo.com/html/",
            params={"q": query},
            headers={"User-Agent": "ViralOSProjectsX/1.0 (research bot)"},
            timeout=10,
        )
        if resp.status_code != 200:
            return ""

        soup = BeautifulSoup(resp.text, "html.parser")
        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"]
            if "linkedin.com/in/" in href:
                # Extract the actual URL from DuckDuckGo redirect
                match = re.search(r"(https?://[^\s&]+linkedin\.com/in/[^\s&\"]+)", href)
                if match:
                    return match.group(1)
    except requests.RequestException:
        pass

    return ""


def build_owner_contact(
    github_owner: Optional[OwnerInfo],
    tweet_author_username: str = "",
    tweet_author_name: str = "",
) -> OwnerContact:
    """Merge all available data into a single `OwnerContact`."""

    gh = github_owner
    sources: dict[str, str] = {}

    # ── GitHub-sourced fields ────────────────────────────────────────────
    github_username = gh.login if gh else ""
    github_profile = gh.profile_url if gh else ""
    name = gh.name if gh else ""
    email = gh.email if gh else ""
    twitter_handle = gh.twitter_username if gh else ""
    blog = gh.blog if gh else ""
    bio = gh.bio if gh else ""
    company = gh.company if gh else ""
    location = gh.location if gh else ""
    followers = gh.followers if gh else 0

    if email:
        sources["email"] = "github_profile"

    # ── Twitter handle: prefer GitHub profile, fall back to tweet author ─
    if twitter_handle:
        sources["twitter"] = "github_profile"
    elif tweet_author_username:
        twitter_handle = tweet_author_username
        sources["twitter"] = "tweet_author"

    twitter_url = f"https://x.com/{twitter_handle}" if twitter_handle else ""

    if not name and tweet_author_name:
        name = tweet_author_name
        sources["name"] = "tweet_author"
    elif name:
        sources["name"] = "github_profile"

    # ── LinkedIn ─────────────────────────────────────────────────────────
    linkedin_url = _guess_linkedin_from_blog(blog)
    if linkedin_url:
        sources["linkedin"] = "github_blog_field"
    else:
        linkedin_url = _search_linkedin(name, company)
        if linkedin_url:
            sources["linkedin"] = "web_search"

    if blog:
        sources["blog"] = "github_profile"

    return OwnerContact(
        github_username=github_username,
        github_profile_url=github_profile,
        name=name,
        email=email,
        twitter_handle=twitter_handle,
        twitter_url=twitter_url,
        linkedin_url=linkedin_url,
        blog_or_website=blog,
        bio=bio,
        company=company,
        location=location,
        followers=followers,
        sources=sources,
    )
