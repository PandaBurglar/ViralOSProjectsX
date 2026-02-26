const axios = require("axios");

const GITHUB_API = "https://api.github.com";

/**
 * Create an Axios instance that optionally uses a GitHub token.
 */
function ghClient(token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ViralOSProjectsX-Bot/1.0",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return axios.create({ baseURL: GITHUB_API, headers, timeout: 15_000 });
}

/**
 * Enrich a list of trending projects with owner profile & contact data.
 *
 * For every project we fetch:
 *  - repo metadata   (topics, license, homepage, created/updated dates)
 *  - owner profile   (name, bio, company, location, blog, email, twitter)
 *  - README badge scan for LinkedIn / email links
 *
 * @param {Array} projects - output of scrapeTrending()
 * @param {string|undefined} token - GitHub PAT
 * @returns {Promise<Array>} enriched projects
 */
async function enrichProjects(projects, token) {
  const api = ghClient(token);
  const enriched = [];

  // Check rate limit before starting
  try {
    const { data, headers } = await api.get("/rate_limit");
    const remaining = parseInt(headers["x-ratelimit-remaining"] || data?.rate?.remaining, 10);
    if (remaining < projects.length * 3) {
      const resetAt = new Date((parseInt(headers["x-ratelimit-reset"], 10) || 0) * 1000);
      console.warn(`GitHub API rate limit low (${remaining} remaining). Resets at ${resetAt.toISOString()}.`);
    }
  } catch {
    /* non-critical — proceed without rate limit info */
  }

  // Process in small batches to be kind to rate limits
  const BATCH = 5;
  for (let i = 0; i < projects.length; i += BATCH) {
    const batch = projects.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map((p) => enrichOne(api, p))
    );
    results.forEach((r, idx) => {
      if (r.status === "fulfilled") enriched.push(r.value);
      else {
        // If enrichment fails, keep the base project data
        enriched.push(batch[idx]);
        console.warn("Enrichment failed for a project:", r.reason?.message);
      }
    });
  }

  return enriched;
}

async function enrichOne(api, project) {
  const { owner, repo } = project;

  // --- Repo metadata --------------------------------------------------------
  let repoMeta = {};
  try {
    const { data } = await api.get(`/repos/${owner}/${repo}`);
    repoMeta = {
      topics: data.topics || [],
      license: data.license?.spdx_id || null,
      homepage: data.homepage || null,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      openIssues: data.open_issues_count,
      watchers: data.watchers_count,
      defaultBranch: data.default_branch,
    };
  } catch {
    /* non-critical */
  }

  // --- Owner profile ---------------------------------------------------------
  let ownerProfile = {};
  try {
    const { data } = await api.get(`/users/${owner}`);
    ownerProfile = {
      ownerType: data.type, // "User" | "Organization"
      ownerName: data.name || owner,
      ownerBio: data.bio || null,
      ownerCompany: data.company || null,
      ownerLocation: data.location || null,
      ownerBlog: data.blog || null,
      ownerEmail: data.email || null,
      ownerTwitter: data.twitter_username || null,
      ownerAvatarUrl: data.avatar_url || null,
      ownerFollowers: data.followers || 0,
      ownerPublicRepos: data.public_repos || 0,
    };
  } catch {
    /* non-critical */
  }

  // --- README scan for LinkedIn & emails ------------------------------------
  let linkedIn = null;
  let extraEmails = [];
  try {
    const { data } = await api.get(`/repos/${owner}/${repo}/readme`, {
      headers: { Accept: "application/vnd.github.raw+json" },
    });
    const readmeText = typeof data === "string" ? data : JSON.stringify(data);
    linkedIn = extractLinkedIn(readmeText);
    extraEmails = extractEmails(readmeText);
  } catch {
    /* README may not exist */
  }

  // If we still don't have LinkedIn, try the owner's blog field
  if (!linkedIn && ownerProfile.ownerBlog) {
    if (ownerProfile.ownerBlog.includes("linkedin.com")) {
      linkedIn = ownerProfile.ownerBlog;
    }
  }

  return {
    ...project,
    ...repoMeta,
    ...ownerProfile,
    linkedIn,
    extraEmails,
  };
}

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

function extractLinkedIn(text) {
  // Match linkedin.com profile or company URLs
  const match = text.match(
    /https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/[A-Za-z0-9_-]+\/?/i
  );
  return match ? match[0] : null;
}

function extractEmails(text) {
  const emailRe = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const found = text.match(emailRe) || [];
  // Deduplicate and ignore obvious non-personal addresses
  const ignore = /noreply|example\.com|users\.noreply|dependabot/i;
  return [...new Set(found)].filter((e) => !ignore.test(e)).slice(0, 5);
}

module.exports = { enrichProjects };
