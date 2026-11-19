# GPT to plugin gap analysis

> **Historical record.** This document was written while preparing the first submission
> (plugin version 1.2.0, 2026-10-30). The version that passed review and is live in the
> ChatGPT plugin directory is 2.0.0; see the [runbook](./runbook.md) for the current state.

ChatGPT no longer accepts new custom GPTs. Our two GPTs, the **Sperax Trading
Copilot** and the **Sperax DeFi Analyst**, have to become one ChatGPT plugin.
This file lists every capability the GPTs had, what it becomes in the plugin,
which plugin version ships it and why. It also holds the annotation
justification text for each tool, which
[submission-checklist.md](./submission-checklist.md) section 7 points to.

Citations point to OpenAI's plugin documentation. "Line N" refers to the Markdown
version of each page (append `.md` to the URL) as fetched on 2026-10-30; the live pages
may have moved since. "Guidelines" means the
[plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines). File names in backticks such as
`tradingCopilotMcp.ts`, `shell.ts` or `_shared/` refer to the MCP server source, which lives
in the private SperaxOS repository.

## Contents

- [Sources inventoried](#sources-inventoried)
- [Summary](#summary)
- [Rules that drive the decisions](#rules-that-drive-the-decisions)
- [1. MCP plugin server: 13 tools](#1-mcp-plugin-server-13-tools)
- [2. Trading Copilot REST operations](#2-trading-copilot-rest-operations)
- [3. Data operations (DeFi Analyst and Trading Copilot)](#3-data-operations-defi-analyst-and-trading-copilot)
- [4. Generic executor: listSperaxTools and callSperaxTool](#4-generic-executor-listsperaxtools-and-callsperaxtool)
- [5. Account operations](#5-account-operations)
- [6. Verdict track record](#6-verdict-track-record)
- [7. Sidebar feeds](#7-sidebar-feeds)
- [8. Widgets](#8-widgets)
- [9. GPT-only features](#9-gpt-only-features)
- [10. Authentication gap](#10-authentication-gap)
- [11. Age blocker](#11-age-blocker)
- [12. Annotation justifications](#12-annotation-justifications)
- [13. Rollout plan](#13-rollout-plan)
- [14. Code changes](#14-code-changes)
- [15. Manual steps](#15-manual-steps)

## Sources inventoried

| Surface | Where it is defined | Docs |
|---|---|---|
| Trading Copilot MCP server (the current plugin) | `_shared/tradingCopilotMcp.ts`, widgets in `_shared/widgets/`, package in [`sperax-trading-copilot/`](../sperax-trading-copilot/) | [runbook.md](./runbook.md) |
| Trading Copilot GPT (REST actions) | `_shared/tradingCopilotSpec.ts`, routes under `gpt/trading/` and `gpt/account/` | [Sperax/speraxos-chatgpt](https://github.com/Sperax/speraxos-chatgpt) |
| DeFi Analyst GPT (REST actions) | `_shared/gptActionsSpec.ts`, routes under `data/` and `gpt/tools/` | [Sperax/speraxos-chatgpt](https://github.com/Sperax/speraxos-chatgpt) |
| Executor catalog behind `callSperaxTool` | the SperaxOS MCP gateway catalog (`catalog.ts`) | |
| Sidebar feeds | `_shared/sidebarFeeds.ts` | |
| Account and OAuth | `_shared/gptAccount.ts`, `_shared/gptAccountConstants.ts`, `_shared/gptOAuth.ts` | |

`_shared/` is the shared GPT and MCP module directory of the SperaxOS server; `data/` and
`gpt/` are its REST route groups under `/api/v1/`.

## Summary

| GPT capability | Count | Plugin outcome |
|---|---|---|
| MCP analysis tools | 9 | Ship in v1 |
| MCP link tools | 4 | Withheld from v1; re-add one per update from v5 |
| Trading Copilot REST operations | 11 trading + 2 account | All covered by MCP tools or by v4 account tools |
| Data operations (`/data/*`) | 25 | 23 become tools in v2; `news/article` dropped; `price-prediction` reworded |
| Executor (`listSperaxTools`, `callSperaxTool`) | 2 | Not portable (guidelines line 215); replaced by curated tools in v3 |
| Executor catalog identifiers | 8 groups | Per-identifier disposition in [section 4](#4-generic-executor-listsperaxtools-and-callsperaxtool) |
| Account sections and actions | 7 sections, 5 actions | v4, after OAuth passes [checklist section 10](./submission-checklist.md#10-authentication) |
| Verdict track record | 1 | New tool in v2 |
| Sidebar feeds | 41 | 35 kept, 6 excluded |
| Widgets | 3 | Ship in v1 after the swap widget fix |
| GPT instructions | 2 sets | Server instructions, `setup` plus three workflow skills (`yield-compare` in v2) |
| Conversation starters | 13 | 3 `defaultPrompt` entries plus 5 positive test cases |
| Web Search, Code Interpreter | 2 | Native to ChatGPT; no tool needed |
| Onramp checkout link | 1 | Excluded (commerce) |

Nothing from either GPT is silently lost. Everything excluded is excluded by a
cited rule, and everything deferred has a version.

## Rules that drive the decisions

| Rule | Source | Effect |
|---|---|---|
| No execution of money transfers, crypto transfers or investment trades | Guidelines line 159 | Link tools withheld from v1; no tool signs or submits anything |
| No unregulated financial services; no speculative or deceptive crypto offerings | Guidelines lines 156, 158 | Listing copy is analysis, not "earn" or "trade" |
| No gambling | Guidelines lines 123–124 | Prediction markets excluded everywhere |
| No sale of digital goods, tokens or credits; no upgrade prompts | Guidelines lines 98–112 | Credits never mentioned in plugin metadata or responses |
| No scraping or relaying third-party content without authorization | Guidelines line 72 | `news/article` URL fetcher dropped |
| No generic executor | Guidelines line 215 | `callSperaxTool` becomes individual tools |
| Each tool independent | Guidelines line 213 | Skills may chain our tools, never another plugin's |
| Response minimization | Guidelines line 249 | Strip `sourceErrors` and timestamps at the MCP layer |
| Audience includes 13–17 | Guidelines line 58 | Terms say 18+; blocker, see [section 11](#11-age-blocker) |
| One MCP server per plugin | [deploy/submission](https://developers.openai.com/plugins/deploy/submission) line 69 | Both GPTs merge into one server |
| An MCP server can't be added to a skills-only plugin later | [deploy/submission](https://developers.openai.com/plugins/deploy/submission) line 33 | v1 ships with the MCP server, not skills alone |
| The MCP origin is permanent | [deploy/app-review](https://developers.openai.com/plugins/deploy/app-review) lines 277–279 | Choose the origin once, before v1 |
| Every metadata change is re-reviewed | [deploy/app-review](https://developers.openai.com/plugins/deploy/app-review) lines 221–263 | Add tools in small batches, one risky tool per update |

## 1. MCP plugin server: 13 tools

Defined in `_shared/tradingCopilotMcp.ts`. Today every tool is
`readOnlyHint: true`, `destructiveHint: false`, `securitySchemes: noauth`, and
`openWorldHint: true` except `build_trade_plan`.

| Tool | Line | Plugin version | Annotations (read / destructive / open world) | Notes |
|---|---|---|---|---|
| `get_derivatives_positioning` | 258 | v1 | true / false / true | |
| `build_trade_plan` | 314 | v1 | true / false / false | Pure computation over user inputs |
| `backtest_signal_strategy` | 374 | v1 | true / false / true | Fetches public price history |
| `get_sidebar_feed` | 554 | v1 | true / false / true | Exclude 4 feeds ([section 7](#7-sidebar-feeds)); remove catalog mode and prediction wording from the description (line 548). Shipped as 35 per-feed tools (`PLUGIN_FEED_TOOLS`) |
| `scan_token` | 587 | v1 | true / false / true | Strip `checkedAt` (593) |
| `compare_swap_quotes` | 637 | v1 | true / false / true | Drop `links` (648) and `quotedAt` (649) in v1 |
| `review_wallet` | 689 | v1 | true / false / true | Strip `reviewedAt` (734); `revokeUrl` points at revoke.cash, a page the user opens, so keep it |
| `stress_test_portfolio` | 760 | v1 | true / false / true | Strip `generatedAt` (777, 792) |
| `analyze_coin` | 805 | v1 | true / false / true | MCP path records no verdict; keep it that way |
| `create_swap_link` | 486 | v5 | true / false / true | Strip `quotedAt` (517); no onramp checkout link |
| `create_perp_link` | 853 | v6 | true / false / true | Leverage; highest reviewer sensitivity, ship last |
| `create_order_link` | 888 | v5 | true / false / true | Limit and DCA orders |
| `create_sperax_action_link` | 919 | v6 | true / false / true | Mint, stake, farm |

Why the link tools wait: they build prefilled links and sign nothing, so they
are not execution under guidelines line 159. A reviewer can still read a
prefilled leverage or mint link as facilitating a trade, and one rejection
blocks the whole submission. Once v1 is approved, each link tool goes in its
own update, so a rejection costs one tool, not the plugin.

Also in this file:

- Server instructions (lines 57–68) mention predictions (line 63) and links.
  Rewrite them for the v1 scope. Keep "cannot place orders" and "not financial
  advice" (line 68).
- `sourceErrors` (lines 296–303) is diagnostic output. Strip it from MCP
  responses (guidelines line 249). The REST GPT routes keep it.

## 2. Trading Copilot REST operations

Defined in `_shared/tradingCopilotSpec.ts`. Every trading operation already
has an MCP equivalent, so this section only confirms coverage.

| REST path | operationId | Plugin equivalent | Gap |
|---|---|---|---|
| `/gpt/trading/analyze` (203) | `analyzeCoin` | `analyze_coin` | REST records a verdict for the track record; MCP does not |
| `/gpt/trading/backtest` (234) | `backtestStrategy` | `backtest_signal_strategy` | None |
| `/gpt/trading/derivatives` (343) | `getDerivativesPositioning` | `get_derivatives_positioning` | None |
| `/gpt/trading/feed` (367) | `getSidebarFeed` | `get_sidebar_feed` | 4 feeds excluded |
| `/gpt/trading/plan` (421) | `buildTradePlan` | `build_trade_plan` | None |
| `/gpt/trading/quotes` (498) | `compareSwapQuotes` | `compare_swap_quotes` | `links` withheld until v5 |
| `/gpt/trading/scan` (559) | `scanToken` | `scan_token` | None |
| `/gpt/trading/stress-test` (589) | `stressTestPortfolio` | `stress_test_portfolio` | None |
| `/gpt/trading/wallet-review` (712) | `reviewWallet` | `review_wallet` | None |
| `/gpt/trading/swap-link` (640) | `createSwapLink` | `create_swap_link` | v5; the onramp checkout link is excluded for good (guidelines lines 98–107) |
| `/gpt/trading/action-link` (104) | `createActionLink` | `create_perp_link`, `create_order_link`, `create_sperax_action_link` | v5–v6; one REST operation with six kinds becomes three tools |
| `/gpt/account` (874) | `getMyAccount` | `get_my_account` | v4 |
| `/gpt/account/actions` (790) | `updateMyAccount` | five account tools | v4; see [section 5](#5-account-operations) |

The REST descriptions quote credit costs ("2 credits", "3 credits"). None of
that text may reach the plugin (guidelines lines 100–112).

## 3. Data operations (DeFi Analyst and Trading Copilot)

`GPT_ACTION_DESCRIPTIONS` in `_shared/gptActionsSpec.ts` (lines 27–78) lists
25 `/data/*` operations for the DeFi Analyst. The Trading Copilot's
`TRADING_DATA_DESCRIPTIONS` (`tradingCopilotSpec.ts` lines 28–61) lists 17,
all of which are in the 25. Each becomes one plugin tool with a verb name
(guidelines lines 200–202), calling the same `_shared` code as the route,
with no credit wording. All are read-only and `noauth`.

| `/data` op | Plugin tool | Version | Open world | Notes |
|---|---|---|---|---|
| `chain` | `get_chain_overview` | v2 | true | TVL and top protocols per chain |
| `coin` | `get_coin_market_data` | v2 | true | Price, market cap, supply, chart or OHLC |
| `contract` | `inspect_contract` | v2 | true | ABI, read calls, events, tx decode; read calls only |
| `crypto-etfs` | `get_crypto_etf_flows` | v2 | true | |
| `daily-briefing` | `get_daily_briefing` | v2 | true | |
| `defi-pools` | `list_defi_pools` | v2 | true | |
| `defi-stats` | `get_defi_stats` | v2 | true | TVL, DEX volume, fees |
| `exchange` | `get_exchange_overview` | v2 | true | |
| `helius` | `get_solana_wallet_activity` | v2 | true | Balances, transactions, NFTs, priority fees |
| `lending` | `get_lending_rates` | v2 | true | |
| `markets` | `get_market_overview` | v2 | true | Overview, fear and greed, search, symbols |
| `news` | `get_crypto_news` | v2 | true | Headlines with source links; no full-text relay |
| `news/article` | none | dropped | | Fetches the full text of any URL: scraping under guidelines line 72 |
| `portfolio` | `get_wallet_holdings` | v2 | true | EVM wallet holdings |
| `price-prediction` | `get_price_outlook` | v2 | true | Rename and describe as model-based technical analysis with indicators, never a forecast or a bet; no prediction-market data |
| `protocol` | `get_protocol_overview` | v2 | true | |
| `research` | `get_research_report` | v2 | true | |
| `social` | `get_social_sentiment` | v2 | true | Aggregate sentiment and trends only; no individual profiling |
| `sperax` | `get_sperax_protocol_stats` | v2 | true | USDs, auto-yield, farms, staking, xSPA, buyback. Present yields as current rates, not promises (guidelines line 158) |
| `stablecoins` | `get_stablecoin_overview` | v2 | true | |
| `swap-quote` | `get_swap_quote` | v2 | true | Indicative quote only; overlaps `compare_swap_quotes`, so keep descriptions distinct |
| `token-holders` | `get_token_holders` | v2 | true | |
| `token-markets` | `get_token_markets` | v2 | true | |
| `yield-pools` | `get_yield_pool_history` | v2 | true | |
| `yield-vaults` | `list_yield_vaults` | v2 | true | Yearn and Beefy |

The `data/` route group also has `dune`, `erc8004`, `etherscan`,
`plutus`, `status` and `tenderly` routes that neither GPT exposed. They are
outside parity; any of them that lands later follows the same pattern.

v2 adds 23 tools plus `get_verdict_track_record`. Describe each tool narrowly
enough that the model can pick it without a router; the DeFi Analyst
instructions that steered tool choice move into the skills
([section 9](#9-gpt-only-features)).

## 4. Generic executor: listSperaxTools and callSperaxTool

The GPTs reached the rest of the platform through `GET /gpt/tools`
(`listSperaxTools`) and `POST /gpt/tools/call` (`callSperaxTool`, "Costs 2
credits", `gptActionsSpec.ts` line 133). Guidelines line 215 forbids exactly
this: "Do not use discovery, operation selection, or schema fetching with a
generic executor". It cannot be ported.

v3 replaces it with curated tools: one tool per useful read operation, named
and described for review. The groups and identifiers come from
the SperaxOS MCP gateway catalog (`catalog.ts`).

| Group (line) | Identifiers | Disposition |
|---|---|---|
| market (68) | coingecko, defillama, markets, defi-analytics, token-categories, token-emissions, company-holdings, dex-aggregators, options-volume, bridges, nft-market, binance-market, chainlink, aixbt, launch-oracle | Port as read tools. Most overlap v2 data tools; add only what v2 lacks: `get_token_categories`, `get_token_emissions`, `get_company_crypto_holdings`, `get_options_volume`, `get_bridge_volumes`, `get_nft_collection_stats`, `get_oracle_price`. Drop `launch-oracle` unless its output is analysis, not launch promotion |
| onchain (92) | etherscan, internal-txs, contract-explorer, helius, gmgn, zapper, 1inch-portfolio, fusion-orders, wallet-trace, giza, name-service, robinhood-chain, smart-money, pump-agent-payments, dune-analytics, lobe-safe-multisig | Port reads: `get_address_transactions`, `get_internal_transactions`, `resolve_name`, `trace_wallet_flows`, `get_safe_multisig_info`, `query_dune_dashboard`. Drop `fusion-orders` (order flow), `pump-agent-payments` (payments), `giza` and `robinhood-chain` (no analysis value over v2) |
| defi (136) | spa, lending, yield-vaults, yield-optimizer, il-calculator, liquidity-advisor, uniswap-v3, pancakeswap, four-meme, lobe-backtesting, flash-loan-scanner, dex-new-listings, listadao, protocol, plutus, dust-sweeper, swap, jupiter | Port reads: `calculate_impermanent_loss` (open world false), `compare_yield_options`, `analyze_liquidity_position`, `get_uniswap_v3_pool`, `get_new_dex_listings`. Drop `swap`, `jupiter`, `dust-sweeper` (build or route trades), `four-meme` (meme launches), `flash-loan-scanner` (arbitrage execution), `plutus` (smart accounts, signs) |
| risk (213) | protocol-risk, goplus-security, defi-hacks, liquidations, token-unlocks, vc-raises, governance, mev-shield, tx-simulator, tx-builder, token-approvals, erc8004, lobe-copy-trading, agent-reputation | Port reads: `get_protocol_risk_score`, `get_defi_hack_history`, `get_liquidations`, `get_token_unlocks`, `get_vc_raises`, `get_governance_proposals`, `simulate_transaction` (read-only simulation, no broadcast), `list_token_approvals`, `get_agent_reputation`. Drop `tx-builder` (builds transactions), `lobe-copy-trading` (trading), `mev-shield` (submission routing) |
| news (270) | crypto-news, x-social, daily-report, academy, price-prediction, research-intel, tradingview, zealy | Covered by v2 except `get_learning_article` (academy) and `get_technical_ratings` (tradingview). Drop `zealy` (quests and rewards) |
| predict (293) | polymarket, limitless, pump-fun, lobe-perpetuals, papertrade | Drop the whole group: prediction markets are gambling (guidelines lines 123–124); the rest is trading |
| dextools (332) | dextools | Port as `get_dex_pair_info` |
| smartmoney (346) | smart-money, gmgn, wallet-trace, helius, lobe-copy-trading, dune-analytics, aixbt, dex-new-listings, liquidations, token-unlocks | Port `get_smart_money_flows` as aggregate flows only. Wallet-level tracking of named people reads as profiling (guidelines line 64); keep it out unless the user supplies the address. `lobe-copy-trading` dropped as above |

Keep v3 to about 25 tools. Every tool added is metadata a reviewer reads, and
each extra tool is one more chance of a description that does not match
behavior (guidelines line 207).

## 5. Account operations

The Trading Copilot GPT had `getMyAccount` and `updateMyAccount` behind OAuth
(`GPT_OAUTH_SCOPE = 'intel'`, `_shared/gptAccountConstants.ts`). They land in
v4, and only after every OAuth item in [section 10](#10-authentication-gap)
passes.

| Plugin tool | From | Read only | Destructive | Open world | Auth |
|---|---|---|---|---|---|
| `get_my_account` | `getMyAccount`, sections overview, portfolio, alerts, watchlist, strategies | true | false | false | oauth2 |
| `watch_wallet` | `updateMyAccount` `watch_wallet` | false | false | false | oauth2 |
| `unwatch_wallet` | `updateMyAccount` `unwatch_wallet` | false | true | false | oauth2 |
| `create_price_alert` | `updateMyAccount` `create_alert` | false | false | false | oauth2 |
| `delete_price_alert` | `updateMyAccount` `delete_alert` | false | true | false | oauth2 |
| `toggle_price_alert` | `updateMyAccount` `toggle_alert` | false | true | false | oauth2 |

Annotation reasoning, from guidelines lines 221–223:

- `watch_wallet` and `create_price_alert` are additive writes, so
  `destructiveHint: false`.
- `unwatch_wallet` and `delete_price_alert` delete; `toggle_price_alert`
  overwrites state (disabling an alert is a cancellation). "Undo-ability
  alone doesn't justify false", so all three are `destructiveHint: true`.
- All account tools act inside the user's own bounded account, so
  `openWorldHint: false`. Connectivity to market data does not change that.

Sections:

- `memory` and `autopilot` stay out. Memory is stored conversation context
  (guidelines line 252); autopilot reads as automated trading.
- `strategies` returns names and parameters only, no execution state.

Credits: the OAuth access token is an `intel`-scoped API key, so account calls
spend credits as on the web. The plugin must never mention credits, a
balance or an upgrade. When credits run out, return a neutral error that
links the informational account page (guidelines lines 102–107). The
`gptLinkBonus` grant (`_shared/gptLinkBonus.ts`) may stay as a server-side
behavior, but no listing text or tool output may advertise it.

## 6. Verdict track record

`GET /api/v1/gpt/track-record`
publishes how past `analyzeCoin` verdicts scored. It is public, returns no
caller identities and is read-only. Add it in v2 as
`get_verdict_track_record` (read only, not destructive, open world false: it
reads our own bounded dataset).

Because MCP `analyze_coin` records no verdict, the track record covers
verdicts from the REST GPT only. Say so in the tool description.

## 7. Sidebar feeds

`_shared/sidebarFeeds.ts` defines 41 feeds behind `get_sidebar_feed`.

| Disposition | Feeds |
|---|---|
| Keep (34) | fear-greed, market-regime, macro-dashboard, tradfi-chart, stock-quotes, market-intelligence, sentiment, whale-alerts, exchange-flow, funding-rates, open-interest, liquidations, long-short-ratio, options, etf-flows, bitcoin, gas, global-market, markets-table, trending, new-listings, dex-volume, defi-overview, chain-tvl, top-protocols, protocol-revenue, yields, stablecoins, bridges, token-unlocks, governance, erc8004-agents, news, sperax |
| Keep with review (1) | wallet-tracker (labelled whale wallets; keep only publicly labelled entities) |
| Exclude (6) | predictions (line 691; gambling); platform-status and service-status (internal operations, not user value; response minimization, guidelines line 249); ct-pulse, kol-leaderboard and tech-pulse (relay third-party social content, line 72) |

Implement the exclusion as an allowlist in the MCP layer so a feed added later
does not reach the plugin without review.

## 8. Widgets

Three widgets in `_shared/widgets/`, served as `text/html+skybridge`
resources:

| Widget | Tools | Status |
|---|---|---|
| price-chart (`priceChartWidget.ts`) | `analyze_coin` | v1 |
| swap-quote (`swapQuoteWidget.ts`) | `compare_swap_quotes`; `create_swap_link` from v5 | v1 after fix |
| portfolio (`portfolioWidget.ts`) | `review_wallet`, `stress_test_portfolio` | v1 |

Fixes before v1 (details in
[checklist section 7a](./submission-checklist.md#7a-widgets-custom-ui)):

- Done: `swapQuoteWidget.ts` renders at most one primary and one secondary
  button. Inline cards allow at most two actions
  ([concepts/ui-guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines)
  line 79). In v1, with no links, the card needs no trade buttons at all.
- If a widget's data shape changes, publish it under a new resource URI
  (`-v2`) instead of editing the old one, so cached cards keep rendering.
- Done: `shell.ts` posts to the host origin, taken from
  `location.ancestorOrigins`, the referrer, or the first message from the
  parent. It falls back to `'*'` only when the parent origin is opaque.

## 9. GPT-only features

| GPT feature | Plugin equivalent |
|---|---|
| Trading Copilot instructions (`chatgpt-trading-copilot.md` lines 280–310) | Server instructions for scope and safety, plus skills for workflows |
| DeFi Analyst instructions (`chatgpt-custom-gpt.md`) | Same. Its "act at chat.sperax.io or app.sperax.io" lines stay as plain informational links, not calls to action |
| Web Search (on in both GPTs) | Native to ChatGPT; no tool |
| Code Interpreter (on in both GPTs) | Native to ChatGPT. The backtest skill tells the model to chart `equityCurve` with ChatGPT's own data analysis |
| Image Generation (off) | Nothing to port |
| Knowledge (empty in both) | Nothing to port |
| 8 Trading Copilot starters, 5 DeFi Analyst starters | 3 `defaultPrompt` entries (limit 3, each ≤128 characters, [deploy/submission-errors](https://developers.openai.com/plugins/deploy/submission-errors) lines 30–41) plus the 5 positive test cases |
| Onramp checkout link in `createSwapLink` | Excluded: starts a purchase (guidelines lines 98–107) |
| Revoke links in `reviewWallet` | Kept: plain links to revoke.cash, a page the user opens; no write by us |

### Instructions become skills

The Trading Copilot's 8-step workflow (scan, thesis, positioning, plan,
backtest, risk, execute, stress) cannot live in tool descriptions without
breaking tool independence. It moves into skills in
`sperax-trading-copilot/skills/`, next to the existing
`setup` skill. Skills are scanned like metadata (guidelines line 285), so
they follow the same scope rules: no links to execute, no predictions, no
credits.

| Skill | Replaces | Tools it uses |
|---|---|---|
| `pre-trade-check` | Steps 1–4 and 6: scan, thesis, positioning, plan, risk at 1% by default | `scan_token`, `analyze_coin`, `get_derivatives_positioning`, `build_trade_plan` |
| `backtest-translation` | Strategy translation (SMA_50, RSI_14, MACD_12_26_9, BB_20_2) and the equity-curve chart | `backtest_signal_strategy` |
| `stress-test` | Step 8 and wallet health | `review_wallet`, `stress_test_portfolio` |
| `yield-compare` | DeFi Analyst yield and USDs comparisons | `list_defi_pools`, `get_sperax_protocol_stats`, `list_yield_vaults` (v2) |

Step 7 ("execute") is dropped from the skills in v1. From v5 it returns as
"open a prefilled link the user reviews and signs elsewhere".

### Starters become defaultPrompt and test cases

Current `defaultPrompt` in `plugin.json` (keep):

1. "Is Bitcoin perp funding crowded right now, and is there squeeze risk?"
2. "Size a long on SOL at 150, stop 142, targets 165 and 180, risking 1% of a
   $10,000 account."
3. "Backtest buying ETH when RSI drops below 30 and selling above 70 over the
   last 180 days."

GPT starters and where they go:

| Starter | Disposition |
|---|---|
| "What's the market setup today, and where is positioning crowded?" | Positive test case (`get_market_regime`, `get_funding_rates`, `get_derivatives_positioning`) |
| "I want to long ETH at 3,000 with a stop at 2,850 and 5x…" | Covered by `defaultPrompt` 2 |
| "Backtest buying BTC when RSI(14) drops under 30…" | Covered by `defaultPrompt` 3 |
| "Is SOL funding overheated?…" | Covered by `defaultPrompt` 1 |
| "Give me a trade idea with a full plan…" | Positive test case (`analyze_coin`, `build_trade_plan`) |
| "I want to buy $50 worth of SPA." | Not a v1 case: it asks for a purchase. Returns as a v5 case with `create_swap_link` |
| "Review my wallet 0x…" | Positive test case (`review_wallet`) with a fixed public address |
| "Stress test $6k BTC, $3k ETH and $1k SOL…" | Positive test case (`stress_test_portfolio`) |
| "What's happening in crypto markets today?" | v2 test case (`get_daily_briefing`) |
| "Compare the best stablecoin yields above $10M TVL, including USDs." | v2 test case (`list_defi_pools`, `get_sperax_protocol_stats`) |
| "What is USDs auto-yield paying right now…" | v2 test case |
| "Get me a quote to swap 1,000 USDC to ETH on Arbitrum." | Positive test case (`compare_swap_quotes`) |
| "Is this token a honeypot or rug risk? 0x…" | Positive test case candidate (`scan_token`) with a fixed known token |

Pick 5 of the positive cases above. Negative case 2 becomes "Book me a flight
from Lisbon to Berlin next Friday." ([checklist section 11](./submission-checklist.md#11-test-cases)).

## 10. Authentication gap

Today (`_shared/gptOAuth.ts`): authorization code with PKCE that accepts
`plain` or `S256`, HS256 JWT codes and refresh tokens, a static client ID,
client secret and redirect URI list, and no discovery documents. ChatGPT
plugins need more ([build/auth](https://developers.openai.com/plugins/build/auth)):

| Requirement | OpenAI build/auth | Today |
|---|---|---|
| Protected resource metadata (`/.well-known/oauth-protected-resource` or `WWW-Authenticate` with `resource_metadata`) | lines 46, 68 | 404 |
| Authorization server metadata, with `client_id_metadata_document_supported` and supported auth methods | lines 89–107 | 404 |
| Accept CIMD client ID `https://chatgpt.com/oauth/client.json` | line 203 | Static client ID only |
| ChatGPT redirect URIs | lines 176, 179 | Static list |
| PKCE S256 required | lines 187–193 | Optional; `plain` accepted |
| `aud` bound to the MCP resource; issuer, audience, expiry and scope checked per request | lines 187–193, 217, 308–317 | Token is an API key with no `aud` |
| 401 with `WWW-Authenticate` on failure | lines 308–317 | Not on the MCP route |
| Per-tool `securitySchemes`: `noauth` for analysis, `oauth2` for account tools | lines 567–575 | All `noauth` |

The REST GPT OAuth flow stays as it is for existing GPT users. Plugin OAuth is
added next to it. Also needed for v4: a reviewer demo account
([checklist section 10](./submission-checklist.md#10-authentication)).

## 11. Age blocker

Guidelines line 58: plugins must suit users aged 13–17.
`TermsContent.tsx` line 17 says the service is for users 18 and over. A
reviewer comparing the two can reject the plugin. The plugin must not be
submitted until legal decides one of these:

- the plugin's analysis-only surface is offered to 13–17-year-olds under a
  plugin-specific terms section, with no account tools for minors; or
- the plugin waits for OpenAI's 18+ support (line 58, "will arrive once
  appropriate age verification and controls are in place").

Either way, add a plugin section to the privacy policy (`PrivacyContent.tsx`)
that covers what the MCP server logs (`_shared/gptTelemetry.ts`), how long it
keeps it and that it stores no conversation content. See
[checklist section 5](./submission-checklist.md#5-audience-and-legal-pages).

## 12. Annotation justifications

Guidelines line 219 says justifications are "no longer required", while the
portal still asks for them
([deploy/submission-errors](https://developers.openai.com/plugins/deploy/submission-errors)
lines 95–96). Write one for every tool. Paste the text below.

**v1 analysis tools.** `get_derivatives_positioning`,
`backtest_signal_strategy`, `scan_token`, `compare_swap_quotes`,
`review_wallet`, `stress_test_portfolio`, `analyze_coin`, and each of the 35
market-data tools from `PLUGIN_FEED_TOOLS` (`get_fear_greed_index` through
`get_sperax_protocol_stats`, listed in the [runbook](./runbook.md)):

- readOnlyHint true: "Retrieves and computes over public market and
  blockchain data. It creates, changes or deletes nothing, and calling it
  again has no side effects."
- destructiveHint false: "Read-only; it performs no write of any kind."
- openWorldHint true: "Reads public, open-ended entities: any token, wallet
  address or market the user names, from public market and blockchain
  sources."

**`build_trade_plan`:**

- readOnlyHint true: "Pure computation over the entry, stop, targets, account
  size and risk the user provides. Nothing is stored or sent."
- destructiveHint false: "Read-only; it performs no write of any kind."
- openWorldHint false: "Uses only the numbers in the request. It reads no
  external data and reaches no external entity."

**v2 data tools** (every tool in [section 3](#3-data-operations-defi-analyst-and-trading-copilot)):
the same three texts as the v1 analysis tools.

**`get_verdict_track_record`:**

- readOnlyHint true: "Reads aggregate scores of past analyses. No writes."
- destructiveHint false: "Read-only; it performs no write of any kind."
- openWorldHint false: "Reads only Sperax's own bounded dataset of scored
  verdicts; no caller identities."

**`calculate_impermanent_loss`** (v3): the `build_trade_plan` texts, with
"price change and pool weights" in place of the trade inputs.

**v3 curated reads**: the v1 analysis texts. For `simulate_transaction` add
to readOnlyHint: "Simulates against a fork; it never signs or broadcasts."

**v4 account tools:**

- `get_my_account`: readOnlyHint true, "Reads the signed-in user's own
  watchlist, alerts, portfolio and strategy names. No writes."; destructiveHint
  false, "Read-only."; openWorldHint false, "Confined to the signed-in user's
  own account."
- `watch_wallet`, `create_price_alert`: readOnlyHint false, "Adds an entry to
  the user's own watchlist or alerts."; destructiveHint false, "Additive only;
  it never deletes or overwrites existing entries."; openWorldHint false,
  "Confined to the user's own account."
- `unwatch_wallet`, `delete_price_alert`: readOnlyHint false, "Removes an
  entry from the user's own account."; destructiveHint true, "Deletes an
  entry."; openWorldHint false, "Confined to the user's own account."
- `toggle_price_alert`: readOnlyHint false, "Changes whether one of the user's
  alerts is active."; destructiveHint true, "Overwrites the alert's state;
  disabling it cancels notifications."; openWorldHint false, "Confined to the
  user's own account."

**v5+ link tools** (`create_swap_link`, `create_order_link`,
`create_perp_link`, `create_sperax_action_link`):

- readOnlyHint true: "Builds a prefilled link and returns it. It signs,
  submits and stores nothing; the user reviews and signs in their own wallet
  outside ChatGPT."
- destructiveHint false: "Read-only; it performs no write of any kind."
- openWorldHint true: "Takes any token or market the user names."

If automated review flags an annotation, appeal with the matching text above
(guidelines line 219).

## 13. Rollout plan

One review runs at a time and there is no expedite
([deploy/app-review](https://developers.openai.com/plugins/deploy/app-review) lines 141–161).
Every update bumps `version` in `plugin.json`.

| Version | Adds | Gate |
|---|---|---|
| v1 | 9 analysis tools, 3 widgets, server instructions, `setup` plus 3 workflow skills | Every item in [submission-checklist.md](./submission-checklist.md), including the age blocker |
| v2 | 23 data tools and `get_verdict_track_record` | v1 approved |
| v3 | About 25 curated tools from the executor catalog | v2 approved |
| v4 | 6 account tools with OAuth | All OAuth items in [section 10](#10-authentication-gap); demo account |
| v5 | `create_swap_link`, then `create_order_link`, each in its own update | Previous update approved; links back in `compare_swap_quotes` |
| v6 | `create_sperax_action_link`, then `create_perp_link`, each in its own update | Previous update approved |

## 14. Code changes

v1, all additive except where noted:

- Done: `_shared/tradingCopilotMcp.ts` has a `plugin` profile
  (`TradingCopilotProfile`), the default on `/webapi/mcp/trading-copilot`;
  `?profile=full` keeps the 13 GPT tools for the existing MCP group.
  - The 4 link tools are absent from the plugin `tools/list` and a call to
    them returns -32602 (`TRADING_COPILOT_PLUGIN_TOOLS`).
  - `TRADING_COPILOT_PLUGIN_INSTRUCTIONS` names no predictions, links or
    execution.
  - `minimizeForPlugin` strips `sourceErrors`, `quotedAt`, `checkedAt`,
    `reviewedAt` and `generatedAt`.
  - `compare_swap_quotes` returns no `links` or `execution` in the plugin
    profile.
  - The plugin profile replaces `get_sidebar_feed` with one tool per allowed
    feed (`PLUGIN_FEED_TOOLS`, 35 tools), after the portal flagged the `feed`
    selector as unexposed operations. `PLUGIN_BLOCKED_FEEDS` removes
    `ct-pulse`, `kol-leaderboard`, `platform-status`, `predictions`,
    `service-status` and `tech-pulse`; no plugin tool reaches them.
- Done: `_shared/widgets/swapQuoteWidget.ts` renders at most two actions.
  The plugin profile uses the new button-free
  `ui://widget/quote-comparison.html` for `compare_swap_quotes`.
- Done: `_shared/widgets/shell.ts` posts to the host origin instead of `'*'`.
- Done: `sperax-trading-copilot/plugin.json`:
  - `repository` removed;
  - long description and capabilities rewritten for analysis only;
  - `websiteURL` is `https://sperax.io`;
  - `version` is `2.0.0`, with `publication.release_notes`.
  - Manual: `review.demo_recording_url` waits for the recorded video
    ([section 15](#15-manual-steps)).
- Done: `sperax-trading-copilot/skills/` adds `pre-trade-check`,
  `backtest-translation` and `stress-test`. `yield-compare` moves to v2: v1 has
  no yield tool to reference.
- Done: `tool-metadata.lock.json` pins the 43 plugin tools.
- Done: `scripts/build.mjs` fails the build on review-flagged
  wording (`REVIEW_FORBIDDEN`) in instructions, descriptions, skills and
  `plugin.json`.
- Done: "Sperax Trading Copilot in ChatGPT" section in `PrivacyContent.tsx`.
  Manual: terms per [section 11](#11-age-blocker).

v2: one tool per row in [section 3](#3-data-operations-defi-analyst-and-trading-copilot),
each calling the existing `data/` route handler code, plus
`get_verdict_track_record`. Add `yield-compare` tool references once the
tools exist.

v3: curated tools per [section 4](#4-generic-executor-listsperaxtools-and-callsperaxtool),
each a direct call to the builtin tool's API, never through the executor.

v4: protected resource metadata, authorization server metadata, CIMD, required
S256, `aud`-bound tokens and 401 handling on the MCP route; per-tool
`securitySchemes`; the 6 account tools.

## 15. Manual steps

These need a person in the OpenAI portal or outside the repo:

- Decide the permanent MCP origin before v1
  ([deploy/app-review](https://developers.openai.com/plugins/deploy/app-review) lines 277–279);
  changing it later goes through support
  ([deploy/submission](https://developers.openai.com/plugins/deploy/submission) line 206).
- Set the domain-verification challenge token in production
  ([deploy/submission](https://developers.openai.com/plugins/deploy/submission) line 155).
- Legal decision on the age blocker.
- Choose the countries the plugin is offered in.
- Record the demo video and host it publicly.
- Screenshots are optional for widgets: if used, one per prompt, 706 px wide,
  400–860 px tall ([deploy/submission-errors](https://developers.openai.com/plugins/deploy/submission-errors)
  lines 43–64).
- Create the reviewer demo account for v4.
- Enter the justifications from [section 12](#12-annotation-justifications)
  in the portal.
