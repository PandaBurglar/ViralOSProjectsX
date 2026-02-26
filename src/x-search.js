const { TwitterApi } = require("twitter-api-v2");
const axios = require("axios");
const { parseGitHubUrl } = require("./utils");

const GITHUB_API = "https://api.github.com";

/**
 * Search X for tweets mentioning open source GitHub repos.
 *
 * Uses TWO strategies:
 *  1. URL-based: tweets containing github.com links
 *  2. Name-based: viral tweets mentioning "open source" / "github" by project name,
 *     then resolves the repo via GitHub search API
 */
async function searchXForRepos({
  bearerToken,
  queries,
  maxResults = 200,
  minEngagement = 10,
  days = 7,
  githubToken,
}) {
  const client = new TwitterApi(bearerToken).readOnly;

  const allTweets = [];
  const userMap = new Map();

  // --- Phase 1: Run all search queries (URL-based + keyword-based) ----------
  // search/recent is hard-capped at 7 days by the X API (basic/pro tiers).
  // Full-archive search (searchAll) requires Academic Research or Enterprise access.
  const effectiveDays = Math.min(days, 7);
  if (days > 7) {
    console.log(`  ⚠ X API search/recent is limited to 7 days. Requested ${days} days but searching last 7.`);
    console.log(`    (Full-archive search requires Academic Research or Enterprise API access.)`);
  }

  const startTime = new Date();
  startTime.setDate(startTime.getDate() - effectiveDays);

  const searchParams = {
    "tweet.fields": ["public_metrics", "created_at", "entities", "author_id"],
    "user.fields": ["username", "name", "public_metrics"],
    expansions: ["author_id"],
    start_time: startTime.toISOString(),
  };

  console.log(`  Search range: last ${effectiveDays} day${effectiveDays > 1 ? "s" : ""}`);

  for (const query of queries) {
    try {
      console.log(`  Searching X: "${query}"`);

      let paginator = await client.v2.search(query, { ...searchParams, max_results: 100 });
      collectFromPage(paginator, allTweets, userMap);

      let pageCount = 1;
      while (allTweets.length < maxResults && !paginator.done) {
        try {
          paginator = await paginator.next();
          collectFromPage(paginator, allTweets, userMap);
          pageCount++;
          if (pageCount % 3 === 0) {
            console.log(`    Page ${pageCount}: ${allTweets.length} tweets so far…`);
          }
        } catch {
          break;
        }
      }
    } catch (err) {
      console.warn(`  Search failed for "${query}": ${err.message}`);
    }
  }

  // Deduplicate tweets by ID
  const seenTweetIds = new Set();
  const uniqueTweets = [];
  for (const t of allTweets) {
    if (!seenTweetIds.has(t.id)) {
      seenTweetIds.add(t.id);
      uniqueTweets.push(t);
    }
  }

  console.log(`  Found ${uniqueTweets.length} unique tweets across all queries.`);

  // --- Phase 2: Extract repos from tweets -----------------------------------
  // Strategy A: Direct GitHub URLs in tweet
  // Strategy B: No GitHub URL → extract project name → resolve via GitHub search
  const repoMap = new Map();
  const noUrlTweets = []; // tweets with no github.com URL but high engagement

  for (const tweet of uniqueTweets) {
    const urls = extractGitHubUrls(tweet);
    const author = userMap.get(tweet.author_id);
    const tweetData = buildTweetData(tweet, author);

    if (urls.length > 0) {
      // Strategy A: has GitHub URL
      for (const ghUrl of urls) {
        const parsed = parseGitHubUrl(ghUrl);
        if (parsed) addToRepoMap(repoMap, parsed, tweetData);
      }
    } else {
      // Strategy B: no GitHub URL — queue for name-based resolution
      const engagement = (tweet.public_metrics?.retweet_count || 0) + (tweet.public_metrics?.like_count || 0);
      if (engagement >= minEngagement) {
        noUrlTweets.push({ tweet, tweetData });
      }
    }
  }

  // --- Phase 3: Check replies of high-engagement tweets for GitHub links ---
  const highEngNoUrl = noUrlTweets.filter(({ tweet }) => {
    const eng = (tweet.public_metrics?.retweet_count || 0) + (tweet.public_metrics?.like_count || 0);
    return eng >= 50;
  });
  if (highEngNoUrl.length > 0) {
    console.log(`  Checking replies of ${highEngNoUrl.length} viral tweets for GitHub links…`);
    await checkRepliesForLinks(client, highEngNoUrl, repoMap, userMap);
  }

  // --- Phase 4: Resolve project names from remaining high-engagement tweets --
  // Re-check which tweets still have no repo
  const stillUnresolved = noUrlTweets.filter(({ tweetData }) => {
    for (const [, repo] of repoMap) {
      if (repo.tweets.some((t) => t.tweetId === tweetData.tweetId)) return false;
    }
    return true;
  });
  if (stillUnresolved.length > 0) {
    console.log(`  ${stillUnresolved.length} high-engagement tweets still without repos — resolving project names…`);
    await resolveProjectNames(stillUnresolved, repoMap, githubToken);
  }

  console.log(`  Extracted ${repoMap.size} unique GitHub repos from tweets.`);

  // Filter by minimum engagement
  let repos = [...repoMap.values()].filter((r) => r.totalEngagement >= minEngagement);
  console.log(`  ${repos.length} repos pass min engagement threshold (${minEngagement}).`);

  // Validate repos on GitHub
  console.log("  Validating repos on GitHub…");
  repos = await validateOnGitHub(repos, githubToken);
  console.log(`  ${repos.length} validated open source repos.`);

  // Sort by total engagement descending
  repos.sort((a, b) => b.totalEngagement - a.totalEngagement);

  for (const repo of repos) {
    repo.tweets.sort((a, b) => (b.retweets + b.likes) - (a.retweets + a.likes));
  }

  return repos;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectFromPage(paginator, allTweets, userMap) {
  if (paginator.includes?.users) {
    for (const u of paginator.includes.users) userMap.set(u.id, u);
  }
  if (paginator.data?.data) {
    for (const tweet of paginator.data.data) allTweets.push(tweet);
  }
}

function buildTweetData(tweet, author) {
  const metrics = tweet.public_metrics || {};
  return {
    tweetId: tweet.id,
    tweetUrl: author
      ? `https://x.com/${author.username}/status/${tweet.id}`
      : `https://x.com/i/status/${tweet.id}`,
    authorUsername: author?.username || "unknown",
    authorDisplayName: author?.name || "Unknown",
    authorFollowers: author?.public_metrics?.followers_count || 0,
    text: tweet.text,
    retweets: metrics.retweet_count || 0,
    likes: metrics.like_count || 0,
    replies: metrics.reply_count || 0,
    quotes: metrics.quote_count || 0,
    impressions: metrics.impression_count || 0,
    createdAt: tweet.created_at,
    mentionedHandles: extractMentions(tweet),
  };
}

function addToRepoMap(repoMap, parsed, tweetData) {
  const key = `${parsed.owner}/${parsed.repo}`.toLowerCase();
  if (!repoMap.has(key)) {
    repoMap.set(key, {
      owner: parsed.owner,
      repo: parsed.repo,
      url: `https://github.com/${parsed.owner}/${parsed.repo}`,
      name: `${parsed.owner}/${parsed.repo}`,
      tweets: [],
      totalEngagement: 0,
    });
  }
  const entry = repoMap.get(key);
  if (!entry.tweets.some((t) => t.tweetId === tweetData.tweetId)) {
    entry.tweets.push(tweetData);
    entry.totalEngagement += tweetData.retweets + tweetData.likes;
  }
}

/**
 * Check replies to viral tweets for GitHub links.
 * People often post the repo link in the comments.
 */
async function checkRepliesForLinks(client, noUrlTweets, repoMap, userMap) {
  let found = 0;

  for (const { tweet, tweetData } of noUrlTweets) {
    try {
      // Search for replies to this tweet
      const authorUsername = userMap.get(tweet.author_id)?.username;
      if (!authorUsername) continue;

      const replyQuery = `conversation_id:${tweet.id} url:"github.com"`;
      const result = await client.v2.search(replyQuery, {
        max_results: 20,
        "tweet.fields": ["public_metrics", "entities", "author_id", "created_at"],
        "user.fields": ["username", "name", "public_metrics"],
        expansions: ["author_id"],
      });

      if (result.includes?.users) {
        for (const u of result.includes.users) userMap.set(u.id, u);
      }

      if (result.data?.data) {
        for (const reply of result.data.data) {
          const urls = extractGitHubUrls(reply);
          for (const ghUrl of urls) {
            const parsed = parseGitHubUrl(ghUrl);
            if (parsed) {
              // Link the ORIGINAL viral tweet to this repo (not the reply)
              addToRepoMap(repoMap, parsed, tweetData);
              found++;
              console.log(`    Found repo in reply: ${parsed.owner}/${parsed.repo} (reply to @${authorUsername})`);
            }
          }
        }
      }
    } catch {
      // Rate limit or error — skip this tweet's replies
    }
  }

  console.log(`    Found ${found} GitHub links in tweet replies.`);
}

/**
 * For tweets that mention projects by name but don't include a GitHub URL,
 * try to extract the project name and resolve it via GitHub search.
 */
async function resolveProjectNames(noUrlTweets, repoMap, githubToken) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ViralOSProjectsX-Bot/1.0",
  };
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;

  const api = axios.create({ baseURL: GITHUB_API, headers, timeout: 15_000 });

  // Extract candidate project names from tweet text
  const candidates = new Map(); // projectName → [tweetData, ...]

  for (const { tweet, tweetData } of noUrlTweets) {
    const names = extractProjectNames(tweet.text);
    for (const name of names) {
      const key = name.toLowerCase();
      if (!candidates.has(key)) candidates.set(key, { name, tweets: [] });
      candidates.get(key).tweets.push(tweetData);
    }
  }

  console.log(`    Found ${candidates.size} candidate project names to resolve.`);

  // Resolve each candidate via GitHub search
  let resolved = 0;
  for (const [, candidate] of candidates) {
    try {
      const { data } = await api.get("/search/repositories", {
        params: { q: `${candidate.name} in:name`, sort: "stars", per_page: 3 },
      });

      if (data.items?.length > 0) {
        // Take the best match — must closely match the name
        const best = data.items.find((item) =>
          item.name.toLowerCase() === candidate.name.toLowerCase() ||
          item.full_name.toLowerCase().includes(candidate.name.toLowerCase())
        );

        if (best) {
          const parsed = { owner: best.owner.login, repo: best.name };
          for (const tweetData of candidate.tweets) {
            addToRepoMap(repoMap, parsed, tweetData);
          }
          resolved++;
          console.log(`    Resolved "${candidate.name}" → ${best.full_name} (${best.stargazers_count} stars)`);
        }
      }
    } catch {
      // GitHub search rate limit or error — skip
    }
  }

  console.log(`    Resolved ${resolved}/${candidates.size} project names to GitHub repos.`);
}

/**
 * Extract likely project/tool names from tweet text.
 * Looks for patterns like "It's called X", "built X", CamelCase words, etc.
 */
function extractProjectNames(text) {
  const names = new Set();

  // Pattern: "called X" / "named X" / "introducing X" / "launched X" / "built X"
  const namedPatterns = [
    /(?:called|named|introducing|launched|built|released|announcing|presenting|created)\s+([A-Z][A-Za-z0-9_-]{2,30})/gi,
    /(?:called|named|introducing|launched|built|released|announcing|presenting|created)\s+"?([A-Za-z][A-Za-z0-9_-]{2,30})"?/gi,
  ];
  for (const re of namedPatterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const name = m[1].replace(/[.,!?;:'"]+$/, "");
      if (name.length >= 3 && !isCommonWord(name)) names.add(name);
    }
  }

  // Pattern: CamelCase or PascalCase words (likely tool names)
  const camelCase = text.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g);
  if (camelCase) {
    for (const w of camelCase) {
      if (w.length >= 4 && !isCommonWord(w)) names.add(w);
    }
  }

  // Pattern: "It's X." or "Check out X" where X is capitalized
  const checkOut = text.match(/(?:check out|try out|look at|use|star)\s+([A-Z][A-Za-z0-9_-]{2,30})/gi);
  if (checkOut) {
    for (const match of checkOut) {
      const name = match.split(/\s+/).pop().replace(/[.,!?;:'"]+$/, "");
      if (name.length >= 3 && !isCommonWord(name)) names.add(name);
    }
  }

  return [...names];
}

/** Filter out common English words that aren't project names. */
function isCommonWord(word) {
  const common = new Set([
    "the", "this", "that", "with", "from", "have", "been", "will", "just",
    "your", "their", "about", "open", "source", "free", "tool", "best",
    "some", "someone", "something", "here", "there", "what", "when", "where",
    "which", "while", "very", "also", "made", "make", "like", "most", "more",
    "than", "then", "they", "them", "these", "those", "into", "over", "after",
    "before", "between", "under", "above", "below", "code", "repo", "built",
    "think", "know", "need", "want", "find", "give", "tell", "work", "look",
    "called", "inside", "using", "every", "anyone", "right", "great", "good",
    "would", "could", "should", "never", "always", "still", "even", "much",
    "each", "only", "both", "other", "same", "different", "first", "last",
    "new", "old", "big", "small", "long", "short", "high", "low",
    "GitHub", "Twitter", "Google", "Microsoft", "Apple", "Amazon",
    "Linux", "Python", "JavaScript", "TypeScript", "React", "Node",
    "BREAKING", "UPDATE", "Thread", "Today", "Here",
    // Common words that falsely resolve to repos
    "and", "for", "was", "are", "not", "but", "can", "all", "had", "her",
    "his", "one", "our", "out", "day", "get", "has", "him", "how", "its",
    "may", "way", "who", "did", "let", "say", "she", "too", "use",
    "the", "any", "now", "got", "run", "see", "set", "try", "yes", "ago",
    "https", "http", "www", "com", "org", "dev",
    "Agent", "Better", "count", "history", "data", "info", "test", "demo",
    "MacBook", "iPhone", "iPad", "Android", "Windows", "Chrome", "Safari",
    "WhatsApp", "Telegram", "Slack", "Discord", "Signal", "Email",
    "World", "Crypto", "Bitcoin", "Ethereum", "Web3", "DeFi", "NFT",
    "TikTok", "YouTube", "Instagram", "Facebook", "Snapchat",
    "Docker", "Kubernetes", "Redis", "Postgres", "MongoDB", "MySQL",
    "PyTorch", "TensorFlow", "Keras", "NumPy", "Pandas",
    "entire", "IRL", "multiplication", "Generative", "DevOps",
    "tiktok", "SuperTrend", "TradingView", "PayFi",
  ]);
  return common.has(word) || common.has(word.toLowerCase());
}

function extractGitHubUrls(tweet) {
  const urls = new Set();
  if (tweet.entities?.urls) {
    for (const u of tweet.entities.urls) {
      const target = u.expanded_url || u.url || "";
      if (target.includes("github.com")) urls.add(target);
    }
  }
  const matches = tweet.text.match(
    /https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/gi
  );
  if (matches) {
    for (const m of matches) urls.add(m);
  }
  return [...urls];
}

function extractMentions(tweet) {
  const handles = [];
  if (tweet.entities?.mentions) {
    for (const m of tweet.entities.mentions) handles.push(m.username.toLowerCase());
  }
  const matches = tweet.text.match(/@([A-Za-z0-9_]+)/g);
  if (matches) {
    for (const m of matches) {
      const h = m.slice(1).toLowerCase();
      if (!handles.includes(h)) handles.push(h);
    }
  }
  return handles;
}

async function validateOnGitHub(repos, token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ViralOSProjectsX-Bot/1.0",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const api = axios.create({ baseURL: GITHUB_API, headers, timeout: 15_000 });
  const validated = [];

  const BATCH = 5;
  for (let i = 0; i < repos.length; i += BATCH) {
    const batch = repos.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (repo) => {
        const { data } = await api.get(`/repos/${repo.owner}/${repo.repo}`);
        const hasLicense = data.license && data.license.spdx_id && data.license.spdx_id !== "NOASSERTION";
        const isPopular = data.stargazers_count >= 50;
        if (!hasLicense && !isPopular) return null;
        repo.stars = data.stargazers_count;
        repo.forks = data.forks_count;
        repo.description = data.description || "";
        repo.language = data.language || "Unknown";
        return repo;
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) validated.push(r.value);
    }
  }

  return validated;
}

module.exports = { searchXForRepos };
