# or-pricing

A CLI tool that shows **realistic expected pricing** for OpenRouter models by querying per-provider endpoints and weighting by uptime — not just the cheapest (often misleading) headline price.

## The Problem

OpenRouter's headline pricing shows the cheapest available provider. This is often misleading:

```
Headline:  $0.45 / $0.44 per M tokens  ← Chutes, int4, frequently DOWN
Expected:  $0.56 / $2.67 per M tokens  ← what you'll actually pay
```

The cheapest provider may be down, degraded, or using aggressive quantization. `or-pricing` queries every provider's pricing, uptime, and status, then computes a weighted expected price that reflects what you'll actually pay.

## Install

```bash
# Use directly via npx (zero install)
npx or-pricing search deepseek --json

# Or install globally
npm install -g or-pricing

# Or clone and build
git clone https://github.com/quinnblay/openrouter-tools.git
cd openrouter-tools
npm install && npm run build
node dist/index.js --help
```

No API key required — uses OpenRouter's public API. Requires Node 18+.

Optional: **playwright-cli** for `leaderboard --refresh`: `npm install -g @playwright/cli@latest`

## Usage

```
or-pricing price <model>            Per-provider pricing + weighted expected price
or-pricing search <query>           Search models by name
or-pricing compare <m1> <m2> ...    Side-by-side pricing comparison
or-pricing configured               Pricing for models in openclaw.json
or-pricing leaderboard              Top models by usage on OpenRouter
```

### `price` — Detailed model pricing

```bash
or-pricing price kimi-k2.5
```

```
MoonshotAI: Kimi K2.5  (moonshotai/kimi-k2.5)
Context: 262,144 tokens

Headline:  $0.45 / $0.44 per M tokens (prompt/completion)
Expected:  $0.56 / $2.67 per M tokens (weighted by uptime, healthy only)

Provider Breakdown:
  Provider           Quant    Prompt/M   Compl/M    Uptime   Status
  Chutes             int4     $0.45      $0.44      97.0%    ok
  DeepInfra          unknown  $0.45      $2.25      98.4%    ok
  Inceptron          int4     $0.50      $2.40      85.5%    DOWN
  AtlasCloud         int4     $0.50      $2.60      98.8%    ok
  Together           unknown  $0.50      $2.80      75.9%    DOWN
  SiliconFlow        fp8      $0.55      $3.00      98.9%    ok
  Novita             unknown  $0.57      $2.85      98.3%    ok
  Parasail           int4     $0.60      $2.80      95.5%    ok
  Moonshot AI        int4     $0.60      $3.00      99.9%    ok
  Fireworks          unknown  $0.60      $3.00      98.2%    ok
  BaseTen            fp4      $0.60      $3.00      99.4%    ok
  Venice             unknown  $0.75      $3.75      99.3%    ok
```

Accepts full model IDs (`moonshotai/kimi-k2.5`) or fuzzy matches (`kimi-k2.5`, `k2.5`). Multiple matches prompt you to be more specific.

### `search` — Find models

```bash
or-pricing search deepseek
```

```
16 model(s) matching 'deepseek':

  Model ID                                       Prompt/M    Compl/M     Context
  deepseek/deepseek-chat                         $0.3        $1.2        160K
  deepseek/deepseek-r1                           $0.7        $2.5        62K
  deepseek/deepseek-v3.2                         $0.25       $0.38       160K
  ...
```

### `compare` — Side-by-side comparison

```bash
or-pricing compare kimi-k2.5 minimax-m2.5 deepseek-v3.2
```

Shows headline vs. expected pricing, provider counts, and context length for each model.

### `configured` — OpenClaw integration

```bash
or-pricing configured
```

Reads model IDs from `~/.openclaw/openclaw.json` and shows pricing for all configured models. Primary model marked with `*`.

### `leaderboard` — Top models by usage

```bash
or-pricing leaderboard                    # global OpenRouter leaderboard (from cache)
or-pricing leaderboard --refresh          # scrape fresh global data
or-pricing leaderboard --app              # per-app leaderboard (default: openclaw.ai)
or-pricing leaderboard --app --refresh    # scrape fresh app data
or-pricing leaderboard --app https://example.com/  # custom app URL
```

Shows the top 20 models by token usage. Configured models marked with `*`.

Without `--app`, shows the global OpenRouter leaderboard from [openrouter.ai/rankings](https://openrouter.ai/rankings/trending). With `--app`, shows per-app usage from the [OpenRouter apps page](https://openrouter.ai/apps). Each app gets its own cache file.

Data is scraped via `playwright-cli` (no JSON API exists) and cached locally. You can also pipe leaderboard data from external tools:

```bash
echo '{"entries":[{"rank":1,"model":"Kimi K2.5","author":"moonshotai","tokens":"1.38T tokens"}]}' \
  | or-pricing leaderboard --update-cache
```

## Flags

| Flag | Description |
|------|-------------|
| `--json` | Output structured JSON instead of formatted tables |
| `--no-color` | Disable colored output (also respects `$NO_COLOR`) |
| `--app [url]` | Use per-app leaderboard (default: `https://openclaw.ai/`) |
| `--refresh` | Scrape fresh leaderboard data via `playwright-cli` |
| `--help`, `-h` | Show help |

Command aliases: `p` (price), `s` (search), `cmp` (compare), `cfg` (configured), `lb` (leaderboard).

## How Expected Pricing Works

For each provider serving a model, the OpenRouter endpoints API reports pricing, uptime (last 30 minutes), and status. The expected price algorithm:

1. **Exclude unhealthy providers** — status `< 0` (degraded or DOWN) are shown in the table but excluded from the average
2. **Weight by uptime** — each healthy provider's weight is `uptime / 100`
3. **Apply discounts** — effective price = `price * (1 - discount)`
4. **Weighted average** — `expected = sum(effective_price * weight) / sum(weight)`

Provider status mapping:
- `>= 0` → **ok** (included in expected price)
- `-1` → **degraded** (excluded)
- `<= -2` → **DOWN** (excluded)

## JSON Output

All commands support `--json` for programmatic use.

### `price --json`

```json
{
  "id": "moonshotai/kimi-k2.5",
  "name": "MoonshotAI: Kimi K2.5",
  "context_length": 262144,
  "headline": {
    "prompt_per_m": 0.45,
    "completion_per_m": 0.44
  },
  "expected": {
    "prompt_per_m": 0.56,
    "completion_per_m": 2.67
  },
  "providers": [
    {
      "provider": "Chutes",
      "quantization": "int4",
      "prompt_per_m": 0.45,
      "completion_per_m": 0.44,
      "discount": 0,
      "status": 0,
      "uptime": 97.0
    }
  ]
}
```

### `search --json`

```json
[
  {
    "id": "moonshotai/kimi-k2.5",
    "name": "MoonshotAI: Kimi K2.5",
    "context": 262144,
    "prompt_per_m": 0.45,
    "completion_per_m": 0.44
  }
]
```

### `compare --json` / `configured --json`

```json
[
  {
    "id": "moonshotai/kimi-k2.5",
    "name": "MoonshotAI: Kimi K2.5",
    "context": 262144,
    "headline_prompt": 0.45,
    "headline_completion": 0.44,
    "expected_prompt": 0.56,
    "expected_completion": 2.67,
    "providers": 12,
    "healthy": 10,
    "primary": true
  }
]
```

`primary` field only present in `configured --json`.

### `leaderboard --json`

```json
{
  "entries": [
    {
      "rank": 1,
      "model": "Kimi K2.5",
      "author": "moonshotai",
      "tokens": "1.38T tokens"
    }
  ],
  "cached_at": "2026-02-15T20:25:32Z"
}
```

## APIs Used

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/v1/models` | None | Model catalog, headline pricing |
| `GET /api/v1/models/{author}/{slug}/endpoints` | None | Per-provider pricing, uptime, status |
| `openrouter.ai/rankings/trending` | None (scrape) | Leaderboard data |

Model list responses are cached for 5 minutes in `.cache/models.json`.

## License

MIT
