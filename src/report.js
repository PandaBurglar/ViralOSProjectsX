const { fmtNum, truncate } = require("./utils");

/**
 * Generate a markdown report with a master tweet table and expandable repo details.
 *
 * @param {Array} projects - enriched projects with .tweets array
 * @param {string} date    - report date string (YYYY-MM-DD)
 * @returns {string} markdown content
 */
function generateReport(projects, date) {
  const lines = [];

  const withContact = projects.filter(
    (p) => p.ownerEmail || p.linkedIn || p.ownerTwitter || p.extraEmails?.length
  ).length;
  const totalEngagement = projects.reduce((s, p) => s + (p.totalEngagement || 0), 0);

  // === Header ===
  lines.push(`# Viral Open Source Projects \u2014 ${date}`);
  lines.push("");
  lines.push(`> **${projects.length}** repos \u00B7 **${fmtNum(totalEngagement)}** total engagement \u00B7 **${withContact}** owners with contact info`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // === Master Tweet Table ===
  lines.push("## Top Tweet Per Repo");
  lines.push("");
  lines.push("| # | Project | Tweet | Author | \u2764\uFE0F Likes | \uD83D\uDD01 RTs | \uD83D\uDCAC Replies | Link |");
  lines.push("|---|---------|-------|--------|-------|------|---------|------|");

  let rowNum = 0;
  for (const p of projects) {
    if (!p.tweets?.length) continue;
    // Only show the single highest-engagement tweet per repo
    const t = p.tweets[0]; // already sorted by engagement descending
    rowNum++;
    const cleanText = t.text.replace(/\n+/g, " ").trim();
    const shortText = truncate(cleanText, 80);
    lines.push(
      `| ${rowNum} | [${p.name}](${p.url}) | ${shortText} | @${t.authorUsername} (${fmtNum(t.authorFollowers)}) | ${fmtNum(t.likes)} | ${fmtNum(t.retweets)} | ${fmtNum(t.replies)} | [View](${t.tweetUrl}) |`
    );
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // === Quick Outreach Reference ===
  lines.push("## Quick Outreach Reference");
  lines.push("");
  lines.push("| # | Project | Stars | Owner | Email | LinkedIn | Twitter | Engagement |");
  lines.push("|---|---------|-------|-------|-------|----------|---------|------------|");

  projects.forEach((p, i) => {
    const email = p.ownerEmail || (p.extraEmails?.[0]) || "\u2014";
    const li = p.linkedIn ? `[Profile](${p.linkedIn})` : "\u2014";
    const tw = p.ownerTwitter ? `[@${p.ownerTwitter}](https://x.com/${p.ownerTwitter})` : "\u2014";

    lines.push(
      `| ${i + 1} | [${p.name}](${p.url}) | ${fmtNum(p.stars)} | ${p.ownerName || p.owner} | ${email} | ${li} | ${tw} | ${fmtNum(p.totalEngagement || 0)} |`
    );
  });

  lines.push("");
  lines.push("---");
  lines.push("");

  // === Expandable Repo Details ===
  lines.push("## Repo Details");
  lines.push("");

  projects.forEach((p, i) => {
    const totalRt = p.tweets ? p.tweets.reduce((s, t) => s + t.retweets, 0) : 0;
    const totalLk = p.tweets ? p.tweets.reduce((s, t) => s + t.likes, 0) : 0;
    const tweetCount = p.tweets?.length || 0;

    lines.push(`<details id="${slugify(p.name)}">`);
    lines.push(`<summary><strong>${i + 1}. ${p.name}</strong> \u2014 \u2B50 ${fmtNum(p.stars)} \u00B7 ${tweetCount} tweet${tweetCount !== 1 ? "s" : ""} \u00B7 ${fmtNum(totalLk)} likes \u00B7 ${fmtNum(totalRt)} retweets</summary>`);
    lines.push("");

    // Description
    if (p.description) {
      lines.push(`> ${truncate(p.description, 250)}`);
      lines.push("");
    }

    // GitHub stats
    lines.push("**GitHub Stats**");
    lines.push("");
    lines.push("| Stars | Forks | Watchers | Language | License |");
    lines.push("|-------|-------|----------|----------|---------|");
    lines.push(`| ${fmtNum(p.stars)} | ${fmtNum(p.forks)} | ${fmtNum(p.watchers || 0)} | ${p.language || "\u2014"} | ${p.license || "\u2014"} |`);
    lines.push("");

    if (p.topics?.length) {
      lines.push(`**Topics:** ${p.topics.join(", ")}`);
      lines.push("");
    }

    lines.push(`**Repo:** [${p.url}](${p.url})`);
    lines.push("");

    // Tweets (top 3 most popular)
    if (p.tweets?.length) {
      const shownTweets = p.tweets.slice(0, 3);
      const extraCount = p.tweets.length - shownTweets.length;
      lines.push(`**Top Tweets:**${extraCount > 0 ? ` (showing ${shownTweets.length} of ${p.tweets.length})` : ""}`);
      lines.push("");

      for (const t of shownTweets) {
        const dateStr = t.createdAt
          ? new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "";

        const cleanText = t.text.replace(/\n+/g, " ").trim();

        lines.push(`> **@${t.authorUsername}** (${fmtNum(t.authorFollowers)} followers) \u2014 ${dateStr}`);
        lines.push(`> ${cleanText}`);

        const metrics = [];
        metrics.push(`\uD83D\uDCAC ${fmtNum(t.replies)}`);
        metrics.push(`\uD83D\uDD01 ${fmtNum(t.retweets)}`);
        metrics.push(`\u2764\uFE0F ${fmtNum(t.likes)}`);
        if (t.impressions) metrics.push(`\uD83D\uDC41\uFE0F ${fmtNum(t.impressions)}`);
        lines.push(`> ${metrics.join(" \u00B7 ")} \u00B7 [View tweet](${t.tweetUrl})`);

        if (t.isOwnerTweet) {
          lines.push(`> \u2139\uFE0F *Posted by repo owner*`);
        } else if (t.ownerMentionedInTweet) {
          lines.push(`> \u2139\uFE0F *Mentions repo owner @${p.ownerTwitter || p.owner}*`);
        }
        lines.push("");
      }
    }

    // Owner contact
    lines.push("**Owner Contact:**");
    lines.push("");
    lines.push("| Field | Value |");
    lines.push("|-------|-------|");
    lines.push(`| Name | ${p.ownerName || p.owner} |`);
    lines.push(`| Email | ${p.ownerEmail || "\u2014"} |`);
    if (p.extraEmails?.length) {
      const extras = p.extraEmails.filter((e) => e !== p.ownerEmail);
      if (extras.length) lines.push(`| Other Emails | ${extras.join(", ")} |`);
    }
    lines.push(`| Twitter | ${p.ownerTwitter ? `[@${p.ownerTwitter}](https://x.com/${p.ownerTwitter})` : "\u2014"} |`);
    lines.push(`| LinkedIn | ${p.linkedIn ? `[Profile](${p.linkedIn})` : "\u2014"} |`);
    lines.push(`| Blog | ${p.ownerBlog || "\u2014"} |`);
    lines.push(`| Company | ${p.ownerCompany || "\u2014"} |`);
    lines.push(`| Location | ${p.ownerLocation || "\u2014"} |`);
    lines.push("");
    lines.push("</details>");
    lines.push("");
  });

  lines.push("---");
  lines.push(`*Generated by ViralOSProjectsX on ${new Date().toISOString()}*`);
  lines.push("");

  return lines.join("\n");
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

module.exports = { generateReport };
