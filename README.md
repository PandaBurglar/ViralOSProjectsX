# Viral Open-Source Projects X Bot

A Python bot that scrapes **X (Twitter)** for viral tweets about open-source projects, enriches each project with **GitHub metadata** (stars, forks, watchers), and looks up **owner contact information** (Twitter, LinkedIn, email).

## Features

- **X/Twitter scraping** — searches multiple queries to find tweets with high engagement that link to GitHub repos
- **GitHub enrichment** — fetches stars, forks, watchers, language, license, topics, and more for every repo found
- **Owner lookup** — pulls the owner's public email, Twitter handle, LinkedIn (via web search), website, bio, and company
- **Rich terminal output** — colour-coded tables rendered with [Rich](https://github.com/Textualize/rich)
- **JSON + CSV export** — timestamped files saved to `output/`

## Prerequisites

| Requirement | Notes |
|---|---|
| Python 3.10+ | Uses `match` / `|` union syntax |
| X (Twitter) API v2 Bearer Token | Required — [apply here](https://developer.x.com/en/portal/dashboard) |
| GitHub Personal Access Token | Optional but recommended (raises rate limit from 60 to 5 000 req/hr) |

## Quick start

```bash
# 1. Clone the repo
git clone https://github.com/PandaBurglar/ViralOSProjectsX.git
cd ViralOSProjectsX

# 2. Create a virtual environment
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure credentials
cp .env.example .env
# Edit .env and add your X_BEARER_TOKEN (and optionally GITHUB_TOKEN)

# 5. Run the bot
python main.py
```

## CLI options

```
python main.py [OPTIONS]

  --max-tweets N      Max tweets per search query (default: 100)
  --min-likes  N      Minimum likes to qualify as viral (default: 50)
  --min-retweets N    Minimum retweets to qualify as viral (default: 20)
  --no-json           Skip JSON export
  --no-csv            Skip CSV export
```

### Examples

```bash
# Only highly viral tweets
python main.py --min-likes 500 --min-retweets 200

# Broader search, skip CSV
python main.py --max-tweets 200 --min-likes 20 --min-retweets 5 --no-csv
```

## Output

### Terminal

The bot prints a rich, colour-coded table for every project found:

- Repository info (URL, stars, forks, watchers, language, license, topics)
- Tweet engagement (likes, retweets, replies, impressions)
- Owner contact (name, Twitter, LinkedIn, email, website, company)

### Files

Results are automatically saved to `output/`:

| Format | Example filename |
|---|---|
| JSON | `output/viral_projects_20260225_143000.json` |
| CSV | `output/viral_projects_20260225_143000.csv` |

## Project structure

```
ViralOSProjectsX/
├── main.py                        # CLI entry point
├── requirements.txt
├── .env.example                   # Credential template
├── .gitignore
├── output/                        # Generated exports (git-ignored)
└── src/
    ├── config.py                  # Loads .env into Python constants
    ├── bot.py                     # Main orchestrator (scrape → enrich → output)
    ├── scrapers/
    │   └── x_scraper.py           # X/Twitter search via Tweepy
    ├── enrichers/
    │   ├── github_enricher.py     # GitHub repo + user API calls
    │   └── owner_lookup.py        # Consolidated contact lookup
    └── utils/
        └── formatters.py          # Rich console, JSON, CSV formatters
```

## How it works

```
┌─────────────┐     ┌──────────────────┐     ┌────────────────┐
│  X / Twitter │────▶│  GitHub API      │────▶│  Owner Lookup  │
│  search_     │     │  /repos/{o}/{r}  │     │  - GitHub email │
│  recent_     │     │  /users/{owner}  │     │  - Twitter      │
│  tweets      │     │                  │     │  - LinkedIn     │
└─────────────┘     └──────────────────┘     └────────────────┘
       │                     │                        │
       └─────────────────────┴────────────────────────┘
                             │
                   ┌─────────▼─────────┐
                   │  Rich console     │
                   │  JSON / CSV files │
                   └───────────────────┘
```

1. **Scrape X** — runs multiple search queries (e.g. `"just open sourced" github.com`) via the Twitter API v2, filters by engagement thresholds, and extracts GitHub URLs from tweet text.
2. **Enrich via GitHub** — for each unique repo URL, fetches stars, forks, watchers, language, license, topics, and the owner's public profile.
3. **Owner lookup** — merges the GitHub user profile (email, twitter, blog) with the tweet author info; attempts a lightweight web search for the owner's LinkedIn profile.
4. **Output** — displays everything in a rich terminal table, and exports to JSON and CSV.

## Rate limits

| API | Unauthenticated | Authenticated |
|---|---|---|
| X API v2 (search) | N/A (bearer required) | 450 req / 15 min |
| GitHub API | 60 req / hr | 5 000 req / hr |

The bot automatically waits when rate-limited.

## License

MIT
