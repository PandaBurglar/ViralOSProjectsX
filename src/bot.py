"""Main orchestrator — ties scraping, enrichment, and output together."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

from src.enrichers.github_enricher import (
    fetch_owner_info,
    fetch_repo_info,
    parse_repo_slug,
)
from src.enrichers.owner_lookup import build_owner_contact
from src.scrapers.x_scraper import TweetHit, scrape_viral_projects
from src.utils.formatters import print_results, save_csv, save_json

console = Console()


def run(
    max_tweets: int | None = None,
    min_likes: int | None = None,
    min_retweets: int | None = None,
    output_json: bool = True,
    output_csv: bool = True,
) -> list[dict[str, Any]]:
    """Run the full pipeline and return structured results.

    1. Scrape X for viral tweets that link to GitHub repos.
    2. Enrich each repo with GitHub metadata (stars, forks, watchers …).
    3. Look up owner contact info (Twitter, LinkedIn, email).
    4. Display results and optionally export to JSON / CSV.
    """

    # ── Step 1: Scrape X ─────────────────────────────────────────────────
    console.print("\n[bold cyan]Step 1/3[/] Scraping X for viral open-source projects…\n")

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        task = progress.add_task("Searching tweets…", total=None)
        tweets: list[TweetHit] = scrape_viral_projects(
            max_tweets=max_tweets,
            min_likes=min_likes,
            min_retweets=min_retweets,
        )
        progress.update(task, description=f"Found {len(tweets)} viral tweet(s)")

    if not tweets:
        console.print("[yellow]No viral tweets with GitHub links found.[/yellow]")
        return []

    # De-duplicate by GitHub URL — keep the tweet with highest engagement
    seen_repos: dict[str, tuple[TweetHit, str]] = {}
    for tweet in tweets:
        for url in tweet.github_urls:
            key = url.lower()
            if key not in seen_repos or (
                tweet.likes + tweet.retweets
                > seen_repos[key][0].likes + seen_repos[key][0].retweets
            ):
                seen_repos[key] = (tweet, url)

    console.print(f"  Unique repositories: [green]{len(seen_repos)}[/green]\n")

    # ── Step 2: Enrich with GitHub data ──────────────────────────────────
    console.print("[bold cyan]Step 2/3[/] Fetching GitHub repo & owner data…\n")

    projects: list[dict[str, Any]] = []

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        task = progress.add_task("Enriching…", total=len(seen_repos))

        for github_url, (tweet, _) in seen_repos.items():
            slug = parse_repo_slug(github_url)
            repo_info = fetch_repo_info(github_url)

            owner_info = None
            if slug:
                owner_info = fetch_owner_info(slug[0])

            # ── Step 3 (per repo): owner contact lookup ──────────────
            owner_contact = build_owner_contact(
                github_owner=owner_info,
                tweet_author_username=tweet.author_username,
                tweet_author_name=tweet.author_name,
            )

            projects.append(
                {
                    "repo": asdict(repo_info) if repo_info else {"url": github_url},
                    "owner": asdict(owner_contact),
                    "tweet": {
                        "tweet_id": tweet.tweet_id,
                        "text": tweet.text,
                        "author_username": tweet.author_username,
                        "likes": tweet.likes,
                        "retweets": tweet.retweets,
                        "replies": tweet.replies,
                        "impressions": tweet.impressions,
                        "created_at": tweet.created_at,
                    },
                }
            )
            progress.advance(task)

    # ── Sort by stars descending ─────────────────────────────────────────
    projects.sort(
        key=lambda p: p.get("repo", {}).get("stars", 0), reverse=True
    )

    # ── Display ──────────────────────────────────────────────────────────
    console.print("\n[bold cyan]Step 3/3[/] Results\n")
    print_results(projects)

    # ── Export ────────────────────────────────────────────────────────────
    if output_json:
        path = save_json(projects)
        console.print(f"[green]JSON saved →[/green] {path}")
    if output_csv:
        path = save_csv(projects)
        console.print(f"[green]CSV  saved →[/green] {path}")

    console.print()
    return projects
