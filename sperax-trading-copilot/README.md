# Sperax Trading Desk — plugin package

This directory is the source of the **Sperax Trading Desk** ChatGPT plugin (package name
`sperax-trading-copilot`). The ZIP uploaded to the OpenAI plugin portal
(<https://platform.openai.com/plugins>) is built from it. The plugin connects ChatGPT to the
remote MCP server at `https://chat.sperax.io/webapi/mcp/trading-copilot`. With no query
string the route serves the **plugin profile**: 43 read-only tools, eight for analysis and
35 for market data.

| Tool | What it does |
|---|---|
| `get_derivatives_positioning` | Live perp funding, open interest and long/short ratios from OKX and Hyperliquid |
| `build_trade_plan` | Risk-based position size, liquidation-vs-stop check, R-multiples and expected value |
| `backtest_signal_strategy` | Indicator backtest on real daily candles with fees and slippage |
| `scan_token` | Token safety verdict: honeypot, taxes, owner powers, holders, liquidity |
| `compare_swap_quotes` | Quotes from LI.FI, KyberSwap and Jupiter for one trade, listed side by side |
| `review_wallet` | Holdings, concentration, risky approvals, token safety and stress for one wallet |
| `stress_test_portfolio` | Crisis replay of a holdings list with drawdown, losers and VaR |
| `analyze_coin` | Trend, momentum, levels, ATR stops and positioning folded into a verdict and plan seed |
| `get_fear_greed_index`, `get_liquidations`, `get_etf_flows`, `get_crypto_news`… | One tool per live market-data feed (35), listed in the [runbook](../docs/runbook.md#live-listing) |

The plugin profile follows OpenAI's v1 app rules:

- It never builds transactions or trade links. `create_swap_link`, `create_perp_link`,
  `create_order_link` and `create_sperax_action_link` are not listed, and calling them
  returns JSON-RPC error -32602.
- It removes diagnostics from responses: `sourceErrors` and timestamps are dropped. Quote
  comparisons also lose their DEX links and execution data.
- It blocks feeds that carry prediction markets, third-party social posts or internal
  service status. These are `predictions`, `ct-pulse`, `kol-leaderboard`, `tech-pulse`,
  `platform-status` and `service-status`.

The earlier Custom GPT ([Sperax/speraxos-chatgpt](https://github.com/Sperax/speraxos-chatgpt))
keeps all thirteen tools at `…/trading-copilot?profile=full`. Any other `profile` value falls
back to the plugin profile.

The full submission and maintenance runbook is [`docs/runbook.md`](../docs/runbook.md).

## Layout

```
sperax-trading-copilot/
├── plugin.json            # manifest: interface metadata, review test cases, publication
├── mcp.json               # remote MCP server declaration (streamable HTTP, no auth)
├── skills/
│   ├── setup/SKILL.md                # onboarding: what the plugin can do
│   ├── pre-trade-check/SKILL.md      # scan → analyze → positioning → trade plan
│   ├── backtest-translation/SKILL.md # plain-language rules → backtest_signal_strategy
│   └── stress-test/SKILL.md          # wallet or holdings → crisis replay with VaR
├── assets/                # logo + composer icon, light and dark (square SVG)
└── README.md              # this file — not included in the ZIP
```

## Build

Run these from the repository root after `npm install`:

```bash
npm run build        # validate, then write dist/sperax-trading-copilot-<version>.zip
npm run check        # validate only
npm run update-lock  # accept the live MCP tool contract into tool-metadata.lock.json
```

The validator checks every limit from OpenAI's manifest reference. It fetches the live
plugin-profile tool definitions from the MCP endpoint (override with `MCP_URL`) and compares
them with [`tool-metadata.lock.json`](../tool-metadata.lock.json). The build fails if a tool
was removed, an input was dropped, or an input became required. Any of those changes would
break the published definition that ChatGPT keeps serving while an update is held in review.

It also scans `plugin.json`, every skill and every plugin tool definition for wording that
OpenAI review rejects. That covers prediction markets, credits and upgrades, prefilled trade
links, and promotional claims such as "best" or "recommend".
