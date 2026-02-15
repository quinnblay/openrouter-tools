import { fetchModels } from "./api.js";
import { CliError } from "./errors.js";
import { ExitCode } from "./types.js";
import type { ApiModel } from "./types.js";

export async function resolveModel(query: string): Promise<string> {
  const { data: models } = await fetchModels();
  const q = query.toLowerCase();

  // 1. Exact match on ID
  const exact = models.find((m) => m.id.toLowerCase() === q);
  if (exact) return exact.id;

  // 2. Substring match on ID
  const idMatches = models
    .filter((m) => m.id.toLowerCase().includes(q))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (idMatches.length === 1) return idMatches[0].id;

  // 3. Substring match on name
  const nameMatches = models
    .filter((m) => m.name.toLowerCase().includes(q))
    .sort((a, b) => a.id.localeCompare(b.id));

  // Combine and dedupe
  const seen = new Set<string>();
  const allMatches: ApiModel[] = [];
  for (const m of [...idMatches, ...nameMatches]) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      allMatches.push(m);
    }
  }

  if (allMatches.length === 0) {
    throw new CliError(
      `no model found matching '${query}'`,
      "NOT_FOUND",
      ExitCode.NOT_FOUND,
      ["Check the model name/ID", "Use 'or-pricing search' to find models"],
    );
  }

  if (allMatches.length === 1) return allMatches[0].id;

  // Ambiguous: list matches
  const shown = allMatches.slice(0, 15);
  const lines = shown.map((m) => `  ${m.id}  ${m.name}`);
  if (allMatches.length > 15) {
    lines.push(`  ... and ${allMatches.length - 15} more`);
  }

  const topIds = allMatches.slice(0, 5).map((m) => m.id);
  throw new CliError(
    `Multiple models match '${query}':\n${lines.join("\n")}\nBe more specific, or use the full model ID`,
    "AMBIGUOUS",
    ExitCode.AMBIGUOUS,
    [
      `Use a full model ID, e.g.: or-pricing price ${topIds[0]}`,
      ...topIds.slice(1).map((id) => `or-pricing price ${id}`),
    ],
  );
}
