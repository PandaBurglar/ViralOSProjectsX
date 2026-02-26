/**
 * Smoke tests — run with: npm test
 */

const { parseGitHubUrl, fmtNum, truncate } = require("./utils");
const { enrichProjects } = require("./enrich");
const { generateReport } = require("./report");

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
  console.log("\n=== Utils ===\n");

  assert(fmtNum(1234) === "1.2k", "fmtNum formats thousands");
  assert(fmtNum(1500000) === "1.5M", "fmtNum formats millions");
  assert(fmtNum(42) === "42", "fmtNum leaves small numbers");
  assert(truncate("hello world", 8) === "hello w\u2026", "truncate shortens with ellipsis");
  assert(truncate("short", 10) === "short", "truncate leaves short strings");

  const gh1 = parseGitHubUrl("https://github.com/owner/repo");
  assert(gh1 && gh1.owner === "owner" && gh1.repo === "repo", "parseGitHubUrl parses basic URL");

  const gh2 = parseGitHubUrl("https://github.com/trending");
  assert(gh2 === null, "parseGitHubUrl rejects non-repo paths");

  const gh3 = parseGitHubUrl("check out github.com/cool/project.git for more");
  assert(gh3 && gh3.owner === "cool" && gh3.repo === "project", "parseGitHubUrl strips .git suffix");

  console.log("\n=== Enrichment (live) ===\n");

  // Use a well-known repo for testing
  const testProjects = [
    {
      owner: "facebook",
      repo: "react",
      name: "facebook/react",
      url: "https://github.com/facebook/react",
      description: "React",
      language: "JavaScript",
      stars: 0,
      forks: 0,
      tweets: [],
      totalEngagement: 0,
    },
  ];

  const enriched = await enrichProjects(testProjects, process.env.GITHUB_TOKEN);
  assert(enriched.length === 1, "enrichProjects returns same count");

  const e = enriched[0];
  assert(typeof e.ownerName === "string", "enriched project has ownerName");
  assert(
    e.ownerType === "User" || e.ownerType === "Organization",
    "ownerType is valid"
  );

  console.log("\n=== Report Generator ===\n");

  // Add mock tweet data for report test
  const mockProject = {
    ...e,
    tweets: [
      {
        tweetId: "123",
        tweetUrl: "https://x.com/test/status/123",
        authorUsername: "testuser",
        authorDisplayName: "Test User",
        authorFollowers: 5000,
        text: "Check out this awesome open source project github.com/facebook/react",
        retweets: 50,
        likes: 200,
        replies: 10,
        quotes: 5,
        impressions: 10000,
        createdAt: new Date().toISOString(),
        mentionedHandles: [],
        isOwnerTweet: false,
        ownerMentionedInTweet: false,
      },
    ],
    totalEngagement: 250,
  };

  const report = generateReport([mockProject], "2026-02-25");
  assert(typeof report === "string", "generateReport returns a string");
  assert(report.includes("Viral Open Source Projects"), "report has header");
  assert(report.includes("facebook/react"), "report includes project name");
  assert(report.includes("@testuser"), "report includes tweet author");
  assert(report.includes("Quick Outreach Reference"), "report has outreach table");
  assert(report.includes("GitHub Stats"), "report has stats section");

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test suite error:", err);
  process.exit(1);
});
