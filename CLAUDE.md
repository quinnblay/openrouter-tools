# CLAUDE.md

## Build

```bash
npm install && npm run build    # Build to dist/index.js
npm run typecheck               # Type-check without emitting
node dist/index.js <command>    # Run
```

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Commander program: all commands wired up + global error handler |
| `src/types.ts` | TypeScript interfaces for API shapes, output schemas, exit codes |
| `src/errors.ts` | `CliError` class with structured JSON error output |
| `src/api.ts` | OpenRouter API client (fetch models, fetch endpoints) |
| `src/cache.ts` | File-based caching (`.cache/` dir, 5-min TTL for model list) |
| `src/pricing.ts` | `computePricing()` — uptime-weighted expected price algorithm |
| `src/resolve.ts` | Model resolution (exact ID > substring ID > substring name) |
| `src/format.ts` | Human-readable table formatters (chalk for colors) |
| `src/stdin.ts` | Reads model IDs from piped stdin (one per line) |
| `src/scrape.ts` | Leaderboard fetching — parses SSR data from OpenRouter HTML |

## Architecture

- **Build**: tsup bundles `src/index.ts` into a single `dist/index.js` with hashbang
- **Runtime**: Node 18+ (uses native `fetch`, no polyfills)
- **Dependencies**: `commander` (CLI framework), `chalk` v5 (colors, auto-detects `NO_COLOR`)
- **Price math**: Prices come as string per-token values from the API, multiplied by 1M for display. Use `Math.round(x * 100) / 100` for rounding.
- **Model resolution**: exact ID match > substring on ID > substring on name
- **Expected price**: uptime-weighted average across healthy providers (status >= 0)
- **Errors**: `CliError` class emits structured JSON to stderr when `--json` is active. 7 distinct exit codes in `ExitCode` enum.

## Making Changes

- Each module has a single responsibility — edit the relevant file
- `computePricing()` in `src/pricing.ts` is the core algorithm
- `resolveModel()` in `src/resolve.ts` handles fuzzy matching with structured error for ambiguous results
- `price` and `compare` accept variadic args + piped stdin (one model ID per line)
- No tests exist. Verify changes by running each command manually.

## OpenRouter APIs

| Endpoint | Returns |
|----------|---------|
| `GET /api/v1/models` | `.data[]` with `id`, `name`, `context_length`, `pricing.prompt`, `pricing.completion` |
| `GET /api/v1/models/{id}/endpoints` | `.data.endpoints[]` with `provider_name`, `quantization`, `pricing.{prompt,completion,discount}`, `status`, `uptime_last_30m` |

No authentication required. Model list is cached 5 min. Endpoint calls have a 0.3s delay between sequential requests to avoid rate limiting.
