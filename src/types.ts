// --- OpenRouter API shapes ---

export interface ApiModel {
  id: string;
  name: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
}

export interface ApiModelsResponse {
  data: ApiModel[];
}

export interface ApiEndpoint {
  provider_name: string;
  quantization?: string;
  pricing: {
    prompt: string;
    completion: string;
    discount?: number;
  };
  status?: number;
  uptime_last_30m?: number;
}

export interface ApiEndpointsResponse {
  data: {
    endpoints: ApiEndpoint[];
  };
}

// --- Output schemas ---

export interface ProviderEntry {
  provider: string;
  quantization: string;
  prompt_per_m: number;
  completion_per_m: number;
  discount: number;
  status: number;
  uptime: number;
}

export interface PricingResult {
  prompt_expected: number | null;
  completion_expected: number | null;
  providers: ProviderEntry[];
}

export interface PriceOutput {
  id: string;
  name: string;
  context_length: number;
  headline: { prompt_per_m: number; completion_per_m: number };
  expected: { prompt_per_m: number | null; completion_per_m: number | null };
  providers: ProviderEntry[];
}

export interface SearchEntry {
  id: string;
  name: string;
  context: number;
  prompt_per_m: number;
  completion_per_m: number;
}

export interface CompareEntry {
  id: string;
  name: string;
  context: number;
  headline_prompt: number;
  headline_completion: number;
  expected_prompt: number | null;
  expected_completion: number | null;
  providers: number;
  healthy: number;
  primary?: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  model: string;
  author: string;
  tokens: string;
}

export interface LeaderboardOutput {
  entries: LeaderboardEntry[];
  cached_at?: string;
  source?: string;
}

// --- OpenClaw config ---

export interface OpenClawConfig {
  agents?: {
    defaults?: {
      model?: { primary?: string };
      models?: Record<string, { alias?: string }>;
    };
  };
}

// --- Exit codes ---

export enum ExitCode {
  SUCCESS = 0,
  GENERAL = 1,
  NETWORK = 2,
  NOT_FOUND = 3,
  AMBIGUOUS = 4,
  CONFIG = 5,
  SCRAPE = 6,
  INVALID_INPUT = 7,
}
