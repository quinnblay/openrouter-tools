import type { ApiEndpointsResponse, PricingResult, ProviderEntry } from "./types.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computePricing(endpoints: ApiEndpointsResponse): PricingResult {
  const providers: ProviderEntry[] = endpoints.data.endpoints.map((ep) => ({
    provider: ep.provider_name,
    quantization: ep.quantization ?? "-",
    prompt_per_m: parseFloat(ep.pricing.prompt) * 1_000_000,
    completion_per_m: parseFloat(ep.pricing.completion) * 1_000_000,
    discount: ep.pricing.discount ?? 0,
    status: ep.status ?? 0,
    uptime: ep.uptime_last_30m ?? 0,
  }));

  const healthy = providers.filter((p) => p.status >= 0);

  let promptExpected: number | null = null;
  let completionExpected: number | null = null;

  if (healthy.length > 0) {
    let sumPw = 0;
    let sumCw = 0;
    let sumW = 0;

    for (const p of healthy) {
      const w = p.uptime / 100;
      sumPw += w * p.prompt_per_m * (1 - p.discount);
      sumCw += w * p.completion_per_m * (1 - p.discount);
      sumW += w;
    }

    if (sumW > 0) {
      promptExpected = round2(sumPw / sumW);
      completionExpected = round2(sumCw / sumW);
    }
  }

  return {
    prompt_expected: promptExpected,
    completion_expected: completionExpected,
    providers,
  };
}
