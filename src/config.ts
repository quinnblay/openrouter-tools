import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { OpenClawConfig } from "./types.js";

const OPENCLAW_CONFIG = join(
  process.env.HOME || process.env.USERPROFILE || "/tmp",
  ".openclaw",
  "openclaw.json",
);

export function getConfigPath(): string {
  return OPENCLAW_CONFIG;
}

export function readConfig(): OpenClawConfig | null {
  if (!existsSync(OPENCLAW_CONFIG)) return null;
  const raw = readFileSync(OPENCLAW_CONFIG, "utf-8");
  return JSON.parse(raw) as OpenClawConfig;
}

export function getConfiguredModelIds(config: OpenClawConfig): string[] {
  const models = config.agents?.defaults?.models;
  if (!models) return [];
  return Object.keys(models).sort().map((k) => k.replace(/^openrouter\//, ""));
}

export function getPrimaryModelId(config: OpenClawConfig): string | null {
  const primary = config.agents?.defaults?.model?.primary;
  if (!primary) return null;
  return primary.replace(/^openrouter\//, "");
}

export function getConfiguredAliases(config: OpenClawConfig): string[] {
  const models = config.agents?.defaults?.models;
  if (!models) return [];
  return Object.entries(models).map(([key, val]) => {
    if (val.alias) return val.alias;
    const id = key.replace(/^openrouter\//, "");
    const parts = id.split("/");
    return parts[1] ?? id;
  });
}
