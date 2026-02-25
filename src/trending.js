const axios = require("axios");
const cheerio = require("cheerio");

const GITHUB_TRENDING_URL = "https://github.com/trending";

/**
 * Scrape GitHub's trending page and return structured project data.
 *
 * @param {object} opts
 * @param {string} opts.period   - "daily" | "weekly" | "monthly"
 * @param {string} opts.language - language filter or "all"
 * @param {number} opts.limit    - max projects to return
 * @returns {Promise<Array<{
 *   name: string,
 *   owner: string,
 *   repo: string,
 *   url: string,
 *   description: string,
 *   language: string,
 *   stars: number,
 *   forks: number,
 *   starsToday: number
 * }>>}
 */
async function scrapeTrending({ period = "daily", language = "all", limit = 25 }) {
  const params = new URLSearchParams({ since: period });
  const url =
    language && language !== "all"
      ? `${GITHUB_TRENDING_URL}/${encodeURIComponent(language)}?${params}`
      : `${GITHUB_TRENDING_URL}?${params}`;

  const { data: html } = await axios.get(url, {
    headers: { "User-Agent": "ViralOSProjectsX-Bot/1.0" },
    timeout: 15_000,
  });

  const $ = cheerio.load(html);
  const projects = [];

  $("article.Box-row").each((_i, el) => {
    if (projects.length >= limit) return false;

    const $el = $(el);

    // repo full name  e.g. "owner / repo"
    const fullName = $el.find("h2 a").text().replace(/\s/g, "").trim();
    if (!fullName) return;

    const [owner, repo] = fullName.split("/");

    const description = $el.find("p.col-9").text().trim();
    const language =
      $el.find('[itemprop="programmingLanguage"]').text().trim() || "Unknown";

    // stars & forks live in the inline links
    const counters = $el
      .find("a.Link--muted.d-inline-block.mr-3")
      .map((_j, a) => $(a).text().replace(/[\s,]/g, "").trim())
      .get();

    const stars = parseCount(counters[0]);
    const forks = parseCount(counters[1]);

    // "X stars today / this week / this month"
    const todayText = $el.find("span.d-inline-block.float-sm-right").text().trim();
    const starsToday = parseCount(todayText);

    projects.push({
      name: fullName,
      owner,
      repo,
      url: `https://github.com/${fullName}`,
      description,
      language,
      stars,
      forks,
      starsToday,
    });
  });

  return projects;
}

/** Turn strings like "1,234" or "12.5k" into numbers. */
function parseCount(str) {
  if (!str) return 0;
  const cleaned = str.replace(/,/g, "").trim();
  const match = cleaned.match(/([\d.]+)\s*k/i);
  if (match) return Math.round(parseFloat(match[1]) * 1000);
  const num = parseInt(cleaned, 10);
  return Number.isNaN(num) ? 0 : num;
}

module.exports = { scrapeTrending };
