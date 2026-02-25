const { TwitterApi } = require("twitter-api-v2");

/**
 * Build a Twitter API v2 client from env credentials.
 */
function createClient({ apiKey, apiSecret, accessToken, accessSecret }) {
  return new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken,
    accessSecret,
  });
}

/**
 * Format a single enriched project into tweet-sized text.
 * Twitter allows 280 characters; we aim to stay under that.
 */
function formatProjectTweet(project, index) {
  const lines = [];

  lines.push(`${index}. ${project.name}`);
  lines.push(`${project.description ? truncate(project.description, 90) : ""}`);
  lines.push("");

  const statsLine = [
    `Stars: ${fmtNum(project.stars)}`,
    `Forks: ${fmtNum(project.forks)}`,
  ];
  if (project.starsToday) statsLine.push(`+${fmtNum(project.starsToday)} today`);
  lines.push(statsLine.join(" | "));

  if (project.language && project.language !== "Unknown") {
    lines.push(`Lang: ${project.language}`);
  }

  // Owner info
  const ownerBits = [`Owner: @${project.owner}`];
  if (project.ownerName && project.ownerName !== project.owner) {
    ownerBits[0] = `Owner: ${project.ownerName} (@${project.owner})`;
  }
  lines.push(ownerBits.join(""));

  lines.push(project.url);

  return lines.join("\n");
}

/**
 * Build the full thread content: a header tweet + one tweet per project + contact summary.
 */
function buildThread(projects, period) {
  const tweets = [];
  const today = new Date().toISOString().slice(0, 10);
  const periodLabel =
    period === "daily" ? "Today" : period === "weekly" ? "This Week" : "This Month";

  // Header tweet
  tweets.push(
    `Trending Open Source Projects — ${periodLabel} (${today})\n\n` +
      `Top ${projects.length} repos gaining traction right now.\n\n` +
      `Thread below with links, stats & owner contacts.`
  );

  // One tweet per project
  projects.forEach((p, i) => {
    tweets.push(formatProjectTweet(p, i + 1));
  });

  // Contact / LinkedIn summary tweet
  const contactLines = [];
  for (const p of projects) {
    const bits = [`${p.name}:`];
    if (p.ownerEmail) bits.push(`Email: ${p.ownerEmail}`);
    if (p.extraEmails?.length) {
      const extras = p.extraEmails.filter((e) => e !== p.ownerEmail);
      if (extras.length) bits.push(`Also: ${extras.join(", ")}`);
    }
    if (p.linkedIn) bits.push(`LinkedIn: ${p.linkedIn}`);
    if (p.ownerTwitter) bits.push(`X: @${p.ownerTwitter}`);
    if (p.ownerBlog && !p.ownerBlog.includes("linkedin.com")) {
      bits.push(`Web: ${p.ownerBlog}`);
    }
    if (bits.length > 1) contactLines.push(bits.join(" | "));
  }

  if (contactLines.length) {
    // Split contact info across multiple tweets if needed
    let current = "Owner Contacts & Socials:\n\n";
    for (const line of contactLines) {
      if ((current + line + "\n").length > 270) {
        tweets.push(current.trim());
        current = "";
      }
      current += line + "\n";
    }
    if (current.trim()) tweets.push(current.trim());
  }

  return tweets;
}

/**
 * Post a thread to X/Twitter.
 * Each element of `tweets` becomes a tweet in the thread.
 */
async function postThread(client, tweets) {
  const rwClient = client.readWrite;
  let lastTweetId = null;
  const posted = [];

  for (const text of tweets) {
    const payload = { text };
    if (lastTweetId) {
      payload.reply = { in_reply_to_tweet_id: lastTweetId };
    }
    const { data } = await rwClient.v2.tweet(payload);
    lastTweetId = data.id;
    posted.push(data);
    console.log(`  Posted tweet ${data.id}: ${text.slice(0, 50)}...`);
  }

  return posted;
}

/**
 * Post each project as an individual (non-threaded) tweet.
 */
async function postIndividual(client, tweets) {
  const rwClient = client.readWrite;
  const posted = [];

  for (const text of tweets) {
    const { data } = await rwClient.v2.tweet({ text });
    posted.push(data);
    console.log(`  Posted tweet ${data.id}: ${text.slice(0, 50)}...`);
  }

  return posted;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

function fmtNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

module.exports = { createClient, buildThread, postThread, postIndividual };
