# ViralOSProjectsX

An X/Twitter bot that posts daily updates on **trending open source projects** from GitHub — complete with stars, forks, owner profiles, LinkedIn links, emails, and other contact info.

## What It Does

Every day (on a configurable schedule), the bot:

1. **Scrapes GitHub Trending** to find repos gaining popularity (daily/weekly/monthly)
2. **Enriches each project** via the GitHub API with:
   - Stars, forks, language, license, topics
   - Owner name, bio, company, location
   - Owner email, Twitter/X handle, blog/website
   - LinkedIn URL (scanned from README)
   - Additional emails found in the README
3. **Posts a thread to X/Twitter** with a summary of each project and a contacts roundup

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/PandaBurglar/ViralOSProjectsX.git
cd ViralOSProjectsX

# 2. Install dependencies
npm install

# 3. Copy the example env and fill in your credentials
cp .env.example .env
# Edit .env with your X API keys and (optional) GitHub token

# 4. Do a dry run (prints tweets to console, doesn't post)
npm run dry-run

# 5. Post once right now
npm run post

# 6. Start the scheduled bot (runs daily via cron)
npm start
```

## Configuration (.env)

| Variable | Required | Description |
|---|---|---|
| `X_API_KEY` | Yes | Twitter/X API key |
| `X_API_SECRET` | Yes | Twitter/X API secret |
| `X_ACCESS_TOKEN` | Yes | Twitter/X access token |
| `X_ACCESS_SECRET` | Yes | Twitter/X access secret |
| `GITHUB_TOKEN` | No* | GitHub PAT for higher rate limits |
| `CRON_SCHEDULE` | No | Cron expression (default: `0 9 * * *` = 9 AM UTC) |
| `PROJECTS_PER_POST` | No | Number of projects per batch (default: 5) |
| `TRENDING_PERIOD` | No | `daily`, `weekly`, or `monthly` |
| `TRENDING_LANGUAGES` | No | Comma-separated languages or `all` |
| `POST_AS_THREAD` | No | `true` for threads, `false` for individual tweets |

*Without a GitHub token you're limited to 60 API requests/hour. With one, you get 5,000/hr.

## Getting API Keys

### X / Twitter
1. Go to the [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Create a project and app
3. Under "User authentication settings", enable **Read and Write** permissions
4. Generate your API Key, API Secret, Access Token, and Access Secret
5. Copy them into your `.env`

### GitHub Token (optional)
1. Go to [GitHub Settings → Tokens](https://github.com/settings/tokens)
2. Generate a new classic token — no special scopes needed (public repo access is default)
3. Copy it into your `.env` as `GITHUB_TOKEN`

## Project Structure

```
src/
├── index.js       Main entry point, scheduler, CLI flags
├── trending.js    Scrapes GitHub Trending page
├── enrich.js      Enriches projects via GitHub API (owner profile, contacts, README scan)
├── poster.js      Formats tweets and posts to X via twitter-api-v2
└── test.js        Smoke tests
```

## CLI Flags

```bash
node src/index.js              # Start scheduled bot (runs immediately + on cron)
node src/index.js --once       # Run once and exit
node src/index.js --dry-run    # Run once, print tweets, don't post
```

## Example Output

```
--- vercel/ai ---
  URL:          https://github.com/vercel/ai
  Stars:        12.3k  Forks: 1.8k  Today: +156
  Language:     TypeScript
  Owner:        Vercel (Organization)
  Email:        —
  Twitter/X:    @vercel
  LinkedIn:     https://linkedin.com/company/vercel
  Blog/Web:     https://vercel.com
  Company:      @vercel
  Location:     San Francisco, CA
```

## License

MIT
