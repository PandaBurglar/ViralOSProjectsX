require("dotenv").config();
const cron = require("node-cron");
const { scrapeTrending } = require("./trending");
const { enrichProjects } = require("./enrich");
const { createClient, buildThread, postThread, postIndividual } = require("./poster");

// ---------------------------------------------------------------------------
// Config from environment
// ---------------------------------------------------------------------------

const config = {
  // X / Twitter
  apiKey: process.env.X_API_KEY,
  apiSecret: process.env.X_API_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_SECRET,

  // GitHub
  githubToken: process.env.GITHUB_TOKEN,

  // Bot behaviour
  cronSchedule: process.env.CRON_SCHEDULE || "0 9 * * *",
  projectsPerPost: parseInt(process.env.PROJECTS_PER_POST, 10) || 5,
  trendingPeriod: process.env.TRENDING_PERIOD || "daily",
  trendingLanguages: process.env.TRENDING_LANGUAGES || "all",
  postAsThread: process.env.POST_AS_THREAD !== "false",
};

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function run({ dryRun = false } = {}) {
  console.log(`\n=== ViralOSProjectsX Bot — ${new Date().toISOString()} ===\n`);

  // 1. Scrape trending projects -----------------------------------------------
  console.log(
    `Fetching trending repos (period=${config.trendingPeriod}, lang=${config.trendingLanguages})…`
  );

  const languages = config.trendingLanguages.split(",").map((l) => l.trim());
  let allProjects = [];

  for (const lang of languages) {
    const projects = await scrapeTrending({
      period: config.trendingPeriod,
      language: lang,
      limit: config.projectsPerPost,
    });
    allProjects.push(...projects);
  }

  // Deduplicate by repo URL, keep first occurrence
  const seen = new Set();
  allProjects = allProjects.filter((p) => {
    if (seen.has(p.url)) return false;
    seen.add(p.url);
    return true;
  });

  // Take top N
  allProjects = allProjects.slice(0, config.projectsPerPost);
  console.log(`Found ${allProjects.length} trending projects.\n`);

  if (allProjects.length === 0) {
    console.log("No projects found — skipping post.");
    return;
  }

  // 2. Enrich with owner profiles & contact info -----------------------------
  console.log("Enriching projects with owner & contact data…");
  const enriched = await enrichProjects(allProjects, config.githubToken);

  // 3. Log summary ------------------------------------------------------------
  for (const p of enriched) {
    console.log(`\n--- ${p.name} ---`);
    console.log(`  URL:          ${p.url}`);
    console.log(`  Stars:        ${p.stars}  Forks: ${p.forks}  Today: +${p.starsToday}`);
    console.log(`  Language:     ${p.language}`);
    console.log(`  Owner:        ${p.ownerName || p.owner} (${p.ownerType || "?"})`);
    console.log(`  Email:        ${p.ownerEmail || "—"}`);
    console.log(`  Twitter/X:    ${p.ownerTwitter ? "@" + p.ownerTwitter : "—"}`);
    console.log(`  LinkedIn:     ${p.linkedIn || "—"}`);
    console.log(`  Blog/Web:     ${p.ownerBlog || "—"}`);
    console.log(`  Company:      ${p.ownerCompany || "—"}`);
    console.log(`  Location:     ${p.ownerLocation || "—"}`);
    if (p.extraEmails?.length) {
      console.log(`  README Emails: ${p.extraEmails.join(", ")}`);
    }
    if (p.license) console.log(`  License:      ${p.license}`);
    if (p.topics?.length) console.log(`  Topics:       ${p.topics.join(", ")}`);
  }

  // 4. Build tweets -----------------------------------------------------------
  const tweets = buildThread(enriched, config.trendingPeriod);

  if (dryRun) {
    console.log("\n=== DRY RUN — Tweets that would be posted ===\n");
    tweets.forEach((t, i) => {
      console.log(`--- Tweet ${i + 1} (${t.length} chars) ---`);
      console.log(t);
      console.log();
    });
    return;
  }

  // 5. Post to X --------------------------------------------------------------
  if (!config.apiKey || !config.apiSecret || !config.accessToken || !config.accessSecret) {
    console.error(
      "\nX/Twitter API credentials not set. Add them to .env — see .env.example."
    );
    console.log("Printing tweets to console instead:\n");
    tweets.forEach((t, i) => {
      console.log(`--- Tweet ${i + 1} ---`);
      console.log(t);
      console.log();
    });
    return;
  }

  console.log("\nPosting to X…");
  const client = createClient(config);

  if (config.postAsThread) {
    await postThread(client, tweets);
  } else {
    await postIndividual(client, tweets);
  }

  console.log("\nDone! All tweets posted successfully.");
}

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isOnce = args.includes("--once") || isDryRun;

if (isOnce) {
  // Run once and exit
  run({ dryRun: isDryRun }).catch((err) => {
    console.error("Bot run failed:", err);
    process.exit(1);
  });
} else {
  // Schedule with cron
  console.log(`Scheduling bot to run on cron: ${config.cronSchedule}`);
  console.log("Waiting for next scheduled run… (Ctrl+C to stop)\n");

  cron.schedule(config.cronSchedule, () => {
    run().catch((err) => console.error("Scheduled run failed:", err));
  });

  // Also run immediately on startup
  run().catch((err) => console.error("Initial run failed:", err));
}
