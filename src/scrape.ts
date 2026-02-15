import { CliError } from "./errors.js";
import { ExitCode } from "./types.js";

function formatTokens(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2).replace(/\.?0+$/, "")}T tokens`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, "")}B tokens`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M tokens`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K tokens`;
  return `${n} tokens`;
}

/**
 * Extract the chart data array from Next.js SSR payload embedded in HTML.
 * The data lives inside self.__next_f.push([1,"..."]) calls and contains
 * weekly snapshots: [{x: date, ys: {modelId: tokenCount, ...}}, ...]
 */
function extractChartData(html: string): { x: string; ys: Record<string, number> }[] {
  // Find the __next_f.push chunk containing chart "ys" data
  const pushPattern = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let match: RegExpExecArray | null;
  let dataChunk: string | null = null;

  while ((match = pushPattern.exec(html)) !== null) {
    const raw = match[1];
    if (raw.includes('\\"ys\\":{')) {
      // Unescape the JS string literal: \" → " and \\ → \
      dataChunk = raw.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      break;
    }
  }

  if (!dataChunk) {
    throw new Error("no chart data found in page");
  }

  // Find the "data":[ array within the React Server Components payload
  const dataIdx = dataChunk.indexOf('"data":[');
  if (dataIdx === -1) {
    throw new Error("no data array found in SSR payload");
  }

  // Extract the JSON array by counting brackets
  const startIdx = dataChunk.indexOf("[", dataIdx);
  let depth = 0;
  let endIdx = startIdx;
  for (let i = startIdx; i < dataChunk.length; i++) {
    if (dataChunk[i] === "[") depth++;
    else if (dataChunk[i] === "]") depth--;
    if (depth === 0) {
      endIdx = i + 1;
      break;
    }
  }

  const jsonStr = dataChunk.slice(startIdx, endIdx);
  return JSON.parse(jsonStr) as { x: string; ys: Record<string, number> }[];
}

export async function scrapeLeaderboard(
  scrapeUrl: string,
  title: string,
): Promise<{ entries: { rank: number; model: string; author: string; tokens: string }[] }> {
  process.stderr.write(`Fetching ${title} leaderboard...\n`);

  let html: string;
  try {
    const res = await fetch(scrapeUrl, {
      headers: { "User-Agent": "or-pricing-cli" },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    html = await res.text();
  } catch (err) {
    throw new CliError(
      `failed to fetch ${scrapeUrl}: ${err instanceof Error ? err.message : err}`,
      "SCRAPE_ERROR",
      ExitCode.SCRAPE,
    );
  }

  try {
    const weeks = extractChartData(html);

    if (weeks.length === 0) {
      throw new Error("no weekly data found");
    }

    // Use the most recent week
    const latest = weeks[weeks.length - 1];
    const ys = latest.ys;

    // Sort by token count descending, skip "Others" bucket
    const sorted = Object.entries(ys)
      .filter(([id]) => id !== "Others")
      .sort(([, a], [, b]) => b - a);

    if (sorted.length === 0) {
      throw new Error("no model entries in latest week");
    }

    const entries = sorted.map(([id, count], i) => {
      const slashIdx = id.indexOf("/");
      const author = slashIdx > 0 ? id.slice(0, slashIdx) : "";
      const model = slashIdx > 0 ? id.slice(slashIdx + 1) : id;
      return {
        rank: i + 1,
        model,
        author,
        tokens: formatTokens(count),
      };
    });

    return { entries };
  } catch (err) {
    if (err instanceof CliError) throw err;
    throw new CliError(
      `failed to parse leaderboard data: ${err instanceof Error ? err.message : err}`,
      "SCRAPE_ERROR",
      ExitCode.SCRAPE,
    );
  }
}
