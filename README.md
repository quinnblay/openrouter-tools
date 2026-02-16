[![npm version](https://img.shields.io/npm/v/or-pricing)](https://www.npmjs.com/package/or-pricing)
[![npm downloads](https://img.shields.io/npm/dm/or-pricing)](https://www.npmjs.com/package/or-pricing)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node >= 18](https://img.shields.io/node/v/or-pricing)](https://nodejs.org)

# or-pricing

A CLI tool that shows **realistic expected pricing** for OpenRouter models by querying per-provider endpoints and weighting by uptime.

**No API key required** · **Works via npx** · **Node 18+**

## Contents

- [The Problem](#the-problem)
- [Install](#install)
- [Quick Start](#quick-start)
- [Usage](#usage)
  - [price](#price--detailed-model-pricing)
  - [search](#search--find-models)
  - [compare](#compare--side-by-side-comparison)
  - [leaderboard](#leaderboard--top-models-by-usage)
- [Flags](#flags)
- [How Expected Pricing Works](#how-expected-pricing-works)
- [Limitations](#limitations)
- [JSON Output](#json-output)
- [APIs Used](#apis-used)
- [Contributing](#contributing)
- [License](#license)

## The Problem

OpenRouter's headline pricing shows the cheapest available provider, but the price you actually pay depends on which provider handles your request. Here's Kimi K2.5:

```
Headline:  $0.45 / $0.44 per M tokens  ← cheapest provider
Expected:  $0.56 / $2.67 per M tokens  ← weighted across all healthy providers
```

Some providers may be down or using different quantization levels, so the effective price often differs from the headline. `or-pricing` queries every provider's pricing, uptime, and status, then computes a weighted expected price.

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

## Quick Start

```bash
npx or-pricing price anthropic/claude-sonnet-4
npx or-pricing compare openai/gpt-4o anthropic/claude-sonnet-4 deepseek/deepseek-r1
npx or-pricing search deepseek
npx or-pricing leaderboard --refresh
```

## Usage

```
or-pricing price [models...]        Per-provider pricing + weighted expected price  (alias: p)
or-pricing search <query>           Search models by name                          (alias: s)
or-pricing compare [models...]      Side-by-side pricing comparison                (alias: cmp)
or-pricing leaderboard              Top models by usage on OpenRouter              (alias: lb)
```

Both `price` and `compare` accept multiple models as arguments or via stdin (whitespace-separated):

```bash
or-pricing price anthropic/claude-sonnet-4 openai/gpt-4o                  # multiple args
echo "anthropic/claude-sonnet-4 openai/gpt-4o" | or-pricing compare       # stdin (space-separated)
echo -e "anthropic/claude-sonnet-4\nopenai/gpt-4o" | or-pricing compare   # stdin (newline-separated)
```

When pricing multiple models, endpoint queries are paced at ~0.3s apart to avoid rate limiting.

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
or-pricing compare anthropic/claude-sonnet-4 openai/gpt-4o deepseek/deepseek-v3.2
```

```
Model Comparison

  Model                                     Head P/M      Head C/M      Exp P/M       Exp C/M       Providers   Context
  Anthropic: Claude Sonnet 4                $3            $15           $3.00         $15.00        5/5         976K
  OpenAI: GPT-4o                            $2.5          $10           $2.50         $10.00        2/2         125K
  DeepSeek: DeepSeek V3.2                   $0.25         $0.38         $0.32         $0.63         7/9         160K
```

Shows headline vs. expected pricing, provider counts, and context length for each model.

### `leaderboard` — Top models by usage

```bash
or-pricing leaderboard                                     # global OpenRouter leaderboard (from cache)
or-pricing leaderboard --refresh                           # scrape fresh global data
or-pricing leaderboard --app https://openclaw.ai/          # per-app leaderboard
or-pricing leaderboard --app https://openclaw.ai/ --refresh  # scrape fresh app data
```

Shows the top 20 models by token usage.

Without `--app`, shows the global OpenRouter leaderboard from [openrouter.ai/rankings](https://openrouter.ai/rankings/trending). With `--app`, shows per-app usage from the [OpenRouter apps page](https://openrouter.ai/apps). Each app gets its own cache file.

Data is fetched from OpenRouter's rankings pages (parsed from server-rendered HTML) and cached locally. You can also pipe leaderboard data from external tools:

```bash
echo '{"entries":[{"rank":1,"model":"Kimi K2.5","author":"moonshotai","tokens":"1.38T tokens"}]}' \
  | or-pricing leaderboard --update-cache
```

## Flags

**Global** (all commands):

| Flag | Description |
|------|-------------|
| `--json` | Output structured JSON instead of formatted tables |
| `--no-color` | Disable colored output (also respects `$NO_COLOR`) |
| `--help`, `-h` | Show help |

**Leaderboard only**:

| Flag | Description |
|------|-------------|
| `--app <url>` | Per-app leaderboard (e.g. `--app https://openclaw.ai/`) |
| `--refresh` | Fetch fresh leaderboard data instead of using cache |
| `--update-cache` | Accept leaderboard JSON from stdin to update cache |

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

## Limitations

- Model list is cached for 5 minutes — not real-time pricing data
- Expected price is a weighted estimate, not a guarantee of what you'll be charged
- Designed for research and cost comparison, not billing integration

## JSON Output

All commands support `--json` for programmatic use.

<details>
<summary>JSON output examples (click to expand)</summary>

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

### `compare --json`

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
    "healthy": 10
  }
]
```

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

</details>

## APIs Used

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/v1/models` | None | Model catalog, headline pricing |
| `GET /api/v1/models/{author}/{slug}/endpoints` | None | Per-provider pricing, uptime, status |
| `openrouter.ai/rankings/trending` | None (HTML fetch) | Leaderboard data |

Model list responses are cached for 5 minutes in `.cache/models.json`.

## Contributing

Contributions welcome. Before submitting a PR:

1. Run `npm run typecheck` and `npm run build`
2. Manually test affected commands (no test suite)
3. File an issue before starting major work

## License

MIT
