import { Command } from "commander";
import { fetchModels, fetchEndpoints } from "./api.js";
import { readCacheRaw, writeCacheRaw } from "./cache.js";
import {
  readConfig,
  getConfigPath,
  getConfiguredModelIds,
  getPrimaryModelId,
  getConfiguredAliases,
} from "./config.js";
import { CliError } from "./errors.js";
import {
  formatSearch,
  formatPrice,
  formatCompare,
  formatConfigured,
  formatLeaderboard,
} from "./format.js";
import { computePricing } from "./pricing.js";
import { resolveModel } from "./resolve.js";
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
  .action(async (query: string, opts: { json?: boolean }) => {
    const { data: models } = await fetchModels();
    const q = query.toLowerCase();

    const results: SearchEntry[] = models
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
      );
    }

    if (opts.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log(formatSearch(results, query));
    }
  });

// --- price ---

program
  .command("price <model>")
  .alias("p")
  .description("Per-provider pricing + weighted expected price")
  .option("--json", "Output structured JSON")
  .action(async (query: string, opts: { json?: boolean }) => {
    const modelId = await resolveModel(query);
    const { data: models } = await fetchModels();
    const model = models.find((m) => m.id === modelId)!;

    const endpoints = await fetchEndpoints(modelId);
    const pricing = computePricing(endpoints);

    const output: PriceOutput = {
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
    };

    if (opts.json) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log(formatPrice(output));
    }
  });

// --- compare ---

program
  .command("compare <models...>")
  .alias("cmp")
  .description("Side-by-side comparison of multiple models")
  .option("--json", "Output structured JSON")
  .action(async (queries: string[], opts: { json?: boolean }) => {
    if (queries.length < 2) {
      throw new CliError(
        "compare requires at least 2 models",
        "INVALID_INPUT",
        ExitCode.INVALID_INPUT,
      );
    }

    // Resolve all models first
    const modelIds: string[] = [];
    for (const q of queries) {
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
      console.log(JSON.stringify(entries, null, 2));
    } else {
      console.log(formatCompare(entries));
    }
  });

// --- configured ---

program
  .command("configured")
  .alias("cfg")
  .description("Pricing for models configured in openclaw.json")
  .option("--json", "Output structured JSON")
  .action(async (opts: { json?: boolean }) => {
    const config = readConfig();
    if (!config) {
      throw new CliError(
        `openclaw config not found at ${getConfigPath()}`,
        "CONFIG_ERROR",
        ExitCode.CONFIG,
      );
    }

    const modelIds = getConfiguredModelIds(config);
    if (modelIds.length === 0) {
      throw new CliError(
        `no models configured in ${getConfigPath()}`,
        "CONFIG_ERROR",
        ExitCode.CONFIG,
      );
    }

    const primary = getPrimaryModelId(config);
    const { data: models } = await fetchModels();
    const entries: CompareEntry[] = [];

    for (let i = 0; i < modelIds.length; i++) {
      if (i > 0) await sleep(ENDPOINT_DELAY);

      const mid = modelIds[i];
      const model = models.find((m) => m.id === mid);
      if (!model) {
        process.stderr.write(`warning: model '${mid}' not found in API, skipping\n`);
        continue;
      }

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
        primary: mid === primary,
      });
    }

    if (opts.json) {
      console.log(JSON.stringify(entries, null, 2));
    } else {
      console.log(formatConfigured(entries));
    }
  });

// --- leaderboard ---

program
  .command("leaderboard")
  .alias("lb")
  .description("Top models on OpenRouter")
  .option("--json", "Output structured JSON")
  .option("--refresh", "Scrape fresh leaderboard data via playwright-cli")
  .option("--update-cache", "Read JSON from stdin and write to cache")
  .option("--app [url]", "Leaderboard for a specific app (default: openclaw.ai)")
  .action(
    async (opts: {
      json?: boolean;
      refresh?: boolean;
      updateCache?: boolean;
      app?: string | boolean;
    }) => {
      // Resolve --app flag
      let appUrl: string | null = null;
      if (opts.app === true) {
        appUrl = "https://openclaw.ai/";
      } else if (typeof opts.app === "string") {
        appUrl = opts.app;
      }

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
          throw new CliError("invalid JSON on stdin", "INVALID_INPUT", ExitCode.INVALID_INPUT);
        }

        const ts = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
        const withMeta = { ...parsed, cached_at: ts, source: scrapeUrl };
        writeCacheRaw(cacheFile, JSON.stringify(withMeta, null, 2));
        console.log(`Leaderboard cache updated (${parsed.entries?.length ?? 0} entries)`);
        return;
      }

      // --refresh: scrape via playwright-cli
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
        console.log(`No leaderboard cache found.\n`);
        console.log(`To populate, run:`);
        console.log(`  or-pricing leaderboard --refresh${appSuffix}\n`);
        console.log(`Or pipe JSON:`);
        console.log(
          `  echo '{"entries":[...]}' | or-pricing leaderboard --update-cache${appSuffix}`,
        );
        return;
      }

      const data: LeaderboardOutput = JSON.parse(raw);

      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      const cachedAt = data.cached_at ?? "unknown";

      // Get configured aliases for marking
      let configuredAliases: string[] = [];
      const config = readConfig();
      if (config) {
        configuredAliases = getConfiguredAliases(config);
      }

      console.log(formatLeaderboard(data.entries, title, cachedAt, configuredAliases));
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
          args: "<model>",
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
          flags: ["--json"],
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
          args: "<models...>",
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
        configured: {
          args: "",
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
              primary: "boolean",
            },
          ],
        },
        leaderboard: {
          args: "",
          flags: ["--json", "--refresh", "--update-cache", "--app [url]"],
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
        CONFIG: 5,
        SCRAPE: 6,
        INVALID_INPUT: 7,
      },
    };
    console.log(JSON.stringify(schemas, null, 2));
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
        process.stderr.write(JSON.stringify(err.toJSON(), null, 2) + "\n");
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
