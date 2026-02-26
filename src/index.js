require("dotenv").config();
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const { searchXForRepos } = require("./x-search");
const { enrichProjects } = require("./enrich");
const { generateReport } = require("./report");

// ---------------------------------------------------------------------------
// Config from environment
// ---------------------------------------------------------------------------

const DEFAULT_QUERIES = [
  // URL-based: tweets with a github.com link
  '"open source" url:"github.com" -is:retweet',
  '"OSS" url:"github.com" -is:retweet',
  'url:"github.com" ("just released" OR "just launched" OR "check out" OR "built this" OR "new repo") -is:retweet',
  'url:"github.com" ("starred" OR "trending" OR "cool project" OR "awesome tool" OR "game changer") -is:retweet',
  'url:"github.com" ("free tool" OR "self-hosted" OR "just open-sourced") -is:retweet',
  'url:"github.com" (stars OR "side project" OR "weekend project" OR "new project") -is:retweet',
  // Name-based: viral tweets about OSS that may NOT have a GitHub link
  '"open sourced" GitHub -is:retweet -is:reply',
  '"open source" "GitHub repo" -is:retweet -is:reply',
  '"just built" "open source" -is:retweet',
  '"just released" "open source" -is:retweet',
  '("GitHub repo" OR "on GitHub") ("built" OR "released" OR "launched" OR "created") -is:retweet',
  '"open source" github -is:retweet -is:reply',
  '"open sourced" -is:retweet -is:reply',
  'github ("just built" OR "just launched" OR "just released") -is:retweet',
];

const config = {
  // X / Twitter (for searching)
  bearerToken: process.env.X_BEARER_TOKEN,
  apiKey: process.env.X_API_KEY,
  apiSecret: process.env.X_API_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_SECRET,

  // GitHub
  githubToken: process.env.GITHUB_TOKEN,

  // Search behaviour
  searchQueries: process.env.SEARCH_QUERIES
    ? process.env.SEARCH_QUERIES.split("|").map((q) => q.trim())
    : DEFAULT_QUERIES,
  maxResults: parseInt(process.env.MAX_RESULTS, 10) || 500,
  minEngagement: parseInt(process.env.MIN_ENGAGEMENT, 10) || 10,
  maxProjects: parseInt(process.env.PROJECTS_PER_POST, 10) || 20,
  defaultDays: parseInt(process.env.DEFAULT_DAYS, 10) || 1,

  // Output
  workspacePath:
    process.env.LEADSCRM_WORKSPACE_PATH ||
    path.join(
      process.env.HOME || "",
      "Projects",
      "LeadsCrm",
      "workspace",
      "reports",
      "viral-oss"
    ),

  // Scheduling (midnight daily)
  cronSchedule: process.env.CRON_SCHEDULE || "0 0 * * *",
};

// ---------------------------------------------------------------------------
// CLI flags (parsed early so run() can access --days)
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isOnce = args.includes("--once") || isDryRun;

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function run({ dryRun = false } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`\n=== ViralOSProjectsX — ${today} ===\n`);

  // 1. Search X for tweets mentioning open source GitHub repos ---------------
  if (!config.bearerToken) {
    console.error(
      "X_BEARER_TOKEN not set. Add it to .env — see .env.example."
    );
    process.exit(1);
  }

  // Parse --days flag (default: 1 day for daily runs)
  const daysArg = args.find((a) => a.startsWith("--days="));
  const days = daysArg ? parseInt(daysArg.split("=")[1], 10) : config.defaultDays;

  console.log(`Step 1: Searching X for open source repo mentions (last ${days} day${days > 1 ? "s" : ""})…\n`);
  let repos = await searchXForRepos({
    bearerToken: config.bearerToken,
    queries: config.searchQueries,
    maxResults: config.maxResults,
    minEngagement: config.minEngagement,
    days,
    githubToken: config.githubToken,
  });

  if (repos.length === 0) {
    console.log("\nNo validated repos found — skipping report.");
    return;
  }

  // Take top N
  repos = repos.slice(0, config.maxProjects);
  console.log(`\nTop ${repos.length} repos selected for report.\n`);

  // 2. Enrich with owner profiles & contact info ----------------------------
  console.log("Step 2: Enriching projects with owner & contact data…\n");
  const enriched = await enrichProjects(repos, config.githubToken);

  // 3. Cross-reference owner X handles with tweet data ----------------------
  console.log("Step 3: Cross-referencing owner handles…\n");
  for (const p of enriched) {
    if (!p.tweets) continue;
    const ownerHandle = (p.ownerTwitter || "").toLowerCase();

    for (const t of p.tweets) {
      // Check if this tweet was posted by the repo owner
      t.isOwnerTweet =
        ownerHandle && t.authorUsername.toLowerCase() === ownerHandle;

      // Check if this tweet @mentions the repo owner
      t.ownerMentionedInTweet =
        ownerHandle &&
        !t.isOwnerTweet &&
        t.mentionedHandles.includes(ownerHandle);
    }
  }

  // 4. Log summary to console -----------------------------------------------
  for (const p of enriched) {
    const tweetCount = p.tweets?.length || 0;
    console.log(`  ${p.name} — ${tweetCount} tweets, ${p.totalEngagement} engagement`);
    console.log(`    Owner: ${p.ownerName || p.owner} | Email: ${p.ownerEmail || "—"} | Twitter: ${p.ownerTwitter ? "@" + p.ownerTwitter : "—"} | LinkedIn: ${p.linkedIn || "—"}`);
  }

  // 5. Generate report ------------------------------------------------------
  console.log("\nStep 4: Generating markdown report…\n");
  const report = generateReport(enriched, today);

  if (dryRun) {
    console.log("=== DRY RUN — Report Preview ===\n");
    console.log(report);
    return;
  }

  // 6. Save to LeadsCrm workspace -------------------------------------------
  const outDir = config.workspacePath;
  fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `${today}.md`);
  fs.writeFileSync(outFile, report, "utf-8");
  console.log(`Report saved to: ${outFile}`);
  console.log("\nDone!");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

if (isOnce) {
  run({ dryRun: isDryRun }).catch((err) => {
    console.error("Bot run failed:", err);
    process.exit(1);
  });
} else {
  console.log(`Scheduling daily report on cron: ${config.cronSchedule}`);
  console.log("Waiting for next scheduled run… (Ctrl+C to stop)\n");

  cron.schedule(config.cronSchedule, () => {
    run().catch((err) => console.error("Scheduled run failed:", err));
  });

  // Also run immediately on startup
  run().catch((err) => console.error("Initial run failed:", err));
}
