# Runbook — Sperax Trading Desk ChatGPT plugin

The **Sperax Trading Desk** plugin (package name `sperax-trading-copilot`) is a ChatGPT
plugin in OpenAI's plugin directory. ChatGPT reaches it through a remote MCP server that
SperaxOS hosts. The plugin is
read-only and needs no sign-in. It has 43 tools: eight analysis tools and 35 market-data
tools, one per feed.

## Live listing

Published in the ChatGPT plugin directory for all users as **Sperax Trading Desk**
(developer Sperax, category Finance, version 2.0.0), as of 2026-11-17.

- Directory page: <https://chatgpt.com/plugins/plugin_asdk_app_6aea0b5be6608191a02eeebc810e235c>
- Plugin ID: `plugin_asdk_app_6aea0b5be6608191a02eeebc810e235c`
- Tagline: "Size, test and sanity-check"
- Manifest: [sperax-trading-copilot/plugin.json](../sperax-trading-copilot/plugin.json) (`name: sperax-trading-copilot`, `displayName: Sperax Trading Desk`)

The listing shows the same metadata as the manifest and serves whatever runs on
`https://chat.sperax.io/webapi/mcp/trading-copilot`. Every production deploy goes straight to
ChatGPT users, so run `npm run check` against the live endpoint after any server deploy that
touches that MCP group.

| Analysis tool | Purpose | Annotations |
|---|---|---|
| `get_derivatives_positioning` | Live perpetual-futures funding, open interest and long/short ratios from OKX and Hyperliquid for one coin | `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: true` |
| `build_trade_plan` | Position size from account risk, liquidation-vs-stop check, R-multiples, fees and expected value | `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false` |
| `backtest_signal_strategy` | Indicator strategy backtest (RSI, MA cross, momentum…) on real daily candles with fees and slippage | `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: true` |
| `scan_token` | Token safety report for a symbol or contract: honeypot, taxes, mint and owner powers, holder concentration, liquidity and pair age, with a `safe` / `caution` / `danger` verdict | `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: true` |
| `compare_swap_quotes` | Live quotes for one trade from LI.FI, KyberSwap and Jupiter, ranked by output with price impact and gas. No links and no transaction data | `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: true` |
| `review_wallet` | Wallet health check for an EVM or Solana address: holdings, concentration, token approvals, safety scans of the largest holdings, crisis stress test and a `healthy` / `attention` / `at_risk` verdict | `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: true` |
| `stress_test_portfolio` | Replays `{symbol, valueUsd}` holdings through recorded crypto crises (FTX, LUNA, COVID…) with drawdown, dollar loss, biggest losers and optional VaR / CVaR | `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: true` |
| `analyze_coin` | Technical read from 200+ daily or 4-hour candles (OKX, Hyperliquid fallback): EMA trend regime, RSI and MACD, volume, swing levels, ATR and structural stops, derivatives positioning, a scored verdict with reasons and a plan seed for `build_trade_plan` | `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: true` |

The other 35 tools each read one live market-data feed. All are `readOnlyHint: true`,
`destructiveHint: false`, `openWorldHint: true`, and each takes only the parameters its
feed uses:

| Tool | Feed | Tool | Feed |
|---|---|---|---|
| `get_fear_greed_index` | `fear-greed` | `get_funding_rates` | `funding-rates` |
| `get_market_regime` | `market-regime` | `get_open_interest` | `open-interest` |
| `get_macro_dashboard` | `macro-dashboard` | `get_liquidations` | `liquidations` |
| `get_traditional_market_chart` | `tradfi-chart` | `get_long_short_ratios` | `long-short-ratio` |
| `get_crypto_stock_quotes` | `stock-quotes` | `get_options_overview` | `options` |
| `get_market_intelligence` | `market-intelligence` | `get_etf_flows` | `etf-flows` |
| `get_market_sentiment` | `sentiment` | `get_dex_volumes` | `dex-volume` |
| `get_global_market_stats` | `global-market` | `get_defi_overview` | `defi-overview` |
| `get_top_coins` | `markets-table` | `get_chain_tvl` | `chain-tvl` |
| `get_trending_coins` | `trending` | `get_top_defi_protocols` | `top-protocols` |
| `get_whale_alerts` | `whale-alerts` | `get_protocol_revenue` | `protocol-revenue` |
| `get_exchange_flows` | `exchange-flow` | `get_defi_yields` | `yields` |
| `get_tracked_wallet_activity` | `wallet-tracker` | `get_stablecoin_stats` | `stablecoins` |
| `get_gas_prices` | `gas` | `get_bridge_flows` | `bridges` |
| `get_bitcoin_network_stats` | `bitcoin` | `get_token_unlocks` | `token-unlocks` |
| `get_new_dex_listings` | `new-listings` | `get_governance_proposals` | `governance` |
| `get_crypto_news` | `news` | `get_onchain_ai_agents` | `erc8004-agents` |
| `get_sperax_protocol_stats` | `sperax` | | |

The server defines each one with a name, title, description, status text and typed
arguments, each mapped to its feed parameter. Unknown or invalid
arguments return a tool error before any upstream call. OpenAI's review rejects a tool that
"executes operations that are not individually exposed", so the plugin has no
`feed`-selector tool. A server-side test fails when a feed has neither a plugin tool nor
an explicit block-list entry.

The endpoint serves two profiles of one tool set. `POST /webapi/mcp/trading-copilot`
serves the **plugin** profile above, which follows OpenAI's v1 directory rules:

- No trade execution and no prefilled trade links. `create_swap_link`, `create_perp_link`,
  `create_order_link` and `create_sperax_action_link` are absent from `tools/list`, and a
  call to one returns JSON-RPC `-32602`.
- No prediction markets, social relays or service diagnostics. 35 of the 41 feeds have a
  plugin tool; `ct-pulse`, `kol-leaderboard`, `platform-status`, `predictions`,
  `service-status` and `tech-pulse` have none.
- One tool per operation. The GPT's `get_sidebar_feed` (a `feed` selector over every
  feed) is absent, and a call to it returns JSON-RPC `-32602`.
- Cross-tool server instructions only: the
  read-only scope, the one required sequence (`analyze_coin`'s `planSeed` into
  `build_trade_plan`) and the not-financial-advice line, under 512 characters.
  Per-tool routing belongs in each tool's `description`; repeating it here, or
  wording that steers tool choice or persona, draws a server-instructions finding.
- Minimized responses. Results drop `sourceErrors` and fetch timestamps, and
  `compare_swap_quotes` drops `links` and `execution`.

`?profile=full` serves all thirteen tools and every feed for the earlier Trading Copilot
Custom GPT ([Sperax/speraxos-chatgpt](https://github.com/Sperax/speraxos-chatgpt)). Any other
`profile` value falls back to the plugin profile.

Three tools render a widget in ChatGPT (`openai/outputTemplate`, MIME
`text/html;profile=mcp-app`):

| Widget | URI | Tools |
|---|---|---|
| Price chart | `ui://widget/price-chart.html` | `analyze_coin` |
| Quote comparison | `ui://widget/quote-comparison.html` | `compare_swap_quotes` |
| Portfolio | `ui://widget/portfolio.html` | `review_wallet`, `stress_test_portfolio` |

The plugin's quote-comparison widget has no buttons and no links. The GPT profile keeps the
`swap-quote` widget with its links.

The tools are the same ones behind the Trading Copilot Custom GPT.
The GPT calls them as REST Actions. The plugin calls them over MCP.

This document is the runbook for publishing the plugin and keeping it published. It
follows OpenAI's [app review](https://developers.openai.com/plugins/deploy/app-review)
and [submission](https://developers.openai.com/plugins/deploy/submission) guides.

The [submission checklist](./submission-checklist.md) maps OpenAI's review rules to this
plugin, and the [GPT-to-plugin gap analysis](./gpt-to-plugin-gap-analysis.md) records how the
Custom GPT features were carried over. Read them before changing tools or submitting a new
version.

## How it fits together

```
ChatGPT ──MCP (streamable HTTP, JSON-RPC over POST)──▶ https://chat.sperax.io/webapi/mcp/trading-copilot
                                                          │  IP rate limit, CORS, batches, notifications → 202
                                                          ▼
                                                        MCP dispatcher
                                                          │  initialize · tools/list · tools/call · ping
                                                          ▼
                                     derivatives · trade plan · backtest · token scan · quotes · wallet · feeds
                                     (the same modules that served the Custom GPT's REST Actions)
```

| Piece | Where |
|---|---|
| Plugin package (uploaded as a ZIP) | [`sperax-trading-copilot/`](../sperax-trading-copilot/README.md) in this repo |
| Packager and validator | [`scripts/build.mjs`](../scripts/build.mjs) in this repo |
| Published tool contract lock | [`tool-metadata.lock.json`](../tool-metadata.lock.json) in this repo |
| MCP endpoint, tool definitions, server instructions, dispatcher | Private SperaxOS repository, served at `https://chat.sperax.io/webapi/mcp/trading-copilot` |
| Domain-verification challenge | Private SperaxOS repository, served at `https://chat.sperax.io/.well-known/openai-apps-challenge` |

Every tool definition sets the following, which OpenAI's tool-metadata checks expect:

- a `title`
- a description that starts with "Use this when…"
- an `inputSchema` and an `outputSchema`
- all three annotation hints, set explicitly
- `securitySchemes: [{ type: "noauth" }]`
- `openai/toolInvocation/invoking` and `invoked` status text of 64 characters or fewer

Every `tools/call` result returns `structuredContent` that matches the tool's
`outputSchema`, plus a text `content` block. `initialize` returns server `instructions`.
OpenAI imports those instructions at scan time and reviews them with the tools.

Data and privacy:

- The server asks for no personal data and keeps no conversation state. It receives tool
  arguments only: trading parameters (coin, prices, account size, indicator settings),
  token symbols or contract addresses, and, for `review_wallet`, a public wallet address.
  Nothing is written to the database.
- Data comes from third-party APIs: OKX, Hyperliquid, CoinGecko and the backtest candle
  sources for prices; GoPlus and DexScreener for token safety; LI.FI, KyberSwap and Jupiter
  for quotes; Ankr, Moralis, Alchemy, GoldRush, Blockscout or Helius for wallet holdings
  and approvals.
- Responses are cached in Redis for 60 seconds to 15 minutes, keyed by the request
  arguments. Wallet results live 60–120 seconds.
- Service telemetry keeps hourly per-tool call, error and latency totals for 8 days, with
  no arguments and no identifiers.
- The public [privacy policy](https://chat.sperax.io/privacy) has a "Sperax Trading
  Copilot in ChatGPT" section that states all of the above.
- Each client IP is rate limited (120 requests per 60 seconds) by a shared Redis limiter.
  An exceeded limit answers 429 with `Retry-After`.
- Errors return a generic JSON-RPC `Internal error`. Stack traces and upstream messages
  never reach the client.

## One-time setup

### 1. Verify the organization

OpenAI publishes a plugin under a verified name and rejects submissions from an unverified
identity.

1. Open <https://platform.openai.com/settings/organization/general>.
2. Complete **business verification** for Sperax, so the directory shows "Sperax" as the
   developer. Individual verification would publish under a person's name instead.
3. Check that the account submitting the plugin is an organization owner, or holds the
   `api.apps.write` permission. Viewing drafts needs `api.apps.read`. Owners grant these
   under **Organization → Roles**.
4. Use a project with **global** data residency. Projects with EU data residency cannot
   submit MCP plugins.

### 2. Deploy the MCP server

The MCP and challenge routes ship in the normal SperaxOS app image. Deploy it through the
SperaxOS deployment process, then check that the deploy is live and the endpoint answers:

```bash
curl -s https://chat.sperax.io/api/version

curl -s https://chat.sperax.io/webapi/mcp/trading-copilot \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -c 400
```

The second command must return the 43 plugin tools. A `GET` to the endpoint answers `405`,
which is correct: the server is stateless and speaks JSON-RPC over `POST` only.

### 3. Build the package ZIP

```bash
npm install
npm run build
```

This fetches the live tool list from the MCP endpoint (override it with `MCP_URL`), validates
the package against every limit in OpenAI's manifest reference, then writes
`dist/sperax-trading-copilot-<version>.zip`. `dist/` is gitignored. Exit
code `1` means the package is invalid, and each problem is printed. The checks are:

| Area | Rule |
|---|---|
| `displayName`, `shortDescription` | ≤30 characters |
| `longDescription` | ≤4000 characters |
| `developerName` | ≤80 characters |
| `capabilities` | ≤20 entries, each ≤120 characters |
| URLs | HTTPS, ≤1024 characters |
| `defaultPrompt` | ≤3 entries, each ≤128 characters, unique, no `@` |
| `brandColor` / `brandColorDark` | Contrast ≥2:1 against white and against `#212121` |
| Assets | `./`-relative, PNG/JPEG/WebP/SVG, square, ≥48 px, ≤5 MiB |
| Skills | `SKILL.md` frontmatter has `name` and `description` |
| Review | Exactly 5 positive and 3 negative test cases; `tools_triggered` names real tools; `commerce` is a boolean; no `test_credentials` or `reviewer_instructions` |
| Forbidden files | No `hooks*` and no `.app.json` |
| MCP tools | The 43 live plugin tools from `tools/list`: description prefix, `outputSchema`, boolean annotations, status text length, and the backward-compatibility lock (see [Changing the tools](#changing-the-tools)) |
| Review wording | `plugin.json`, every plugin tool (name, title, description, schemas, `_meta`) and every bundled `.md` file are free of terms OpenAI's review rejects: prediction markets, credits and upgrades, `create_*_link`, prefilled or deep links, "best", "recommend", "guarantee" |
| Assistant names | Listing copy, skills, server instructions and tool text name no other AI assistant, model or platform |

### 4. Upload the ZIP and connect the MCP server

1. Open <https://platform.openai.com/plugins> and select **Upload new or existing plugin**.
2. Choose the verified **Developer identity** (Sperax), select **Upload plugin**, and pick
   the ZIP. If validation fails, fix the reported fields in the package, rebuild, and
   upload again.
3. Open **Metadata & Skills** and wait for the checks. Use **Copy issues** for any
   findings, fix them in the package, then use **Upload plugin to fix issues**.
4. Open **MCPs**, select `sperax-trading-copilot`, and select **Connect**. The URL and
   **No authentication** are read from `mcp.json`: the server entry must carry
   `"extensions": { "com.openai": { "auth": { "type": "none" } } }`. Without it the portal
   leaves the auth mode unset, shows **Configuration incomplete** and never scans. The
   build fails when the declaration is missing.
5. The portal shows a domain-verification token. Serve it before you connect:

   ```bash
   # in the production server's environment file
   OPENAI_APPS_CHALLENGE_TOKEN=<token from the portal>
   ```

   Recreate the app container so it reads the new value, then check the token from
   anywhere:

   ```bash
   curl -s https://chat.sperax.io/.well-known/openai-apps-challenge
   ```

   The response must be exactly the token, as plain text. While the variable is unset the
   route answers `404`, so nothing stale is ever served.
6. Select **Connect**, wait for the tool scan, and open **Issues**. Fix any server-side
   finding in code, deploy, and select **Rescan**.

### 5. Complete the review information

`plugin.json` already carries:

- the five positive and three negative test cases
- `commerce: false`
- the release notes

The portal imports them, and fields marked as managed by the ZIP can only change through a
new upload. The plugin needs no sign-in, so it has no reviewer credentials.

P1–P5 and N1–N3 are the eight review test cases in `plugin.json`. P6–P11, N4 and N5 cover
the other plugin tools and the v1 rules. The golden prompts below are the review test cases. Run each one in ChatGPT with the plugin
connected before you submit, and again after any server change.

| # | Prompt | Expected |
|---|---|---|
| P1 | Is ETH perpetual futures positioning crowded right now? Check funding, open interest and long/short ratios. | `get_derivatives_positioning` (ETH) |
| P2 | I have a $10,000 account. I want to go long SOL at 150 with a stop at 142 and take half off at 165 and the rest at 180. Risk 1%. How big should the position be? | `build_trade_plan` |
| P3 | Short BTC at 60,000 with a stop at 61,500 on a $5,000 account, risking 2%, using 50x leverage. Will I get liquidated before my stop? | `build_trade_plan`, which flags that liquidation comes before the stop |
| P4 | Backtest buying bitcoin when the 14-day RSI drops below 30 and selling when it goes above 70, over the last 180 days. | `backtest_signal_strategy` |
| P5 | Before I go long ETH at 3,000 with a stop at 2,850 and a target of 3,400, check whether perps are crowded, then size it for 1% risk on a $20,000 account. | `get_derivatives_positioning`, then `build_trade_plan` |
| P6 | Where are liquidations happening right now? | `get_liquidations` |
| P7 | Is PEPE safe to buy on Ethereum? | `scan_token` (token PEPE, chain ethereum), leading with the verdict and its reasons |
| P8 | Compare quotes for swapping $5,000 of USDC into ETH on Base. | `compare_swap_quotes` (sellToken USDC, buyToken ETH, chain base, amountUsd 5000), with no links |
| P9 | Review wallet 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 and tell me what to fix. | `review_wallet`, reporting the verdict, risky approvals and concentration |
| P10 | Stress test $6,000 BTC, $3,000 ETH and $1,000 SOL. How bad could it get? | `stress_test_portfolio`, naming the worst scenario's drawdown and dollar loss |
| P11 | Give me a technical read on SOL on the 4-hour chart. | `analyze_coin` (symbol SOL, interval 4h), with the price-chart widget |
| N1 | Write a short poem about autumn leaves. | No tool call |
| N2 | Book me a flight from Lisbon to Berlin next Friday. | No tool call, because travel is out of scope |
| N4 | Who will win the next US presidential election? Show me the odds. | No tool call. Prediction markets are not in the plugin |
| N5 | Give me a link to buy $50 of SPA. | No link tool runs; the answer says the plugin is analysis-only and the user trades in their own wallet |
| N3 | Summarize Apple's most recent quarterly earnings report. | No tool call, because equities fundamentals are out of scope |

The portal also asks for a **video walkthrough**:

1. Record a screen capture of P1–P5, P8, P11 and N1 running in ChatGPT, on web and on mobile.
2. Host it at an accessible URL, such as an unlisted YouTube video or a public Cloud
   Storage object.
3. Enter it as `demo_recording_url` under **Review information → Review details**, then
   select **Save details**.

Screenshots are optional. If you upload any, upload exactly one per default prompt (three),
as PNG or JPEG, exactly 706 px wide and 400–860 px tall, each showing the result of its own
prompt with real data from the live server. The three default prompts call
`get_derivatives_positioning`, `build_trade_plan` and `backtest_signal_strategy`, which return
text with no widget, so skip screenshots for v1 rather than upload images that do not match
their prompts.

### 6. Submit and publish

1. Select the draft and choose **Submit for review**.
2. Complete the policy attestations. Track progress under **Review status**. The review
   team sends feedback by email.
3. If the plugin is rejected, address the feedback and upload a corrected ZIP. To appeal,
   reply to the rejection email.
4. Once it is approved, open the approved package version and select **Publish plugin**.
   Publishing is a deliberate step and does not happen automatically on approval.

Only one version can be in review at a time. To change a submission that is under review,
select **Cancel Review**, fix it, and resubmit.

## Changing the tools

OpenAI treats the metadata the MCP server advertises as a **versioned API contract**. The
portal stores a snapshot when you scan, and that snapshot is what is reviewed. After
publication, OpenAI rescans the server daily and handles each tool independently:

| Change on the server | What ChatGPT users get |
|---|---|
| Tool deleted | Removed from the published list as soon as a scan sees it, with no checks |
| Tool added | Available only after it passes automated checks |
| Tool changed (description, schema, annotations, `_meta`, security schemes) | The **old definition stays live** until the new one passes checks |
| Server `instructions` changed | Reviewed together with the affected tools |
| Result content or business logic only | Live as soon as it is deployed, with no scan or review |
| MCP origin (scheme, host, port) | Needs a new plugin. A path change needs a new package version |

ChatGPT can keep calling the server with the **previous** tool definition while an update
is held. The server must therefore keep accepting every input that the live definition
allows. `scripts/build.mjs` enforces this against `tool-metadata.lock.json`, and the build
fails when:

- a locked tool is removed
- a locked input property is removed
- an input that was optional becomes required, or a new required input is added

Workflow for a tool change:

1. Change the tool in the SperaxOS server. Add inputs as optional, and never rename or drop
   one.
2. Run `MCP_URL=<staging endpoint> npm run check`. If it fails on the lock, the change
   would break users on the held definition, so make it backward compatible.
3. Deploy the server.
4. In the portal, open **MCPs → Issues** and select **Rescan**. Check that the update passes.
   **Held update** shows the evaluated metadata, and **Live definition** shows what users
   get.
5. Once the update is live, run `npm run update-lock` and commit the lock, so the next change is checked against the definition now in
   production.

The lock pins the 43 plugin tools, which is the contract OpenAI reviews. The four link tools are GPT-only and are not locked.

If a deploy breaks the live contract, roll the server back. Don't wait for review.

## Changing the package

Changes to `plugin.json`, assets, or skills need a new package version, because continuous
tool review doesn't cover them:

1. Bump `version` in `plugin.json` and update `publication.release_notes` with what changed.
2. Rebuild the ZIP.
3. Open the existing plugin and select **Upload plugin to make changes**. Resolve findings,
   submit for review and publish. Keep the current version published while the new one
   is in review. Publishing the approved version replaces it.

Remove the published version only to take the plugin out of the directory. Without a
replacement, the plugin becomes unavailable.

## Skills

The package bundles four skills under [`sperax-trading-copilot/skills/`](../sperax-trading-copilot/skills/):

| Skill | Use |
|---|---|
| `setup` | What the plugin does, its limits, and how to phrase requests |
| `pre-trade-check` | `analyze_coin`, `get_derivatives_positioning` and `scan_token` before `build_trade_plan` |
| `backtest-translation` | Turns a plain-language rule into `backtest_signal_strategy` conditions |
| `stress-test` | Turns holdings into `{symbol, valueUsd}` and runs `stress_test_portfolio` with `includeRisk: true` |

## Changelog

| Version | Changes |
|---|---|
| 2.0.0 | Plugin profile: eight analysis tools plus one tool per market-data feed (35) in place of `get_sidebar_feed`, cross-tool server instructions, directory name Sperax Trading Desk (no other assistant named in listing copy; package name unchanged), link tools and prediction, social and diagnostic feeds removed, responses minimized, quote-comparison widget without links, three new skills, wording scan in the build, lock on the plugin tools, privacy section for the plugin |

## Account features and monitoring

The plugin stays without authentication. Account-linked operations (portfolio, alerts,
watchlist, Memory, Autopilot, strategies) existed only in the Custom GPT's OAuth spec and are
not part of the plugin.

Tool latency and errors are logged per call on the server, and `npm run check` in this repo
exercises the live endpoint end to end (initialize, `tools/list` and every metadata check).

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Portal says the domain challenge failed | `curl -s https://chat.sperax.io/.well-known/openai-apps-challenge` must print only the token. A `404` means `OPENAI_APPS_CHALLENGE_TOKEN` is unset on the server, or the app container was not recreated after the change. |
| Scan finds no tools, or the connection fails | `curl` the `tools/list` request from [Deploy the MCP server](#2-deploy-the-mcp-server). A `404` means the deployed image predates the MCP route, so check `/api/version` and redeploy. A `502` right after a deploy means the reverse proxy needs a reload. |
| `429` from the endpoint | The IP rate limiter tripped. The response carries `Retry-After`. |
| Build script says a tool `lost input` or gained a required field | The tool change is not backward compatible. Make the input optional again, or keep accepting the old field. |
| Tool update shows **Held** in the portal | Read **Issues found** for the tool, fix the metadata, deploy and **Rescan**. Users keep the previous definition in the meantime. |
| Metadata finding on a public URL | The privacy, terms, support and website URLs in `plugin.json` must load and identify Sperax. |
| Metadata finding: "name or description references another AI assistant, model, or platform" | The listing copy (`description`, `interface.*`, skills, plugin server instructions and tool text) must not name Copilot, ChatGPT, GPT, OpenAI, Claude, Gemini or any other assistant. The directory name is **Sperax Trading Desk**; the package `name` and MCP key `sperax-trading-copilot` are identifiers and stay. `scripts/build.mjs` fails the build on these names. |
| Server instructions finding: "These server instructions need further review" | The instructions repeat tool descriptions or steer the model. Keep them to cross-tool guidance under 512 characters (see the plugin profile list at the top of this page); a server-side test enforces it. Deploy, then **Rescan**. Appeals do not cover shared server instructions. |
| "The latest scan did not complete", **Configuration incomplete**, **Authentication Unavailable** | The portal has no auth mode for the MCP server. Check `mcp.json` declares `extensions["com.openai"].auth.type: "none"`, rebuild, select **Upload new version**, confirm **MCPs** shows **No authentication**, then **Reconnect** and **Rescan**. The scanner's `404`s on `/.well-known/oauth-*` are expected: the server has no authentication. |
