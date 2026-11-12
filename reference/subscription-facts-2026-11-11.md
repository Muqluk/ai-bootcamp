# Claude Code: subscription vs API key, fact sheet (verified 2026-11-11)

Lineup is now Pro / Max / Ultra (page IDs: `max_5x_monthly` = Max, `max_20x_monthly` = Ultra). "Extra usage" is now "usage credits" (`/extra-usage` became `/usage-credits`).

## 1. Limits and prices
- 5-hour window starts at your first message, resets in full 5 hours later. https://support.claude.com/en/articles/11647753
- Weekly limits (all models) reset at a fixed per-account time; Max and Ultra add a separate weekly Fable limit. https://support.claude.com/en/articles/11647753
- claude.ai, Desktop, IDE and Claude Code all draw on one pool. https://support.claude.com/en/articles/11145838 ; https://claude.com/pricing
- Pro: $20/mo, or $17/mo billed annually ($200). Max: $100/mo, "5x Pro usage every 5 hours and every week", Fable "up to half your weekly limit", $100/mo API credits. Ultra: $200/mo, "No 5-hour limit" for verified accounts, "10x Pro usage every week", $200/mo API credits. https://claude.com/pricing
- Team (2 to 150 seats): Standard seat $20/seat/mo annual or $25 monthly. Premium seat is 5x Standard, $100 annual or $125 monthly. Enterprise: "US$20/seat/month, billed annually, 20 seat minimum" plus usage at API rates. https://claude.com/pricing

## 2. What drains limits
- Usage depends on model, context length, features and effort; no fixed message count. https://support.claude.com/en/articles/11647753
- Cached content "counts less against your limits". Claude Code re-reads history "at the cached token rate". https://support.claude.com/en/articles/9797557 ; https://code.claude.com/docs/en/costs.md
- Session/weekly limits span all models; `/model` doesn't escape them. Model-specific "You've hit your Opus limit" / "Sonnet limit" messages also exist. https://code.claude.com/docs/en/costs.md
- Exact per-model drain ratios: ND.

## 3. /usage, total_cost_usd
- `/cost`, `/stats` alias `/usage`. https://code.claude.com/docs/en/commands.md
- Session-block dollars are a local list-price estimate "intended for API users"; subscribers also get plan bars and a limits breakdown. https://code.claude.com/docs/en/costs.md
- `/status` shows the account and `Login method`, and marks an unused credential. https://code.claude.com/docs/en/authentication.md
- The status line `rate_limits.five_hour` / `seven_day` fields appear only for Pro, Max and Ultra. https://code.claude.com/docs/en/statusline.md
- `total_cost_usd` is a "client-side estimate, not authoritative billing data", computed from a bundled price table. On a subscription it is notional. https://code.claude.com/docs/en/agent-sdk/cost-tracking.md

## 4. Auth and precedence
- Precedence: cloud provider vars, then `ANTHROPIC_AUTH_TOKEN`, then `ANTHROPIC_API_KEY`, then `apiKeyHelper`, then `CLAUDE_CODE_OAUTH_TOKEN`, then Anthropic profile/WIF, then `/login` subscription OAuth. https://code.claude.com/docs/en/authentication.md
- With `-p`, "the key is always used when present". Interactive sessions ask once. An env API key causes "API usage charges rather than using your subscription". https://code.claude.com/docs/en/authentication.md ; https://support.claude.com/en/articles/11145838
- `claude setup-token` mints a one-year subscription OAuth token for `CLAUDE_CODE_OAUTH_TOKEN`; model requests only. https://code.claude.com/docs/en/authentication.md
- `--bare` doesn't read OAuth or `CLAUDE_CODE_OAUTH_TOKEN`. It needs `ANTHROPIC_API_KEY` or `apiKeyHelper`. https://code.claude.com/docs/en/headless.md
- Third parties may not offer claude.ai login or rate limits in their products, including Agent SDK agents. Developers should use API keys. https://code.claude.com/docs/en/agent-sdk/overview.md
- Advertised limits "assume ordinary, individual usage of Claude Code and the Agent SDK". https://code.claude.com/docs/en/legal-and-compliance.md

## 5. Usage credits (overage)
- At a limit: wait, upgrade, or use usage credits, billed "at standard API rates". https://support.claude.com/en/articles/12429409
- Turn on at Settings > Usage: buy credits, set a monthly spend limit, optional auto-reload. `/usage-credits` works only with a subscription login. https://support.claude.com/en/articles/12429409 ; https://code.claude.com/docs/en/costs.md
- Max/Ultra monthly API credits aren't usable in Claude Code. https://support.claude.com/en/articles/11145838
- Team/Enterprise: admin enables credits and sets org/group/member limits; other members send a request. https://code.claude.com/docs/en/costs.md
- Subscription fast mode: "usage credits only". https://code.claude.com/docs/en/fast-mode.md

## 6. API-only features and cache TTL
- Batches API is 50% off, up to 100,000 requests or 256 MB, within 24 hours. https://platform.claude.com/docs/en/build-with-claude/batch-processing.md
- Whether Claude Code can use the Batches API: ND.
- Priority Tier commitments are "no longer available for purchase". https://platform.claude.com/docs/en/api/service-tiers.md
- Cache writes cost 1.25x for a 5-minute TTL and 2x for 1 hour. Reads cost 0.1x. https://platform.claude.com/docs/en/build-with-claude/prompt-caching.md
- Claude Code default TTL: a subscription within plan usage gets 1 hour on the main conversation. Usage credits, API keys and cloud providers get 5 minutes. Override with `CLAUDE_CODE_PROMPT_CACHE_TTL` / `promptCacheTtl` (`1h` works on an API key), `ENABLE_PROMPT_CACHING_1H`, `FORCE_PROMPT_CACHING_5M`. https://code.claude.com/docs/en/prompt-caching.md

## 7. Models by plan
- `default` = Opus 5.5 on Pro, Max, Ultra, Team, Enterprise and the API. https://code.claude.com/docs/en/model-config.md
- Fable (the top model) is never the default. On Pro (per the pricing table) Fable runs on usage credits. Max and Ultra get it up to 50% of the weekly limit. https://code.claude.com/docs/en/model-config.md ; https://claude.com/pricing
- `-p` bills Fable to credits unasked. https://code.claude.com/docs/en/model-config.md
- Automatic fallback is content-based (safety classifiers) or availability-based. Fallback triggered by nearing a usage limit: ND.

## 8. API rate limits
- Tiers and monthly spend caps: Start $500, Build $1,000, Scale $200,000, Custom with no cap. https://platform.claude.com/docs/en/api/rate-limits.md
- RPM/ITPM/OTPM, Opus 5.5: Start 4,000/2M/400k, Scale 13,000/10M/2M. Fable 5.2: Start 4,000/500k/100k, Scale 13,000/4M/800k. https://platform.claude.com/docs/en/api/rate-limits.md
- `cache_read_input_tokens` "Do NOT count toward ITPM". https://platform.claude.com/docs/en/api/rate-limits.md

## 9. Monitoring spend
- Console: Usage/Cost pages, workspace spend limits, auto-created "Claude Code" workspace, `platform.claude.com/claude-code` dashboard, Claude Code Analytics API. https://code.claude.com/docs/en/costs.md
- Usage and Cost Admin API (`/v1/organizations/usage_report/messages`, `/cost_report`) is now legacy; the Usage and Cost Analytics API replaces it. Not available on the Team plan. https://platform.claude.com/docs/en/build-with-claude/usage-cost-api.md
- Team/Enterprise: `claude.ai/analytics/claude-code` dashboard and a spend report CSV. Enterprise also gets the Analytics API (`read:analytics`). https://code.claude.com/docs/en/analytics.md
- Pro/Max/Ultra: Settings > Usage, `/usage` (this machine only), status line `rate_limits`, OpenTelemetry. https://code.claude.com/docs/en/costs.md
