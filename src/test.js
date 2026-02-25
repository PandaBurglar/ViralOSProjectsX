/**
 * Minimal smoke tests — run with: npm test
 */

const { scrapeTrending } = require("./trending");
const { enrichProjects } = require("./enrich");
const { buildThread } = require("./poster");

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

async function main() {
  console.log("\n=== Trending Scraper ===\n");

  const projects = await scrapeTrending({
    period: "daily",
    language: "all",
    limit: 3,
  });

  assert(Array.isArray(projects), "scrapeTrending returns an array");
  assert(projects.length > 0, "scrapeTrending returns at least one project");

  if (projects.length > 0) {
    const p = projects[0];
    assert(typeof p.name === "string" && p.name.includes("/"), "project has owner/repo name");
    assert(p.url.startsWith("https://github.com/"), "project URL is valid");
    assert(typeof p.stars === "number", "stars is a number");
    assert(typeof p.forks === "number", "forks is a number");
    assert(typeof p.owner === "string" && p.owner.length > 0, "owner is present");
  }

  console.log("\n=== Enrichment ===\n");

  const enriched = await enrichProjects(projects.slice(0, 1), process.env.GITHUB_TOKEN);
  assert(enriched.length === 1, "enrichProjects returns same count");

  const e = enriched[0];
  assert(typeof e.ownerName === "string", "enriched project has ownerName");
  assert(e.ownerType === "User" || e.ownerType === "Organization", "ownerType is valid");

  console.log("\n=== Tweet Builder ===\n");

  const tweets = buildThread(enriched, "daily");
  assert(tweets.length >= 2, "buildThread returns header + at least one project tweet");
  assert(tweets[0].includes("Trending"), "header tweet mentions Trending");

  for (let i = 0; i < tweets.length; i++) {
    // Threads can have tweets > 280 chars for the contact summary,
    // but individual project tweets should aim to be short
    if (tweets[i].length > 280) {
      console.log(`  WARN  Tweet ${i + 1} is ${tweets[i].length} chars (over 280)`);
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test suite error:", err);
  process.exit(1);
});
