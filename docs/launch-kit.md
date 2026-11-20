# Launch kit

Copy for announcing Sperax Trading Desk, plus the MCP directories to list it in. Every number
here matches the live endpoint as of 2.0.0 (2026-11-17). Re-check the tool count on the
[tool reference](https://sperax-trading-desk.pages.dev/tools) before reusing this copy
for a later version.

## Facts and links

| | |
|---|---|
| Name | Sperax Trading Desk |
| One line | Free, read-only crypto trade analysis for ChatGPT and any MCP client |
| ChatGPT listing | <https://chatgpt.com/plugins/plugin_asdk_app_6aea0b5be6608191a02eeebc810e235c> |
| Website | <https://sperax-trading-desk.pages.dev/> |
| Code | <https://github.com/Sperax/chatgpt-plugin> |
| MCP endpoint | `https://chat.sperax.io/webapi/mcp/trading-copilot` (streamable HTTP, no key) |
| Tools | 43, all read-only: 8 analysis tools and 35 live market feeds, plus 4 guided skills |
| Social card | [`.github/social-preview.png`](../.github/social-preview.png) (1280x640) or the site's `og-image.png` (1200x630) |
| Video | [`launch-video/sperax-trading-desk-chatgpt.mp4`](../launch-video/sperax-trading-desk-chatgpt.mp4) (43 s, 1920x1080) |
| Sperax | Building since 2019, $17M raised, strategic partnership with Microsoft through the Microsoft AI Cloud Partner Program, SperaxOS on Microsoft Marketplace |
| Handles | [@SperaxUSD](https://x.com/SperaxUSD) · [t.me/SperaxUSD](https://t.me/SperaxUSD) |

### Copy rules

- Say "read-only" and "no sign-in". These answer the first question every trader asks.
- Show a real prompt and what comes back. A concrete example beats a feature list.
- Don't promise returns, call anything "the best", or present results as advice.
- State the Microsoft relationship as a strategic partnership through the Microsoft AI Cloud
  Partner Program. Don't say Microsoft invested, co-sells, or that the endpoint runs on Azure.

## X thread

Post 1 with the video attached, the rest as replies. Put the link in the last post so the
first post reaches as many people as possible.

> **1/** Sperax Trading Desk is live in the ChatGPT plugin directory.
>
> Ask ChatGPT about a trade and get real numbers back: futures positioning, position size with
> a liquidation check, backtests and token safety scans.
>
> Read-only. No sign-in. Free.

> **2/** "Is BTC perp funding crowded right now?"
>
> It pulls live funding, open interest and long/short ratios from OKX and Hyperliquid, then
> labels the market crowded-long, crowded-short or neutral, with squeeze risk.

> **3/** "Size a long on SOL at 150, stop 142, targets 165 and 180, risking 1% of $10k."
>
> You get the position size after fees, whether liquidation sits before your stop,
> R-multiples, breakeven win rate and expectancy.

> **4/** "Backtest buying ETH when RSI drops below 30, selling above 70, last 180 days."
>
> Fees, slippage and gas included, compared against buy-and-hold and Bitcoin.

> **5/** Plus 35 live feeds: ETF flows, liquidations, options, stablecoins, token unlocks,
> DeFi yields, whale alerts, macro and more.
>
> 43 tools in total, and none of them can place orders or move funds.

> **6/** It isn't only for ChatGPT. The same MCP endpoint works in Claude, Cursor, VS Code,
> Windsurf, Gemini CLI and Codex, with one line of config and no key.

> **7/** Built by Sperax: building since 2019, $17M raised, in a strategic partnership with
> Microsoft.
>
> Add it to ChatGPT: https://chatgpt.com/plugins/plugin_asdk_app_6aea0b5be6608191a02eeebc810e235c
> Setup for every client: https://sperax-trading-desk.pages.dev/

## LinkedIn

Attach the video.

> Sperax Trading Desk is now live in the ChatGPT plugin directory.
>
> Most AI answers about markets are confident and unsourced. We built the opposite: ask ChatGPT
> about a trade and it calls tools that return real numbers from live market data.
>
> • Perpetual-futures positioning from OKX and Hyperliquid, with squeeze risk
> • Position sizing with fees, a liquidation-versus-stop check and expectancy
> • Backtests of RSI, moving-average, MACD and Bollinger rules against buy-and-hold
> • Token safety scans, swap quote comparisons and wallet health checks
> • 35 live feeds, from ETF flows to token unlocks
>
> Every tool is read-only. It never connects to an exchange, holds funds or asks for keys, and it
> needs no sign-in.
>
> The same 43 tools run on an open MCP endpoint, so they also work in Claude, Cursor, VS Code
> and other AI clients.
>
> Sperax has been building since 2019, has raised $17M and is in a strategic partnership with
> Microsoft. Trading Desk is part of SperaxOS, our AI agent workspace.
>
> Try it in ChatGPT: https://chatgpt.com/plugins/plugin_asdk_app_6aea0b5be6608191a02eeebc810e235c
>
> #ChatGPT #MCP #AIagents #Crypto #Trading

## Reddit

Read each subreddit's self-promotion rules before posting. Post as a builder sharing a tool,
reply to comments, and leave the link in the body. Suggested subreddits: r/ChatGPT, r/OpenAI,
r/mcp, r/ClaudeAI, r/CryptoCurrency (use the weekly or tools thread if the rules require it),
r/algotrading (lead with the backtest).

**Title (r/ChatGPT, r/OpenAI):** I built a ChatGPT plugin that sizes, backtests and
sanity-checks crypto trades with live data (read-only, no sign-in)

**Title (r/mcp, r/ClaudeAI):** Public remote MCP server with 43 read-only crypto market tools,
no API key

**Body:**

> Sperax Trading Desk went live in the ChatGPT plugin directory this week. It gives the model
> tools that return real numbers instead of guesses:
>
> - **Positioning**: live perp funding, open interest and long/short ratios (OKX, Hyperliquid),
>   labelled crowded-long, crowded-short or neutral
> - **Trade plan**: position size from account risk, fees, liquidation versus stop,
>   R-multiples, expectancy, half-Kelly
> - **Backtests**: RSI, moving-average, MACD and Bollinger rules on daily candles, with fees and
>   slippage, against buy-and-hold
> - **Token scan**: honeypot, taxes, mint and owner powers, holder concentration, liquidity
> - **35 feeds**: ETF flows, liquidations, options, stablecoins, unlocks, yields and more
>
> All 43 tools are read-only. Nothing connects to an exchange or wallet, nothing signs, and
> there is no account.
>
> It's a plain MCP server, so it works outside ChatGPT too. In Claude Code:
>
> `claude mcp add --transport http sperax-trading-desk https://chat.sperax.io/webapi/mcp/trading-copilot`
>
> Setup for Cursor, VS Code, Windsurf, Gemini CLI and Codex, plus every tool's parameters:
> https://sperax-trading-desk.pages.dev/
>
> The package, validator and site generator are Apache-2.0:
> https://github.com/Sperax/chatgpt-plugin
>
> Feedback on which tools or feeds to add next is welcome.

## Hacker News

Submit the GitHub repository as a Show HN. Post the first comment yourself within a minute.

**Title:** Show HN: A read-only crypto trading desk for ChatGPT and any MCP client

**URL:** https://github.com/Sperax/chatgpt-plugin

**First comment:**

> We shipped this to the ChatGPT plugin directory on November 17. It's a remote MCP server
> (streamable HTTP, no auth) with 43 read-only tools. 8 do analysis: derivatives positioning,
> technical reads, trade sizing with a liquidation check, backtests, token safety scans, swap
> quote comparison, wallet reviews and crisis stress tests. The other 35 are thin wrappers
> over live market feeds.
>
> A few things that may interest people building on MCP:
>
> - The repository validates the plugin package against OpenAI's published limits, then diffs
>   the live `tools/list` against a lock file. Removing a tool or adding a required input
>   while an update is in review would break the definition ChatGPT is serving, so the build
>   fails on it.
> - The project site, the tool reference, `llms.txt` and an MCP server card are generated from
>   the live server on every push, so the docs can't drift from what the tools accept.
> - OpenAI's directory rules shaped the tools: no trade links, no transaction data and no
>   upstream error text in responses.
>
> The server itself lives in SperaxOS. This repository holds the plugin package, the
> tooling, the site and the launch video, which is rendered frame by frame from an HTML page
> with Playwright.
>
> Rate limit is 120 requests per minute per IP. Happy to answer questions.

## Product Hunt

| Field | Copy |
|---|---|
| Name | Sperax Trading Desk |
| Tagline (60 chars max) | Read-only crypto trade analysis for ChatGPT and MCP |
| Topics | Artificial Intelligence, Crypto, Fintech, Developer Tools |
| Links | ChatGPT listing, website, GitHub |
| Media | Social card first, then the video and screenshots of the tool reference |

**Description (260 chars max):**

> Ask ChatGPT about a trade and get real numbers: futures positioning, position size with a
> liquidation check, backtests, token scans and 35 live market feeds. Read-only, free, no
> sign-in. Also works in Claude, Cursor and VS Code over MCP.

**Maker comment:**

> Hi Product Hunt! We're Sperax. We've been building since 2019, have raised $17M and are in a
> strategic partnership with Microsoft.
>
> Trading Desk started from a simple frustration: AI answers about markets sound confident and
> cite nothing. So we gave ChatGPT tools that pull live data and do the arithmetic, including
> positioning, sizing, backtests and safety scans, and made all of them read-only so there is
> nothing to trust with your funds.
>
> Try asking: "Size a long on SOL at 150, stop 142, risking 1% of a $10,000 account."
>
> We'd love to hear which tool or feed you want next.

## MCP directories

List the server wherever MCP clients look for servers. Each takes the endpoint URL, the
repository or `server.json`.

| Directory | How to list |
|---|---|
| [Official MCP Registry](https://registry.modelcontextprotocol.io) | Install `mcp-publisher`, run `mcp-publisher login github` as the repository owner, then `mcp-publisher publish` from the repository root. It reads [`server.json`](../server.json). Bump `version` there for each new release. |
| [Glama](https://glama.ai/mcp/servers) | Add the server from the repository URL. [`glama.json`](../glama.json) claims maintainership. |
| [Smithery](https://smithery.ai) | Publish as a remote server with the endpoint URL. |
| [PulseMCP](https://www.pulsemcp.com/submit) | Submit the repository URL. It also picks up registry entries. |
| [mcp.so](https://mcp.so) | Submit through the site with the repository URL. |
| [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) | Open a pull request adding one line under Finance & Fintech, in the list's format: name, link, a remote-server marker and the one-line description. |

## After launch

- Upload `.github/social-preview.png` under the repository's Settings → General → Social
  preview, so links to the repository show the card.
- Pin the X thread and the LinkedIn post.
- Answer every comment in the first 24 hours. Add the questions people ask to the FAQ in
  [`scripts/site.mjs`](../scripts/site.mjs).
- Turn tool requests into issues with the
  [tool request template](https://github.com/Sperax/chatgpt-plugin/issues/new?template=tool_request.yml).
