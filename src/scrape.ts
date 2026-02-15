import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CliError } from "./errors.js";
import { ExitCode } from "./types.js";

function getScriptDir(): string {
  return dirname(new URL(import.meta.url).pathname);
}

function findScraperJs(): string {
  const candidates = [
    join(process.cwd(), "scrape-leaderboard.js"),
    join(getScriptDir(), "..", "scrape-leaderboard.js"),
  ];

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }

  throw new CliError(
    "scraper script not found (scrape-leaderboard.js)",
    "SCRAPE_ERROR",
    ExitCode.SCRAPE,
  );
}

function playwrightCli(args: string[], options?: { encoding?: "utf-8" }): string {
  return execFileSync("playwright-cli", args, {
    encoding: options?.encoding ?? "utf-8",
    stdio: options?.encoding ? "pipe" : "ignore",
    maxBuffer: 10 * 1024 * 1024,
  }) as string;
}

export async function scrapeLeaderboard(scrapeUrl: string, title: string): Promise<{ entries: { rank: number; model: string; author: string; tokens: string }[] }> {
  try {
    execFileSync("which", ["playwright-cli"], { stdio: "ignore" });
  } catch {
    throw new CliError(
      "playwright-cli not found. Install with: npm install -g @playwright/cli@latest",
      "SCRAPE_ERROR",
      ExitCode.SCRAPE,
    );
  }

  process.stderr.write(`Scraping ${title} leaderboard...\n`);

  const scraperJs = findScraperJs();
  const scraperCode = readFileSync(scraperJs, "utf-8");

  try {
    playwrightCli(["open", scrapeUrl]);

    // Wait for render
    execFileSync("sleep", ["2"]);

    // Try to click "Show more"
    try {
      const snapshot = playwrightCli(["snapshot"], { encoding: "utf-8" });
      const smMatch = snapshot.match(/button "Show more".*?ref=(e\d+)/);
      if (smMatch) {
        playwrightCli(["click", smMatch[1]]);
        execFileSync("sleep", ["1"]);
      }
    } catch {
      // Show more button not found, ok
    }

    // Extract leaderboard data
    const pwOutput = playwrightCli(["run-code", scraperCode], { encoding: "utf-8" });

    try {
      playwrightCli(["close"]);
    } catch {
      // ignore close errors
    }

    const jsonLine = pwOutput.split("\n").find((l) => l.startsWith('"'));
    if (!jsonLine) {
      throw new Error("no JSON output from playwright-cli");
    }
    const jsonStr = JSON.parse(jsonLine) as string;
    const data = JSON.parse(jsonStr) as { entries: { rank: number; model: string; author: string; tokens: string }[] };

    if (!data.entries || data.entries.length === 0) {
      throw new Error("empty entries");
    }

    return data;
  } catch (err) {
    try {
      playwrightCli(["close"]);
    } catch {
      // ignore
    }

    if (err instanceof CliError) throw err;
    throw new CliError(
      "failed to scrape leaderboard data",
      "SCRAPE_ERROR",
      ExitCode.SCRAPE,
    );
  }
}
