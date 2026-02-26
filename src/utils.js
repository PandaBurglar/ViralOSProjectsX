/**
 * Shared utility functions.
 */

/** Truncate a string with an ellipsis. */
function truncate(str, max) {
  if (!str) return "";
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "\u2026";
}

/** Format a number for display (e.g. 1234 → "1.2k"). */
function fmtNum(n) {
  if (n == null) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

/** Parse strings like "1,234" or "12.5k" into numbers. */
function parseCount(str) {
  if (!str) return 0;
  const cleaned = str.replace(/,/g, "").trim();
  const match = cleaned.match(/([\d.]+)\s*k/i);
  if (match) return Math.round(parseFloat(match[1]) * 1000);
  const num = parseInt(cleaned, 10);
  return Number.isNaN(num) ? 0 : num;
}

/**
 * Extract a GitHub owner/repo from a URL string.
 * Returns { owner, repo } or null.
 */
function parseGitHubUrl(url) {
  const match = url.match(
    /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/
  );
  if (!match) return null;
  const repo = match[2].replace(/\.git$/, "");
  // Skip non-repo GitHub paths
  const skip = new Set([
    "topics", "trending", "explore", "settings", "notifications",
    "marketplace", "sponsors", "orgs", "users", "search",
  ]);
  if (skip.has(match[1].toLowerCase())) return null;
  return { owner: match[1], repo };
}

module.exports = { truncate, fmtNum, parseCount, parseGitHubUrl };
