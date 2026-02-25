"""Output formatters — rich console table, JSON, and CSV."""

from __future__ import annotations

import csv
import json
import os
from dataclasses import asdict
from datetime import datetime
from typing import Any

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text


def _ensure_output_dir() -> str:
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "output")
    os.makedirs(out, exist_ok=True)
    return out


# ── Console (rich) ───────────────────────────────────────────────────────────

def print_results(projects: list[dict[str, Any]]) -> None:
    """Pretty-print the full results to the terminal."""
    console = Console()

    if not projects:
        console.print("\n[yellow]No viral open-source projects found.[/yellow]\n")
        return

    console.print(
        Panel(
            f"[bold green]Found {len(projects)} viral open-source project(s) on X[/bold green]",
            expand=False,
        )
    )

    for i, proj in enumerate(projects, 1):
        repo = proj.get("repo") or {}
        owner = proj.get("owner") or {}
        tweet = proj.get("tweet") or {}

        # ── Repo table ───────────────────────────────────────────────
        repo_table = Table(
            title=f"#{i}  {repo.get('owner', '?')}/{repo.get('repo_name', '?')}",
            show_header=False,
            title_style="bold cyan",
            border_style="dim",
            padding=(0, 1),
        )
        repo_table.add_column("Field", style="bold", width=18)
        repo_table.add_column("Value")

        repo_table.add_row("URL", repo.get("url", "—"))
        repo_table.add_row("Description", repo.get("description", "—") or "—")
        repo_table.add_row("Stars", f"{repo.get('stars', 0):,}")
        repo_table.add_row("Forks", f"{repo.get('forks', 0):,}")
        repo_table.add_row("Watchers", f"{repo.get('watchers', 0):,}")
        repo_table.add_row("Open Issues", f"{repo.get('open_issues', 0):,}")
        repo_table.add_row("Language", repo.get("language", "—") or "—")
        repo_table.add_row("License", repo.get("license", "—") or "—")
        topics = repo.get("topics") or []
        if topics:
            repo_table.add_row("Topics", ", ".join(topics))
        if repo.get("homepage"):
            repo_table.add_row("Homepage", repo["homepage"])

        console.print(repo_table)

        # ── Tweet engagement ─────────────────────────────────────────
        eng = Text()
        eng.append(f"  Likes: {tweet.get('likes', 0):,}", style="red")
        eng.append(f"  |  Retweets: {tweet.get('retweets', 0):,}", style="green")
        eng.append(f"  |  Replies: {tweet.get('replies', 0):,}", style="blue")
        eng.append(f"  |  Impressions: {tweet.get('impressions', 0):,}", style="magenta")
        console.print(eng)
        console.print(f"  Tweet: https://x.com/i/status/{tweet.get('tweet_id', '')}")

        # ── Owner info ───────────────────────────────────────────────
        if owner:
            owner_table = Table(
                title="Owner / Author Info",
                show_header=False,
                title_style="bold yellow",
                border_style="dim",
                padding=(0, 1),
            )
            owner_table.add_column("Field", style="bold", width=18)
            owner_table.add_column("Value")

            owner_table.add_row("Name", owner.get("name", "—") or "—")
            owner_table.add_row("GitHub", owner.get("github_profile_url", "—") or "—")
            owner_table.add_row("Twitter / X", owner.get("twitter_url", "—") or "—")
            owner_table.add_row("LinkedIn", owner.get("linkedin_url", "—") or "—")
            owner_table.add_row("Email", owner.get("email", "—") or "—")
            owner_table.add_row("Website / Blog", owner.get("blog_or_website", "—") or "—")
            owner_table.add_row("Company", owner.get("company", "—") or "—")
            owner_table.add_row("Location", owner.get("location", "—") or "—")
            owner_table.add_row("Bio", owner.get("bio", "—") or "—")
            owner_table.add_row("Followers", f"{owner.get('followers', 0):,}")

            console.print(owner_table)

        console.print("─" * 72)


# ── JSON ─────────────────────────────────────────────────────────────────────

def save_json(projects: list[dict[str, Any]], filepath: str | None = None) -> str:
    """Write results to a JSON file and return the path."""
    if filepath is None:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filepath = os.path.join(_ensure_output_dir(), f"viral_projects_{ts}.json")
    with open(filepath, "w", encoding="utf-8") as fh:
        json.dump(projects, fh, indent=2, default=str)
    return filepath


# ── CSV ──────────────────────────────────────────────────────────────────────

_CSV_COLUMNS = [
    "repo_url",
    "repo_name",
    "description",
    "stars",
    "forks",
    "watchers",
    "open_issues",
    "language",
    "license",
    "topics",
    "tweet_url",
    "tweet_likes",
    "tweet_retweets",
    "tweet_impressions",
    "owner_name",
    "github_profile",
    "twitter_url",
    "linkedin_url",
    "email",
    "blog_or_website",
    "company",
    "location",
]


def save_csv(projects: list[dict[str, Any]], filepath: str | None = None) -> str:
    """Write results to a CSV file and return the path."""
    if filepath is None:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filepath = os.path.join(_ensure_output_dir(), f"viral_projects_{ts}.csv")

    with open(filepath, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=_CSV_COLUMNS)
        writer.writeheader()
        for proj in projects:
            repo = proj.get("repo") or {}
            tweet = proj.get("tweet") or {}
            owner = proj.get("owner") or {}
            row = {
                "repo_url": repo.get("url", ""),
                "repo_name": f"{repo.get('owner', '')}/{repo.get('repo_name', '')}",
                "description": repo.get("description", ""),
                "stars": repo.get("stars", 0),
                "forks": repo.get("forks", 0),
                "watchers": repo.get("watchers", 0),
                "open_issues": repo.get("open_issues", 0),
                "language": repo.get("language", ""),
                "license": repo.get("license", ""),
                "topics": "; ".join(repo.get("topics") or []),
                "tweet_url": f"https://x.com/i/status/{tweet.get('tweet_id', '')}",
                "tweet_likes": tweet.get("likes", 0),
                "tweet_retweets": tweet.get("retweets", 0),
                "tweet_impressions": tweet.get("impressions", 0),
                "owner_name": owner.get("name", ""),
                "github_profile": owner.get("github_profile_url", ""),
                "twitter_url": owner.get("twitter_url", ""),
                "linkedin_url": owner.get("linkedin_url", ""),
                "email": owner.get("email", ""),
                "blog_or_website": owner.get("blog_or_website", ""),
                "company": owner.get("company", ""),
                "location": owner.get("location", ""),
            }
            writer.writerow(row)
    return filepath
