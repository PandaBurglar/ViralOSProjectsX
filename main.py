#!/usr/bin/env python3
"""CLI entry-point for the Viral OS Projects X bot.

Usage
-----
    # Use defaults from .env
    python main.py

    # Override thresholds
    python main.py --max-tweets 200 --min-likes 100 --min-retweets 50

    # Skip CSV / JSON export
    python main.py --no-csv --no-json
"""

from __future__ import annotations

import argparse
import sys

from rich.console import Console

from src.bot import run

console = Console()


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scrape X for viral open-source projects and enrich with GitHub data."
    )
    parser.add_argument(
        "--max-tweets",
        type=int,
        default=None,
        help="Max tweets to fetch per search query (default: from .env or 100)",
    )
    parser.add_argument(
        "--min-likes",
        type=int,
        default=None,
        help="Minimum likes for a tweet to count as viral (default: from .env or 50)",
    )
    parser.add_argument(
        "--min-retweets",
        type=int,
        default=None,
        help="Minimum retweets for a tweet to count as viral (default: from .env or 20)",
    )
    parser.add_argument(
        "--no-json",
        action="store_true",
        help="Skip JSON export",
    )
    parser.add_argument(
        "--no-csv",
        action="store_true",
        help="Skip CSV export",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)

    console.print(
        "\n[bold magenta]"
        "╔══════════════════════════════════════════════════╗\n"
        "║   Viral Open-Source Projects X Bot               ║\n"
        "║   Scrape X · Enrich via GitHub · Export results   ║\n"
        "╚══════════════════════════════════════════════════╝"
        "[/bold magenta]\n"
    )

    try:
        projects = run(
            max_tweets=args.max_tweets,
            min_likes=args.min_likes,
            min_retweets=args.min_retweets,
            output_json=not args.no_json,
            output_csv=not args.no_csv,
        )
    except RuntimeError as exc:
        console.print(f"\n[bold red]Error:[/] {exc}")
        sys.exit(1)

    if projects:
        console.print(
            f"[bold green]Done![/] {len(projects)} project(s) processed.\n"
        )
    else:
        console.print("[yellow]No results. Try lowering --min-likes / --min-retweets.[/yellow]\n")


if __name__ == "__main__":
    main()
