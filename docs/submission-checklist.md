# ChatGPT plugin submission checklist

> **Historical record.** This document was written while preparing the first submission
> (plugin version 1.2.0, 2026-10-30). The version that passed review and is live in the
> ChatGPT plugin directory is 2.0.0; see the [runbook](./runbook.md) for the current state.

What the Sperax Trading Copilot plugin must satisfy to pass OpenAI review on
the first submission. Every rule cites OpenAI's own wording by page and line, so a rule
can be checked at the source. The status column records the package in
[sperax-trading-copilot/](../sperax-trading-copilot/) at plugin version 1.2.0, as of
2026-10-30, with later fixes marked done.

Citations point to OpenAI's plugin documentation. "Line N" refers to the Markdown
version of each page (append `.md` to the URL) as fetched on 2026-10-30; the live pages
may have moved since. "Guidelines" means the
[plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines). File names in backticks such as
`tradingCopilotMcp.ts`, `shell.ts` or `_shared/` refer to the MCP server source, which lives
in the private SperaxOS repository.

Status values:

- **Pass**: meets the rule today.
- **Fix**: a repo change is needed before upload.
- **Manual**: a portal, account or infrastructure step that no commit can do.
- **Decide**: needs a product or legal decision first.

The tool-by-tool parity work (what the old custom GPTs had and how each
operation maps to a reviewable tool) is in
[gpt-to-plugin-gap-analysis.md](./gpt-to-plugin-gap-analysis.md).

## Why plugins get rejected

OpenAI lists these as the common rejection causes in
[deploy/app-review](https://developers.openai.com/plugins/deploy/app-review) lines 163–183, and
three.ws hit several of them:

1. **The reviewer cannot connect.** The demo account needs extra setup, uses
   MFA, only works from your network, or its credentials have expired.
2. **Test cases fail.** The reviewer reruns every positive and negative case
   on ChatGPT web, mobile and Codex. A case that passes for you once is not
   enough. Responses must not include extra information or personal
   identifiers.
3. **The privacy policy misses data the tools return or collect.** Session,
   trace and request IDs, timestamps, internal account IDs and log data all
   count.
4. **Annotations are wrong.** `readOnlyHint` must be `false` if the tool writes
   anything, including logs or queued jobs. `destructiveHint` must be `true` if
   any mode of the tool is irreversible. `openWorldHint` must be `true` if the
   tool reaches the public internet.

Everything below is ordered so that these four fail first, locally, before a
reviewer sees them.

## Hard limits

### Listing fields (final submission)

From [deploy/submission-errors](https://developers.openai.com/plugins/deploy/submission-errors)
lines 30–41. Package validation at upload is looser (lines 230–287); the final
limits below are the ones that matter.

| Field | Final limit | Upload limit | Ours | Status |
|---|---|---|---|---|
| `name` | ≤64, `[A-Za-z0-9][A-Za-z0-9_-]*` | same | `sperax-trading-copilot` | Pass |
| `version` | semver, ≤64, must change on every upload (`plugin_version_unchanged`, line 113–120) | same | 1.2.0 | Fix: bump on every upload |
| `description` (package) | ≤1024 (`plugin_description_too_long`, line 181) | same | 123 | Pass |
| `interface.displayName` | ≤30, one line | ≤80 | 22 | Pass |
| `interface.shortDescription` | ≤30 | ≤240 | 27 | Pass, but rewrite (see Listing copy) |
| `interface.longDescription` | ≤4000 | same | 3520 | Fix: copy (see Listing copy) |
| `interface.developerName` | ≤80 | ≤120 | 6 | Pass |
| `interface.category` | supported list | same | Finance | Pass |
| `interface.capabilities` | ≤20 items, each ≤120, one line | same | 17 | Fix: copy (see Listing copy) |
| `interface.defaultPrompt` | ≤3, each ≤128, unique after normalization, no `@` mention | ≤512 each | 3 | Pass |
| `websiteURL`, `supportURL`, `privacyPolicyURL`, `termsOfServiceURL` | required for MCP plugins, HTTPS, ≤1024 | same | set | Fix: `websiteURL` 302s to `/signin` |
| `homepage` | ≤2048 | same | set | Pass |
| `brandColor` | ≥2:1 contrast on white | same | `#4F46E5` | Pass |
| `brandColorDark` | ≥2:1 contrast on `#212121` | same | `#A5B4FC` | Pass |

### Package archive

From [deploy/submission-errors](https://developers.openai.com/plugins/deploy/submission-errors):

- Archive ≤100 MB, ≤5000 entries, no backslashes, no duplicate paths
  (line 131 onward).
- A supported manifest must exist: root `plugin.json` with a supported Agent
  Plugins schema, or `.codex-plugin/`, `.agent-plugin/` or `.claude-plugin/`
  `plugin.json` (`plugin_manifest_missing`, line 159), plus at least one valid
  skill (`archive_plugin_files_missing`, line 151).
- At least one valid skill (`plugin_runtime_surface_missing`, line 309).
- Each skill is a `SKILL.md` with frontmatter `name` and `description`, each
  ≤1024. The identity `plugin:skill` is ≤64 and must be unique
  (`skill_identity_too_long`, `skill_identity_duplicate`, lines 333–355).
- Asset paths start with `./`. `logo` and `composerIcon` are required and
  square. An SVG needs a numeric `viewBox` (lines 409–435).
- ZIP warnings (lines 113–120) that silently change what you uploaded:
  `plugin_name_mismatch`, `plugin_version_unchanged`,
  `mcp_configuration_excluded`, `app_configuration_excluded`,
  `screenshot_configuration_excluded`, `claude_format_normalized`,
  `manifest_normalized`, `developer_name_defaulted`. Treat every warning as an
  error: re-upload until the upload shows none.

### Final submission requirements

From [deploy/submission-errors](https://developers.openai.com/plugins/deploy/submission-errors)
lines 43–64 and the field reference in
[deploy/submission](https://developers.openai.com/plugins/deploy/submission) lines 632–654:

| Requirement | Error code | Status |
|---|---|---|
| Skill scans complete (up to 2 hours after upload) | `scan_required` | Manual |
| Verified organization identity and attestations | — | Manual |
| `demo_recording_url`: a video of the main use cases on each platform | `submission_*_required` | Fix + Manual (record, then add the URL) |
| Exactly 5 positive and 3 negative test cases, each with `description`, `prompt`, `tools_triggered`, `expected_behavior` | `submission_*_required` | Fix: negative case 2 must change (see Test cases) |
| `release_notes` | `submission_*_required` | Fix: current notes describe link tools |
| Production HTTPS MCP URL | — | Pass |
| Domain verification at `/.well-known/openai-apps-challenge` | `domain_verification_required` | Served: the portal token is set in the production environment since 2026-11-03 and the route returns it as plain text. Verify in the portal |
| Fresh tool scan after the last server change | `scan_required` | Manual |
| Explicit annotation values on every tool | `annotations_required` | Pass for the 13 current tools |
| A justification for every annotation | `justification_required` | Fix (see Conflicts) |
| Reviewer credentials for OAuth tools | — | Not needed until account tools ship; then Manual |
| `frame_domain_explanation` if the UI frames other domains | `frame_domain_explanation_required` | Not applicable: the three widgets embed no iframes and `frameDomains` is unset |
| Screenshots only with custom UI; if uploaded, one PNG or JPEG per starter prompt, exactly 706 px wide, 400–860 px tall | `screenshots_not_allowed`, `screenshot_*` | Optional: the server has custom UI. If uploaded, exactly 3 (one per default prompt) |
| CSP declared on every UI resource | — | Pass: `openai/widgetCSP` and `ui.csp` with empty `connect_domains` and `resource_domains` (`tradingCopilotMcp.ts` lines 1177–1185) |

## Where OpenAI's pages disagree

Follow the stricter reading in every case.

| Topic | One page says | Another says | What we do |
|---|---|---|---|
| Annotation justifications | "Annotation justifications are no longer required" ([plugin-guidelines](https://developers.openai.com/plugins/plugin-guidelines) line 219) | `justification_required` blocks final submission ([deploy/submission-errors](https://developers.openai.com/plugins/deploy/submission-errors) lines 95–100); justifications explain annotations but do not override them ([deploy/app-review](https://developers.openai.com/plugins/deploy/app-review) line 117) | Write one for every tool, from the table in the gap analysis |
| Changing the MCP URL | Contact support ([deploy/submission](https://developers.openai.com/plugins/deploy/submission) line 206) | The path can change in a new version; the origin cannot ([deploy/app-review](https://developers.openai.com/plugins/deploy/app-review) lines 263, 277–279) | Treat `https://chat.sperax.io` as permanent and avoid changing the path |
| Number of MCP servers | Test cases per server "for multiple servers" ([deploy/submission](https://developers.openai.com/plugins/deploy/submission) line 654) | One MCP server per plugin ([deploy/submission](https://developers.openai.com/plugins/deploy/submission) line 69) | One server; every tool lives on `/webapi/mcp/trading-copilot` |
| Annotation appeals | Appeal an automated annotation flag ([plugin-guidelines](https://developers.openai.com/plugins/plugin-guidelines) line 219) | Appeal by replying to the review email; no expedite requests ([deploy/app-review](https://developers.openai.com/plugins/deploy/app-review) lines 141–161) | Get annotations right before submitting; an appeal costs a review cycle |

## The checklist

Work top to bottom. Each item names its rule, where it lives in the repo and
how to verify it.

### 1. Platform and account prerequisites

- [ ] **Manual.** The OpenAI organization is verified and the person submitting
  has the right role ([deploy/submission](https://developers.openai.com/plugins/deploy/submission)).
- [ ] **Manual.** The project is not EU data residency. EU-residency projects
  cannot submit ([deploy/app-review](https://developers.openai.com/plugins/deploy/app-review)
  line 125). Create a global project if needed.
- [ ] **Manual.** Nothing else is in review. Only one published version and one
  version in review can exist at a time; Cancel Review before changing a
  pending one (lines 141–150).

### 2. Origin and transport

- [ ] **Pass.** The MCP server is remote, public HTTPS and streamable HTTP:
  `https://chat.sperax.io/webapi/mcp/trading-copilot`
  ([deploy/app-review](https://developers.openai.com/plugins/deploy/app-review) lines 72–76).
- [ ] **Pass.** One universal URL, not a template URL. Template URLs are for
  trusted developers only (lines 78–99).
- [ ] **Decide once, never again.** The origin `https://chat.sperax.io` is
  permanent for this plugin. Changing it means a new plugin and a new review
  (lines 263, 277–279).
- [ ] **Pass.** One MCP server only. It cannot be split later, and an MCP server
  cannot be added to a skills-only plugin after the fact
  ([deploy/submission](https://developers.openai.com/plugins/deploy/submission) lines 33, 69).
- [ ] **Fix.** Prod runs ab2ba7bed5 or later. Check
  `curl -s https://chat.sperax.io/api/version` before scanning tools; the scan
  imports whatever is live.

### 3. Domain verification

- [x] **Served.** The portal token is in `OPENAI_APPS_CHALLENGE_TOKEN` in the
  production environment (set 2026-11-03, app container recreated), and
  `curl -s https://chat.sperax.io/.well-known/openai-apps-challenge` returns
  exactly the token ([deploy/submission](https://developers.openai.com/plugins/deploy/submission)
  line 155). Changing the env value needs only a container recreate, not a
  redeploy.
- [ ] **Manual.** Select verify in the portal's MCPs page, leaving Challenge
  Base URL blank, then Connect and Rescan.

### 4. Policy scope: what the plugin may do

The plugin is a crypto analysis tool, so the finance rules decide its scope.

- [x] **Fixed.** No execution of money transfers, crypto transfers or investment
  trades ([plugin-guidelines](https://developers.openai.com/plugins/plugin-guidelines) line 159),
  no unregulated financial services (line 156), no speculative or deceptive
  crypto offerings (line 158), no gambling or crypto-casino content
  (lines 123–124). The four link tools (`create_swap_link`,
  `create_perp_link`, `create_order_link`, `create_sperax_action_link`) build
  prefilled trade, leverage, mint, stake and farm links. They do not sign
  anything, but a reviewer can read a prefilled perp or mint link as
  facilitating a trade. Ship v1 analysis-only: keep these four off the plugin
  server and remove link wording from the instructions, capabilities, long
  description and release notes. Re-add them in a later version, one per
  update, once v1 is live (see the gap analysis).
  Done: the plugin profile omits the four link tools from `tools/list` and
  answers a call to them with -32602 (`TRADING_COPILOT_PLUGIN_TOOLS`). The
  instructions, capabilities, long description and release notes carry no link
  wording, and `REVIEW_FORBIDDEN` in `scripts/build.mjs` fails
  the build if any returns.
- [x] **Fixed.** No prediction markets. They read as gambling under
  lines 123–124. Remove prediction wording from the server instructions
  (`tradingCopilotMcp.ts` line 63) and from the `get_sidebar_feed` description
  (line 548), and exclude prediction feeds.
  Done: `TRADING_COPILOT_PLUGIN_INSTRUCTIONS` and `PLUGIN_DESCRIPTIONS` drop
  the wording, and `PLUGIN_BLOCKED_FEEDS` excludes `predictions`. The build
  gate rejects "prediction", "polymarket" and "kalshi".
- [ ] **Pass.** No commerce: digital goods, tokens and credits cannot be sold
  (line 98). `commerce: false` is set.
- [x] **Fixed.** Never surface credits, plans or upgrade prompts (lines 100–112).
  A tool may say a feature needs a different entitlement and link an
  informational page, but may not start a checkout (lines 102–107). The REST
  spec mentions "2 credits"; the MCP server must not.
  Done: the MCP server has no credit, plan or upgrade wording; the build gate
  rejects "credit", "upgrade" and "subscribe".
- [ ] **Pass.** No ads (line 176). No worse version than the website (line 114).
- [ ] **Pass.** Acts only within the task the user asked for (line 64); does not
  manipulate other plugins (line 68).
- [x] **Fixed.** No scraping or relaying of third-party content without
  authorization and ToS compliance (line 72). Do not port the GPT
  `news/article` arbitrary-URL fetcher.
  Done: the plugin has no URL fetcher, and `PLUGIN_BLOCKED_FEEDS` excludes the
  social relay feeds `ct-pulse`, `kol-leaderboard` and `tech-pulse`.

### 5. Audience and legal pages

- [ ] **Decide.** The guidelines say plugins must suit general audiences
  including ages 13–17; 18+ plugins are not supported yet
  ([plugin-guidelines](https://developers.openai.com/plugins/plugin-guidelines) line 58). Our
  terms say users must be at least 18
  ([chat.sperax.io terms](https://chat.sperax.io/terms)). Either
  confirm with legal that an analysis-only plugin may be offered to 13–17
  users under a plugin-specific clause, or accept that review may reject the
  plugin on this point. This is the one blocker that code cannot clear.
- [x] **Fixed.** Add a ChatGPT plugin section to the privacy policy
  ([chat.sperax.io privacy policy](https://chat.sperax.io/privacy)) that discloses everything the server collects
  ([plugin-guidelines](https://developers.openai.com/plugins/plugin-guidelines) line 94;
  [deploy/app-review](https://developers.openai.com/plugins/deploy/app-review) lines 163–183):
  - the caller IP, used only for rate limiting (`mcp:trading-copilot:<ip>`,
    60 calls per 60 s, not stored beyond the window);
  - aggregate hourly telemetry per tool (operation name, error flag, latency;
    8-day TTL; no arguments, no IPs);
  - wallet addresses and token contracts the user pastes, sent to the named
    data providers to answer the query and not stored;
  - for OAuth account tools (once shipped): which account data each tool reads
    and writes, and how to revoke access.
  Done: "Sperax Trading Copilot in ChatGPT" in `PrivacyContent.tsx` covers
  arguments, providers, Redis caching, rate limiting and telemetry; effective
  date October 31, 2026. The OAuth bullet waits for v4.
- [x] **Fixed.** `websiteURL` must open a public page. `https://chat.sperax.io`
  redirects to `/signin`. Point it at `https://sperax.io` or a public plugin
  landing page.
  Done: `websiteURL` is `https://sperax.io`.

### 6. Listing copy

- [x] **Pass.** No generic name; no "MCP", "MCP Server" or "Plugin" in the name
  ([plugin-guidelines](https://developers.openai.com/plugins/plugin-guidelines) line 45).
  "Sperax Trading Copilot" passes.
- [x] **Fixed.** No comparisons with other products, no unverifiable claims
  ("best", "most accurate"), no pricing, subscriptions, trials or credits
  (line 46). Rewrite `longDescription` and `capabilities` against this rule
  and against the analysis-only scope from section 4.
  Done: rewritten for analysis only; the build gate rejects "best",
  "recommend" and "guarantee".
- [x] **Fixed.** Every capability and starter prompt must be something the live
  tools actually do. A capability that names a removed tool fails test
  review.
  Done: the 9 capabilities are short labels, one per plugin tool (approved
  listings that set capabilities use 6 to 11 labels of about 15 characters,
  such as "Backtesting" or "Market data"), and the three
  default prompts call `get_derivatives_positioning`, `build_trade_plan` and
  `backtest_signal_strategy`.
- [x] **Fixed.** `release_notes` describe the version being submitted. The current
  notes describe perp, order and Sperax action links.
  Done: the 2.0.0 notes describe the analysis-only release.
- [x] **Fixed.** Remove `repository` from `plugin.json`. It pointed at the private
  SperaxOS repository, which a reviewer cannot open.
  Done.
- [ ] **Decide.** `countries`: `[]` means unrestricted; omitting the field keeps
  the current portal setting
  ([deploy/submission](https://developers.openai.com/plugins/deploy/submission) lines 632–654).
  Exclude any jurisdiction where legal advises against crypto analysis
  tools.
- [ ] **Decide.** Screenshots are optional. They are allowed because the
  server returns custom UI (three widgets), but if any are uploaded there must
  be exactly one per default prompt (3), each a PNG or JPEG exactly 706 px wide
  and 400–860 px tall
  ([deploy/submission-errors](https://developers.openai.com/plugins/deploy/submission-errors)
  lines 60–64, [deploy/submission](https://developers.openai.com/plugins/deploy/submission)
  lines 613–619). Each must show the widget that its prompt produces. A
  mismatch is a rejection risk; skipping them is not.
  The three default prompts render no widget, so skip screenshots for v1.

### 7. Tools

Rules from [plugin-guidelines](https://developers.openai.com/plugins/plugin-guidelines)
lines 200–252 and
[deploy/app-review](https://developers.openai.com/plugins/deploy/app-review) lines 113–117:

- [ ] **Pass.** Each tool name is a unique verb phrase and not promotional
  (lines 200–202).
- [x] **Fixed.** Each description states purpose, when to use it, limitations and
  side effects, and matches the schema and real behavior (line 207). Re-read
  every description after the scope cut; `get_sidebar_feed` still mentions
  catalog mode and predictions.
  Done: `PLUGIN_DESCRIPTIONS` replaces the `backtest_signal_strategy` text in
  the plugin profile, and each market-data tool in `PLUGIN_FEED_TOOLS` has its
  own description in place of the `get_sidebar_feed` text.
- [ ] **Pass.** Tools are independent (line 213).
- [ ] **Pass for MCP / Fix for parity.** No generic executor, operation
  selector or schema discovery (line 215). The GPT's `/gpt/tools` and
  `/gpt/tools/call` executor cannot be ported as-is; each operation must
  become its own tool.
- [x] **Fixed.** Portal finding on `get_sidebar_feed`: "This tool appears to
  execute operations that are not individually exposed. Please expose each
  model-callable operation upfront as a separate tool with a clear
  description, input schema, and annotations." A `feed` argument that picks
  one of 35 data sets is an operation selector.
  Done: the plugin profile drops `get_sidebar_feed` and lists one tool per
  allowed feed (`PLUGIN_FEED_TOOLS` in the server's `pluginFeedTools.ts`), each
  with its own description, closed input schema, output schema and
  annotations. A test fails when a feed has neither a tool nor a block entry.
- [ ] **Pass.** Explicit boolean `readOnlyHint`, `destructiveHint` and
  `openWorldHint` on every tool (line 219), with values matching the
  definitions (lines 221–223). `analyze_coin` over MCP does not record a
  verdict, so `readOnlyHint: true` holds; keep it that way.
- [ ] **Manual.** A justification for each annotation, entered in the portal (see
  Conflicts). The text for each tool is in the gap analysis.
- [ ] **Pass.** Minimal inputs; no conversation history or free-form context
  fields (lines 229–233).
- [ ] **Pass.** No hidden side effects; read tools are safe to retry
  (lines 240–241).
- [x] **Fixed.** Response minimization (line 249): return only data relevant to
  the request. No diagnostics, telemetry, internal IDs or timestamps unless
  the user needs them. Remove from MCP responses: `sourceErrors`
  (`tradingCopilotMcp.ts` lines 296–303), `quotedAt` (517, 649), `checkedAt`
  (593), `reviewedAt` (734), `generatedAt` (777, 792). Keep the REST responses
  unchanged; strip at the MCP layer.
  Done: `minimizeForPlugin` strips these fields from plugin responses only.
- [ ] **Pass.** No raw location (line 251); no chat-log reconstruction
  (line 252).
- [x] **Fixed.** Refresh the lock after every tool change:
  `npm run update-lock`, then commit
  `tool-metadata.lock.json`. Without `--update-lock` the
  builder fails when live metadata drifts from the lock, which is the point.
  Done: the lock pins the 43 plugin tools.

### 7a. Widgets (custom UI)

The plugin profile returns three widgets
(`_shared/widgets/`): `price-chart`
(`analyze_coin`), `quote-comparison` (`compare_swap_quotes`,
`ui://widget/quote-comparison.html`, no buttons or links) and `portfolio`
(`review_wallet`, `stress_test_portfolio`). The GPT-only `swap-quote` widget
stays on the full profile. The review checks
them against [concepts/ui-guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines)
and [plugin-guidelines](https://developers.openai.com/plugins/plugin-guidelines) lines 263–277.

- [ ] **Pass.** CSP is declared and empty: the widgets make no network
  requests and load no remote resources
  ([deploy/app-review](https://developers.openai.com/plugins/deploy/app-review) lines 72–76).
  Any later `fetch` or remote image needs its domain added to
  `connect_domains` or `resource_domains` first.
- [ ] **Pass.** No iframes inside the widgets, so no `frameDomains` and no
  frame justification (guidelines lines 263–269).
- [ ] **Pass.** No logo in the widget; ChatGPT adds the logo and name
  (ui-guidelines line 234).
- [ ] **Pass.** System font stack only, no custom fonts (ui-guidelines
  line 210; `shell.ts` line 20).
- [ ] **Pass.** Brand color only on accents and buttons; backgrounds and text
  use neutral light and dark palettes (ui-guidelines lines 177–190;
  `shell.ts` lines 17–18).
- [x] **Fixed.** WCAG AA contrast (4.5:1 for body text) for every text token on
  `--bg`, `--card` and the tinted badge backgrounds, in both themes
  (ui-guidelines line 246). Done: the light theme's `--accent`, `--good` and
  `--warn` were darkened to `#2860e0`, `#0b7a45` and `#975a00` (`shell.ts`
  line 17); the lowest light-theme ratio is now 4.57 (`--bad` on `--bad-bg`),
  and every dark-theme pair was already at 5.88 or higher.
- [x] **Fixed.** At most two actions per inline card, one primary and one
  secondary (ui-guidelines line 79). `swapQuoteWidget.ts` now renders at most
  one primary and one secondary button.
- [x] **Fixed.** The widget bridge in `shell.ts` posts to the host origin
  (`location.ancestorOrigins`, the referrer, or the parent's first message),
  not `'*'`. It falls back to `'*'` only for an opaque parent origin.
- [x] **Fixed.** In v1, `compare_swap_quotes` itself returns prefilled swap links
  (`links`, `tradingCopilotMcp.ts` line 648) that the widget turns into
  "Open swap in …" buttons. That is the same trade-link exposure as
  `create_swap_link` (section 4). Drop `links` from the MCP response and its
  output schema, and the widget then shows quotes only. With
  `create_swap_link` removed, the swap-quote widget serves
  `compare_swap_quotes` alone. A changed output shape for a published widget
  ships under a new `-v2` URI (`widgets/index.ts`).
  Done: the plugin profile drops `links` and `execution` from
  `compare_swap_quotes`, and serves it with the button-free
  `ui://widget/quote-comparison.html` (a new URI, per the rule above).
- [ ] **Manual.** Every widget renders and works on ChatGPT web, ChatGPT
  mobile (iOS and Android) and in light and dark themes (guidelines
  line 277). `shell.ts` has a 420 px breakpoint; check that no card scrolls
  internally.

### 8. Server instructions

- [x] **Fixed.** The scan imports the server `instructions` along with names,
  titles, descriptions, schemas, `securitySchemes`, `_meta`, annotations and
  UI/CSP ([deploy/app-review](https://developers.openai.com/plugins/deploy/app-review)
  lines 113–117). Instructions must not mention tools that are not exposed,
  predictions, catalogs or trade links. Keep the line that says the plugin
  cannot place orders and is not financial advice
  (`tradingCopilotMcp.ts` line 68).
  Done: `TRADING_COPILOT_PLUGIN_INSTRUCTIONS` names only plugin tools and
  keeps the no-orders, not-financial-advice line.
- [x] **Fixed.** Portal finding "These server instructions need further
  review." The instructions read as a general routing prompt over a tool
  catalog. Done: each sentence now scopes one request type (positioning,
  analysis, sizing, backtests, token safety, quotes, wallets, stress tests,
  market data) to the tools that serve it, and none mentions a tool the
  profile does not list. Run **Rescan** in the portal after the deploy.

### 9. Skills

- [ ] **Pass.** At least one skill (`skills/setup/SKILL.md`).
- [x] **Fixed.** Add workflow skills that teach the model how to chain tools
  (for example "pre-trade check": `scan_token` → `get_derivatives_positioning`
  → `build_trade_plan`). Skills are scanned
  ([plugin-guidelines](https://developers.openai.com/plugins/plugin-guidelines) line 285), so they
  follow the same policy scope as the tools. Keep each `plugin:skill` identity
  ≤64 characters.
  Done: `pre-trade-check`, `backtest-translation` and `stress-test`.

### 10. Authentication

The 13 current tools need no auth. Account tools (watchlist, alerts, portfolio)
do, and they are part of GPT parity. Ship them only when every item here
passes; until then they stay out of v1.

From [build/auth](https://developers.openai.com/plugins/build/auth):

- [ ] Protected resource metadata at `/.well-known/oauth-protected-resource`,
  or a `WWW-Authenticate` header with `resource_metadata` (lines 46, 68).
  **Returns 404 today.**
- [ ] Authorization server metadata with `client_id_metadata_document_supported`,
  `token_endpoint_auth_methods_supported: ["none", "private_key_jwt"]`, a
  `registration_endpoint` if DCR is offered, and S256 PKCE (lines 89–107).
  **Returns 404 today.**
- [ ] Accept ChatGPT's CIMD client ID `https://chatgpt.com/oauth/client.json`
  (line 203) and its redirect URIs (lines 176, 179).
- [ ] PKCE S256 required, not optional (lines 187–193). Ours is optional today.
- [ ] Tokens carry `aud` for the MCP resource; the server checks issuer,
  audience, expiry and scopes on every request, and returns 401 with
  `WWW-Authenticate` on failure (lines 187–193, 217, 308–317).
- [ ] Per-tool `securitySchemes`: `noauth` on the analysis tools, `oauth2` on
  account tools, so the plugin stays usable signed out (lines 567–575).
- [ ] Minimal scopes; the consent screen says what each scope allows
  ([plugin-guidelines](https://developers.openai.com/plugins/plugin-guidelines) line 257).
- [ ] **Manual.** A reviewer demo account: username and password, pre-loaded
  sample data (a watched wallet, two alerts, a small portfolio), no sign-up,
  no MFA, no email or SMS codes, no magic links, reachable from outside our
  network, credentials that do not expire during review
  ([deploy/submission](https://developers.openai.com/plugins/deploy/submission) lines 163–171;
  [plugin-guidelines](https://developers.openai.com/plugins/plugin-guidelines) line 281).
  Enter them under **Review details** in the portal.

### 11. Test cases

Exactly 5 positive and 3 negative cases
([deploy/submission](https://developers.openai.com/plugins/deploy/submission) line 654). Each case
is rerun by the reviewer on ChatGPT and Codex
([deploy/app-review](https://developers.openai.com/plugins/deploy/app-review) lines 163–183).

- [x] **Pass.** Five positive cases, each naming the tools it should trigger.
- [x] **Fixed.** Negative case 2, "Buy 0.5 ETH for me on Coinbase right now.",
  invites the reviewer to check trade execution, the most sensitive area for a
  crypto plugin. Replace it with an out-of-scope request that has an obvious
  refusal, for example "Book me a flight from Lisbon to Berlin next Friday."
  Done: N2 is now the Lisbon to Berlin flight.
- [x] **Fixed.** Each positive case must pass against the live server on the
  day of submission. Prompts must not depend on live values a reviewer cannot
  reproduce, and expected behavior must describe structure ("returns funding
  rate, open interest and a crowding read"), not numbers.
  Done for wording: live-data cases describe structure; sizing cases use
  numbers that follow from the prompt. The live run is the manual item below.
- [ ] **Manual.** Run all 8 on ChatGPT web, ChatGPT mobile and Codex
  ([plugin-guidelines](https://developers.openai.com/plugins/plugin-guidelines) line 277), plus
  `npm run check` against prod.

### 12. Demo video

- [ ] **Manual.** Record each of the 5 positive cases end to end, on desktop
  and mobile, against prod. Host it at a stable public URL and set
  `review.demo_recording_url`.

### 13. Submit

- [x] Bump `version` (semver) in `plugin.json`.
- [x] `npm run build` passes with no drift.
- [ ] Upload. Resolve every warning and re-upload until none remain.
- [ ] Wait for skill scans (up to 2 hours) and run **Scan Tools** after the
  last deploy.
- [ ] Enter justifications, review details and countries in the portal.
- [ ] Submit. Do not ask for an expedite
  ([deploy/app-review](https://developers.openai.com/plugins/deploy/app-review) line 161).

## After approval: continuous review

Published metadata is versioned and reviewed continuously
([deploy/app-review](https://developers.openai.com/plugins/deploy/app-review) lines 221–263):

- Deleting a tool removes it from the plugin right away.
- A new tool appears only after it passes automated checks.
- A changed tool keeps its old definition until the change passes. The server
  must keep serving the live definition's inputs and outputs until then, so
  change tools additively.
- Security schemes, `_meta`, CSP and server instructions go out through the
  same checks as tool changes.
- To change a version in review, cancel the review first. To appeal, reply to
  the review email (lines 141–161).
- Replacing or removing the published version, maintenance mode and removal
  follow lines 294–309.

Add one new tool group per update, with its own test cases, rather than
several at once, so that one rejected tool does not hold back the rest.
