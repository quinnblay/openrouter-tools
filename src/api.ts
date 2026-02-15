import { CliError } from "./errors.js";
import { readCache, writeCache } from "./cache.js";
import { ExitCode } from "./types.js";
import type { ApiModelsResponse, ApiEndpointsResponse } from "./types.js";

const API_BASE = "https://openrouter.ai/api/v1";

export async function fetchModels(): Promise<ApiModelsResponse> {
  const cached = readCache("models.json");
  if (cached) {
    return JSON.parse(cached) as ApiModelsResponse;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/models`);
  } catch {
    throw new CliError(
      "failed to fetch model list from OpenRouter API",
      "NETWORK_ERROR",
      ExitCode.NETWORK,
      ["Check your internet connection", "Try again in a moment"],
    );
  }

  if (!res.ok) {
    throw new CliError(
      `OpenRouter API returned ${res.status}`,
      "NETWORK_ERROR",
      ExitCode.NETWORK,
      ["OpenRouter API may be down — try again", "Check https://status.openrouter.ai"],
    );
  }

  const text = await res.text();
  writeCache("models.json", text);
  return JSON.parse(text) as ApiModelsResponse;
}

export async function fetchEndpoints(modelId: string): Promise<ApiEndpointsResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/models/${modelId}/endpoints`);
  } catch {
    throw new CliError(
      `failed to fetch endpoints for ${modelId}`,
      "NETWORK_ERROR",
      ExitCode.NETWORK,
      ["Check your internet connection", "Try again in a moment"],
    );
  }

  if (!res.ok) {
    throw new CliError(
      `OpenRouter API returned ${res.status} for ${modelId} endpoints`,
      "NETWORK_ERROR",
      ExitCode.NETWORK,
      ["Verify the model ID exists", "OpenRouter API may be temporarily unavailable"],
    );
  }

  return (await res.json()) as ApiEndpointsResponse;
}
