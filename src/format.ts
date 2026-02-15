import chalk from "chalk";
import type {
  CompareEntry,
  LeaderboardEntry,
  PriceOutput,
  ProviderEntry,
  SearchEntry,
} from "./types.js";

function fmtPrice(n: number | null): string {
  if (n === null) return "n/a";
  return "$" + n.toFixed(2);
}

function fmtContext(ctx: number): string {
  return Math.floor(ctx / 1024) + "K";
}

function statusText(status: number): string {
  if (status >= 0) return chalk.green("ok");
  if (status === -1) return chalk.yellow("degraded");
  return chalk.red("DOWN");
}

function pad(s: string, width: number): string {
  return s + " ".repeat(Math.max(0, width - s.length));
}

export function formatSearch(results: SearchEntry[], query: string): string {
  const lines: string[] = [];
  lines.push(`${chalk.bold(`${results.length} model(s) matching '${query}':`)}`)
  lines.push("");
  lines.push(
    `  ${chalk.dim(pad("Model ID", 45))}  ${chalk.dim(pad("Prompt/M", 10))}  ${chalk.dim(pad("Compl/M", 10))}  ${chalk.dim("Context")}`,
  );

  for (const r of results) {
    lines.push(
      `  ${pad(r.id, 45)}  $${pad(String(r.prompt_per_m), 9)}  $${pad(String(r.completion_per_m), 9)}  ${fmtContext(r.context)}`,
    );
  }

  return lines.join("\n");
}

export function formatPrice(output: PriceOutput): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`${chalk.bold(output.name)}  ${chalk.dim(`(${output.id})`)}`);

  const ctxFormatted = output.context_length.toLocaleString();
  lines.push(`Context: ${ctxFormatted} tokens`);
  lines.push("");

  const hp = fmtPrice(output.headline.prompt_per_m);
  const hc = fmtPrice(output.headline.completion_per_m);
  lines.push(
    `Headline:  ${hp} / ${hc} per M tokens ${chalk.dim("(prompt/completion)")}`,
  );

  const ep = fmtPrice(output.expected.prompt_per_m);
  const ec = fmtPrice(output.expected.completion_per_m);
  lines.push(
    `Expected:  ${chalk.bold(ep)} / ${chalk.bold(ec)} per M tokens ${chalk.dim("(weighted by uptime, healthy only)")}`,
  );

  lines.push("");
  lines.push(`${chalk.bold("Provider Breakdown:")}`);
  lines.push(
    `  ${chalk.dim(pad("Provider", 18))} ${chalk.dim(pad("Quant", 8))} ${chalk.dim(pad("Prompt/M", 10))} ${chalk.dim(pad("Compl/M", 10))} ${chalk.dim(pad("Uptime", 8))} ${chalk.dim("Status")}`,
  );

  const sorted = [...output.providers].sort(
    (a, b) => a.prompt_per_m - b.prompt_per_m,
  );

  for (const p of sorted) {
    const pf = `$${p.prompt_per_m.toFixed(2)}`;
    const cf = `$${p.completion_per_m.toFixed(2)}`;
    const uf = `${p.uptime.toFixed(1)}%`;
    const st = statusText(p.status);
    lines.push(
      `  ${pad(p.provider, 18)} ${pad(p.quantization, 8)} ${pad(pf, 10)} ${pad(cf, 10)} ${pad(uf, 8)} ${st}`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

export function formatCompare(entries: CompareEntry[]): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`${chalk.bold("Model Comparison")}`);
  lines.push("");
  lines.push(
    `  ${chalk.dim(pad("Model", 40))}  ${chalk.dim(pad("Head P/M", 12))}  ${chalk.dim(pad("Head C/M", 12))}  ${chalk.dim(pad("Exp P/M", 12))}  ${chalk.dim(pad("Exp C/M", 12))}  ${chalk.dim(pad("Providers", 10))}  ${chalk.dim("Context")}`,
  );

  for (const e of entries) {
    const ep = e.expected_prompt !== null ? `$${e.expected_prompt.toFixed(2)}` : "n/a";
    const ec = e.expected_completion !== null ? `$${e.expected_completion.toFixed(2)}` : "n/a";
    const prov = `${e.healthy}/${e.providers}`;
    const ctx = fmtContext(e.context);
    lines.push(
      `  ${pad(e.name, 40)}  $${pad(String(e.headline_prompt), 11)}  $${pad(String(e.headline_completion), 11)}  ${pad(ep, 12)}  ${pad(ec, 12)}  ${pad(prov, 10)}  ${ctx}`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

export function formatConfigured(entries: CompareEntry[]): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(
    `${chalk.bold("Configured Models")} ${chalk.dim("(from openclaw.json)")}`,
  );
  lines.push("");
  lines.push(
    `  ${chalk.dim(pad("", 3))} ${chalk.dim(pad("Model", 40))}  ${chalk.dim(pad("Head P/M", 12))}  ${chalk.dim(pad("Head C/M", 12))}  ${chalk.dim(pad("Exp P/M", 12))}  ${chalk.dim(pad("Exp C/M", 12))}  ${chalk.dim(pad("Providers", 10))}  ${chalk.dim("Context")}`,
  );

  for (const e of entries) {
    const star = e.primary ? chalk.cyan("*") : " ";
    const ep = e.expected_prompt !== null ? `$${e.expected_prompt.toFixed(2)}` : "n/a";
    const ec = e.expected_completion !== null ? `$${e.expected_completion.toFixed(2)}` : "n/a";
    const prov = `${e.healthy}/${e.providers}`;
    const ctx = fmtContext(e.context);
    lines.push(
      `  ${star}  ${pad(e.name, 40)}  $${pad(String(e.headline_prompt), 11)}  $${pad(String(e.headline_completion), 11)}  ${pad(ep, 12)}  ${pad(ec, 12)}  ${pad(prov, 10)}  ${ctx}`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

export function formatLeaderboard(
  entries: LeaderboardEntry[],
  title: string,
  cachedAt: string,
  configuredAliases: string[],
): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(
    `${chalk.bold(`${title} Leaderboard`)}  ${chalk.dim(`(cached: ${cachedAt})`)}`,
  );
  lines.push("");
  lines.push(
    `  ${chalk.dim(pad("Rank", 5))} ${chalk.dim(pad("", 3))} ${chalk.dim(pad("Model", 30))} ${chalk.dim(pad("Author", 20))} ${chalk.dim("Tokens")}`,
  );

  const shown = entries.slice(0, 20);
  for (const e of shown) {
    let mark = " ";
    for (const alias of configuredAliases) {
      if (alias && e.model.toLowerCase().includes(alias.toLowerCase())) {
        mark = chalk.cyan("*");
        break;
      }
    }
    lines.push(
      `  ${pad(`#${e.rank}`, 5)} ${mark}  ${pad(e.model, 30)} ${pad(e.author, 20)} ${e.tokens}`,
    );
  }

  lines.push("");
  return lines.join("\n");
}
