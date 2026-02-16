import { Command } from "commander";
import { fetchModels, fetchEndpoints } from "./api.js";
import { readCacheRaw, writeCacheRaw } from "./cache.js";
import { CliError } from "./errors.js";
import {
  formatSearch,
  formatPrice,
  formatCompare,
  formatLeaderboard,
} from "./format.js";
import { computePricing } from "./pricing.js";
import { resolveModel } from "./resolve.js";
import { readStdinLines } from "./stdin.js";
import { scrapeLeaderboard } from "./scrape.js";
import type {
  CompareEntry,
  LeaderboardOutput,
  PriceOutput,
  SearchEntry,
} from "./types.js";
import { ExitCode } from "./types.js";

const ENDPOINT_DELAY = 300; // ms between sequential endpoint calls

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toPerM(raw: string): number {
  return round2(parseFloat(raw) * 1_000_000);
}

function appSlug(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/.*/, "").replace(/[^a-zA-Z0-9]/g, "-");
}

function jsonOut(data: unknown): string {
  const indent = process.stdout.isTTY ? 2 : undefined;
  return JSON.stringify(data, null, indent);
}

const program = new Command();

program
  .name("or-pricing")
  .version("2.0.0")
  .description("OpenRouter model pricing — realistic expected pricing weighted by provider uptime")
  .option("--no-color", "Disable colored output");

// --- search ---

program
  .command("search <query>")
  .alias("s")
  .description("Search models by name or ID")
  .option("--json", "Output structured JSON")
  .option("--limit <n>", "Maximum number of results", parseInt)
  .action(async (query: string, opts: { json?: boolean; limit?: number }) => {
    const { data: models } = await fetchModels();
    const q = query.toLowerCase();

    let results: SearchEntry[] = models
      .filter(
        (m) =>
          m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
      )
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((m) => ({
        id: m.id,
        name: m.name,
        context: m.context_length,
        prompt_per_m: round2(parseFloat(m.pricing.prompt) * 1_000_000),
        completion_per_m: round2(parseFloat(m.pricing.completion) * 1_000_000),
      }));

    if (results.length === 0) {
      throw new CliError(
        `no models found matching '${query}'`,
        "NOT_FOUND",
        ExitCode.NOT_FOUND,
        ["Try a broader search term", "Use 'or-pricing search' with partial names"],
      );
    }

    if (opts.limit && opts.limit > 0) {
      results = results.slice(0, opts.limit);
    }

    if (opts.json) {
      console.log(jsonOut(results));
    } else {
      console.log(formatSearch(results, query));
    }
  });

// --- price ---

program
  .command("price [models...]")
  .alias("p")
  .description("Per-provider pricing + weighted expected price (accepts stdin, one model per line)")
  .option("--json", "Output structured JSON")
  .action(async (queries: string[], opts: { json?: boolean }) => {
    const stdinLines = await readStdinLines();
    const merged = [...queries, ...stdinLines];

    if (merged.length === 0) {
      throw new CliError(
        "no models specified",
        "INVALID_INPUT",
        ExitCode.INVALID_INPUT,
        ["Provide model names as arguments: or-pricing price claude-sonnet gpt-4o", "Or pipe via stdin: echo 'claude-sonnet' | or-pricing price"],
      );
    }

    const { data: models } = await fetchModels();
    const outputs: PriceOutput[] = [];

    for (let i = 0; i < merged.length; i++) {
      if (i > 0) await sleep(ENDPOINT_DELAY);

      const modelId = await resolveModel(merged[i]);
      const model = models.find((m) => m.id === modelId)!;
      const endpoints = await fetchEndpoints(modelId);
      const pricing = computePricing(endpoints);

      outputs.push({
        id: modelId,
        name: model.name,
        context_length: model.context_length,
        headline: {
          prompt_per_m: toPerM(model.pricing.prompt),
          completion_per_m: toPerM(model.pricing.completion),
        },
        expected: {
          prompt_per_m: pricing.prompt_expected,
          completion_per_m: pricing.completion_expected,
        },
        providers: pricing.providers,
      });
    }

    if (opts.json) {
      console.log(jsonOut(outputs.length === 1 ? outputs[0] : outputs));
    } else {
      console.log(outputs.map((o) => formatPrice(o)).join("\n"));
    }
  });

// --- compare ---

program
  .command("compare [models...]")
  .alias("cmp")
  .description("Side-by-side comparison of multiple models (accepts stdin, one model per line)")
  .option("--json", "Output structured JSON")
  .action(async (queries: string[], opts: { json?: boolean }) => {
    const stdinLines = await readStdinLines();
    const merged = [...queries, ...stdinLines];

    if (merged.length < 2) {
      throw new CliError(
        "compare requires at least 2 models",
        "INVALID_INPUT",
        ExitCode.INVALID_INPUT,
        ["Provide at least 2 model names or IDs", "Example: or-pricing compare claude-sonnet gpt-4o"],
      );
    }

    // Resolve all models first
    const modelIds: string[] = [];
    for (const q of merged) {
      modelIds.push(await resolveModel(q));
    }

    const { data: models } = await fetchModels();
    const entries: CompareEntry[] = [];

    for (let i = 0; i < modelIds.length; i++) {
      if (i > 0) await sleep(ENDPOINT_DELAY);

      const mid = modelIds[i];
      const model = models.find((m) => m.id === mid)!;
      const endpoints = await fetchEndpoints(mid);
      const pricing = computePricing(endpoints);

      const providerCount = pricing.providers.length;
      const healthyCount = pricing.providers.filter((p) => p.status >= 0).length;

      entries.push({
        id: mid,
        name: model.name,
        context: model.context_length,
        headline_prompt: toPerM(model.pricing.prompt),
        headline_completion: toPerM(model.pricing.completion),
        expected_prompt: pricing.prompt_expected,
        expected_completion: pricing.completion_expected,
        providers: providerCount,
        healthy: healthyCount,
      });
    }

    if (opts.json) {
      console.log(jsonOut(entries));
    } else {
      console.log(formatCompare(entries));
    }
  });

// --- leaderboard ---

program
  .command("leaderboard")
  .alias("lb")
  .description("Top models on OpenRouter")
  .option("--json", "Output structured JSON")
  .option("--refresh", "Fetch fresh leaderboard data")
  .option("--update-cache", "Read JSON from stdin and write to cache")
  .option("--app <url>", "Leaderboard for a specific app")
  .action(
    async (opts: {
      json?: boolean;
      refresh?: boolean;
      updateCache?: boolean;
      app?: string;
    }) => {
      const appUrl: string | null = opts.app ?? null;

      // Determine cache file and scrape URL
      let cacheFile: string;
      let scrapeUrl: string;
      let title: string;

      if (appUrl) {
        const slug = appSlug(appUrl);
        cacheFile = `leaderboard-${slug}.json`;
        scrapeUrl = `https://openrouter.ai/apps?url=${encodeURIComponent(appUrl)}`;
        title = appUrl;
      } else {
        cacheFile = "leaderboard.json";
        scrapeUrl = "https://openrouter.ai/rankings/trending";
        title = "OpenRouter";
      }

      // --update-cache: read from stdin, write to cache
      if (opts.updateCache) {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk as Buffer);
        }
        const input = Buffer.concat(chunks).toString("utf-8");
        let parsed: LeaderboardOutput;
        try {
          parsed = JSON.parse(input) as LeaderboardOutput;
        } catch {
          throw new CliError("invalid JSON on stdin", "INVALID_INPUT", ExitCode.INVALID_INPUT, [
            `Pipe valid JSON: echo '{"entries":[...]}' | or-pricing leaderboard --update-cache`,
          ]);
        }

        const ts = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
        const withMeta = { ...parsed, cached_at: ts, source: scrapeUrl };
        writeCacheRaw(cacheFile, JSON.stringify(withMeta, null, 2));
        console.log(`Leaderboard cache updated (${parsed.entries?.length ?? 0} entries)`);
        return;
      }

      // --refresh: fetch fresh data
      if (opts.refresh) {
        const data = await scrapeLeaderboard(scrapeUrl, title);
        const ts = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
        const withMeta = { ...data, cached_at: ts, source: scrapeUrl };
        writeCacheRaw(cacheFile, JSON.stringify(withMeta, null, 2));
        const count = data.entries.length;
        process.stderr.write(`Leaderboard refreshed (${count} entries)\n`);
      }

      // Read from cache
      const raw = readCacheRaw(cacheFile);
      if (!raw) {
        const appSuffix = appUrl ? ` --app ${appUrl}` : "";
        throw new CliError(
          "no leaderboard cache found",
          "NO_CACHE",
          ExitCode.NOT_FOUND,
          [
            `Run: or-pricing leaderboard --refresh${appSuffix}`,
            `Or pipe JSON: echo '{"entries":[...]}' | or-pricing leaderboard --update-cache${appSuffix}`,
          ],
        );
      }

      const data: LeaderboardOutput = JSON.parse(raw);

      if (opts.json) {
        console.log(jsonOut(data));
        return;
      }

      const cachedAt = data.cached_at ?? "unknown";

      console.log(formatLeaderboard(data.entries, title, cachedAt));
    },
  );

// --- schema (NEW) ---

program
  .command("schema")
  .description("Output JSON schemas for all commands (agent discovery)")
  .action(() => {
    const schemas = {
      commands: {
        price: {
          args: "[models...]",
          stdin: "one model ID per line",
          flags: ["--json"],
          output: {
            id: "string",
            name: "string",
            context_length: "number",
            headline: { prompt_per_m: "number", completion_per_m: "number" },
            expected: { prompt_per_m: "number | null", completion_per_m: "number | null" },
            providers: [
              {
                provider: "string",
                quantization: "string",
                prompt_per_m: "number",
                completion_per_m: "number",
                discount: "number",
                status: "number",
                uptime: "number",
              },
            ],
          },
        },
        search: {
          args: "<query>",
          flags: ["--json", "--limit <n>"],
          output: [
            {
              id: "string",
              name: "string",
              context: "number",
              prompt_per_m: "number",
              completion_per_m: "number",
            },
          ],
        },
        compare: {
          args: "[models...]",
          stdin: "one model ID per line",
          flags: ["--json"],
          output: [
            {
              id: "string",
              name: "string",
              context: "number",
              headline_prompt: "number",
              headline_completion: "number",
              expected_prompt: "number | null",
              expected_completion: "number | null",
              providers: "number",
              healthy: "number",
            },
          ],
        },
        leaderboard: {
          args: "",
          flags: ["--json", "--refresh", "--update-cache", "--app <url>"],
          output: {
            entries: [{ rank: "number", model: "string", author: "string", tokens: "string" }],
            cached_at: "string",
          },
        },
      },
      exit_codes: {
        SUCCESS: 0,
        GENERAL: 1,
        NETWORK: 2,
        NOT_FOUND: 3,
        AMBIGUOUS: 4,
        SCRAPE: 6,
        INVALID_INPUT: 7,
      },
    };
    console.log(jsonOut(schemas));
  });

// --- Global error handler ---

async function run() {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof CliError) {
      const parentOpts = program.opts();
      // Check if --json was passed (on parent or subcommand)
      const isJson =
        process.argv.includes("--json") ||
        parentOpts.json;

      if (isJson) {
        const indent = process.stderr.isTTY ? 2 : undefined;
        process.stderr.write(JSON.stringify(err.toJSON(), null, indent) + "\n");
      } else {
        process.stderr.write(`error: ${err.message}\n`);
      }
      process.exit(err.exitCode);
    }
    // Commander errors (--help, --version) throw with exitCode 0
    if (err && typeof err === "object" && "exitCode" in err) {
      process.exit((err as { exitCode: number }).exitCode);
    }
    throw err;
  }
}

run();
