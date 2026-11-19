#!/usr/bin/env node
/**
 * Builds the GitHub Pages site into _site/.
 *
 * Every tool name, title, description and parameter comes from the live MCP endpoint, so the
 * site cannot drift from what ChatGPT serves. Listing copy comes from plugin.json, skills from
 * their SKILL.md frontmatter.
 *
 *   node scripts/site.mjs                    # write _site/
 *   node scripts/site.mjs --social-preview   # also write .github/social-preview.png
 *
 * Env: SITE_URL (default https://nirholas.github.io/chatgpt-plugin/), MCP_URL (fetch tools
 * from a staging server; pages still show the production URL).
 */
import { chromium } from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import { fetchLiveMetadata } from './lib/mcp.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '_site');
const PKG = path.join(ROOT, 'sperax-trading-copilot');
const SITE_URL = new URL(process.env.SITE_URL ?? 'https://nirholas.github.io/chatgpt-plugin/').href;
const REPO_URL = 'https://github.com/nirholas/chatgpt-plugin';
const STORE_URL = 'https://chatgpt.com/plugins/plugin_asdk_app_6aea0b5be6608191a02eeebc810e235c';
const VIDEO_FILE = 'sperax-trading-desk-chatgpt.mp4';
const VIDEO_SECONDS = 43;
const LAUNCH_DATE = '2026-11-17';
const SERVER_KEY = 'sperax-trading-desk';
const SOCIALS = {
  github: 'https://github.com/Sperax',
  telegram: 'https://t.me/SperaxUSD',
  website: 'https://www.sperax.io',
  x: 'https://x.com/SperaxUSD',
};
const X_HANDLE = '@SperaxUSD';
const SECURITY_CONTACT = 'security@sperax.io';

// Analysis tools are not distinguishable from feeds by name or _meta, so the set is explicit.
const ANALYSIS = new Set([
  'analyze_coin',
  'backtest_signal_strategy',
  'build_trade_plan',
  'compare_swap_quotes',
  'get_derivatives_positioning',
  'review_wallet',
  'scan_token',
  'stress_test_portfolio',
]);

// Extra prompts shown after the manifest's default prompts, each answered by the listed tools.
const EXTRA_PROMPTS = [
  { q: 'Scan PEPE for honeypot risk, taxes and holder concentration.', tools: ['scan_token'] },
  { q: 'Stress test 2 BTC, 20 ETH and 500 SOL through FTX and LUNA.', tools: ['stress_test_portfolio'] },
];
const DEFAULT_PROMPT_TOOLS = [
  ['get_derivatives_positioning'],
  ['analyze_coin', 'build_trade_plan'],
  ['backtest_signal_strategy'],
];

const WILL_NOT = [
  ['No trade execution and no trade links.', 'Swap, perp, order and action link builders are not exposed. Quote comparisons carry no DEX links or transaction data.'],
  ['No account access.', 'It never connects to an exchange account, never asks for keys or seed phrases and needs no sign-in.'],
  ['No custody and no signing.', 'It cannot hold funds, build transactions or sign anything.'],
  ['No prediction markets or social feeds.', 'Prediction markets, third-party social posts and internal service status are not exposed. Upstream errors and internal timestamps are removed from responses.'],
  ['No financial advice.', 'Results are educational analysis. Market data is public and can be delayed. Backtests use daily candles, and past performance does not predict future results.'],
];

const args = new Set(process.argv.slice(2));
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

// ---------------------------------------------------------------------------------------------
// Inputs

const plugin = readJson(path.join(PKG, 'plugin.json'));
const iface = plugin.extensions['com.openai'].interface;
const mcpConfig = readJson(path.join(PKG, 'mcp.json'));
const MCP_URL = mcpConfig.mcpServers['sperax-trading-copilot'].url;
const serverJson = readJson(path.join(ROOT, 'server.json'));

if (serverJson.version !== plugin.version) {
  throw new Error(`server.json version ${serverJson.version} does not match plugin.json ${plugin.version}`);
}
if (serverJson.remotes?.[0]?.url !== MCP_URL) {
  throw new Error(`server.json remote ${serverJson.remotes?.[0]?.url} does not match mcp.json ${MCP_URL}`);
}
if (serverJson.description.length > 100) {
  throw new Error(`server.json description is ${serverJson.description.length} characters; the registry allows 100`);
}

const skills = readdirSync(path.join(PKG, 'skills'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => {
    const source = readFileSync(path.join(PKG, 'skills', d.name, 'SKILL.md'), 'utf8');
    const frontmatter = source.match(/^---\n([\S\s]*?)\n---\n/)?.[1];
    if (!frontmatter) throw new Error(`skills/${d.name}/SKILL.md has no frontmatter`);
    const field = (key) => frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1].trim();
    return { description: field('description'), name: field('name') ?? d.name };
  });

const live = await fetchLiveMetadata(process.env.MCP_URL ?? MCP_URL, 'sperax-site-build');
const tools = live.tools;
const analysis = tools.filter((t) => ANALYSIS.has(t.name));
const feeds = tools.filter((t) => !ANALYSIS.has(t.name));
const toolByName = new Map(tools.map((t) => [t.name, t]));

const missing = [...ANALYSIS].filter((name) => !toolByName.has(name));
if (missing.length) throw new Error(`Live server is missing analysis tools: ${missing.join(', ')}`);
for (const p of [...DEFAULT_PROMPT_TOOLS.flat(), ...EXTRA_PROMPTS.flatMap((p) => p.tools)]) {
  if (!toolByName.has(p)) throw new Error(`Prompt references unknown tool ${p}`);
}

const BUILD_DATE = new Date().toISOString().slice(0, 10);
const YEAR = BUILD_DATE.slice(0, 4);

// ---------------------------------------------------------------------------------------------
// Helpers

const esc = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
const url = (rel = '') => new URL(rel, SITE_URL).href;
const ldScript = (data) =>
  `<script type="application/ld+json">${JSON.stringify(data).replaceAll('<', '\\u003c')}</script>`;
const sentences = (text) => text.split(/(?<=[.!?])\s+(?=[A-Z])/);
const paragraphs = (text) => text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);

/** One-sentence summary of a tool. Sentence 0 is always "Use this when…", sentence 1 says what it returns. */
const blurb = (tool) => {
  const [when, what] = sentences(tool.description);
  if (what && !/^\w+ (those|these|them|it)\b/i.test(what)) return what;
  return when.replace(/^Use this when the user (asks about|asks for|wants|needs) /, 'Covers ');
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const leadParagraph = paragraphs(iface.longDescription)[0];
const META_DESCRIPTION = `Free, read-only crypto analysis for ChatGPT and any MCP client: futures positioning, trade sizing with a liquidation check, backtests, token safety scans and ${feeds.length} live market feeds. No sign-in.`;
const TITLE = 'Sperax Trading Desk: crypto trade analysis for ChatGPT and MCP';

const encodeBase64 = (value) => Buffer.from(value).toString('base64');
const CURSOR_URL = `https://cursor.com/install-mcp?name=${SERVER_KEY}&config=${encodeBase64(JSON.stringify({ url: MCP_URL }))}`;
const VSCODE_URL = `https://insiders.vscode.dev/redirect/mcp/install?name=${SERVER_KEY}&config=${encodeURIComponent(JSON.stringify({ type: 'http', url: MCP_URL }))}`;

const json = (value) => JSON.stringify(value, null, 2);
const INSTALL = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    note: 'Open the listing in the ChatGPT plugin directory and add it. No sign-in or API key.',
    actions: [{ href: STORE_URL, label: 'Add to ChatGPT', primary: true }],
  },
  {
    code: `claude mcp add --transport http ${SERVER_KEY} ${MCP_URL}`,
    id: 'claude-code',
    name: 'Claude Code',
    note: 'Run once in a terminal.',
  },
  {
    code: json({ mcpServers: { [SERVER_KEY]: { command: 'npx', args: ['-y', 'mcp-remote', MCP_URL] } } }),
    id: 'claude-desktop',
    name: 'Claude Desktop',
    note: 'Add a custom connector with the endpoint URL in Settings → Connectors, or put this in claude_desktop_config.json.',
  },
  {
    actions: [{ href: CURSOR_URL, label: 'Add to Cursor' }],
    code: json({ mcpServers: { [SERVER_KEY]: { url: MCP_URL } } }),
    id: 'cursor',
    name: 'Cursor',
    note: 'One click, or add to ~/.cursor/mcp.json.',
  },
  {
    actions: [{ href: VSCODE_URL, label: 'Add to VS Code' }],
    code: json({ servers: { [SERVER_KEY]: { type: 'http', url: MCP_URL } } }),
    id: 'vscode',
    name: 'VS Code',
    note: 'One click, or add to .vscode/mcp.json.',
  },
  {
    code: json({ mcpServers: { [SERVER_KEY]: { serverUrl: MCP_URL } } }),
    id: 'windsurf',
    name: 'Windsurf',
    note: 'Add to ~/.codeium/windsurf/mcp_config.json.',
  },
  {
    code: json({ mcpServers: { [SERVER_KEY]: { httpUrl: MCP_URL } } }),
    id: 'gemini-cli',
    name: 'Gemini CLI',
    note: 'Add to ~/.gemini/settings.json.',
  },
  {
    code: `[mcp_servers.${SERVER_KEY}]\nurl = "${MCP_URL}"`,
    id: 'codex',
    name: 'Codex CLI',
    note: 'Add to ~/.codex/config.toml.',
  },
  {
    code: `curl -s ${MCP_URL} \\\n  -H 'content-type: application/json' \\\n  -H 'accept: application/json, text/event-stream' \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_fear_greed_index","arguments":{}}}'`,
    id: 'curl',
    name: 'Raw JSON-RPC',
    note: 'Streamable HTTP, no auth. 120 requests per minute per IP.',
  },
];

const FAQ = [
  ['What is Sperax Trading Desk?', `${leadParagraph} It is live in the ChatGPT plugin directory and works in any MCP client.`],
  ['Can it place trades or move my funds?', 'No. Every tool is read-only. It does not connect to exchange accounts, place orders, build transactions or sign anything, and it never asks for keys or seed phrases.'],
  ['Do I need an account or an API key?', 'No. The plugin and the MCP endpoint need no sign-in. Each IP may send 120 requests per minute.'],
  ['What does it cost?', 'Nothing. The plugin and the endpoint are free to use.'],
  ['Where does the data come from?', 'Public market sources, including OKX and Hyperliquid for derivatives, CoinGecko for prices, LI.FI, KyberSwap and Jupiter for swap quotes, Yahoo Finance and Finnhub for traditional markets, and on-chain data for token scans and wallet reviews. Responses are cached for 60 seconds to 15 minutes.'],
  ['Can I use it outside ChatGPT?', `Yes. Point any MCP client that supports remote streamable-HTTP servers at ${MCP_URL}. Setup for Claude, Cursor, VS Code, Windsurf, Gemini CLI and Codex is above.`],
  ['Is it financial advice?', 'No. Results are educational analysis built from public data. Backtests use daily candles, and past performance does not predict future results.'],
  ['Who builds it?', 'Sperax, the team behind USDs and SperaxOS. Sperax has been building since 2019, has raised $17M and is in a strategic partnership with Microsoft.'],
];

// ---------------------------------------------------------------------------------------------
// Shared layout

const ORG = {
  '@type': 'Organization',
  '@id': `${SOCIALS.website}/#organization`,
  logo: url('icon-512.png'),
  name: 'Sperax',
  sameAs: [SOCIALS.x, SOCIALS.telegram, SOCIALS.github, REPO_URL],
  url: SOCIALS.website,
};

const head = ({ description = META_DESCRIPTION, jsonLd = [], page = '', title = TITLE }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="keywords" content="ChatGPT plugin, MCP server, crypto trading, derivatives, funding rates, position sizing, backtesting, token safety, honeypot scanner, DeFi, Bitcoin, Ethereum, Solana, Sperax">
<meta name="author" content="Sperax">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="${esc(iface.brandColor)}">
<link rel="canonical" href="${url(page)}">
<link rel="icon" href="${url('favicon.svg')}" type="image/svg+xml">
<link rel="icon" href="${url('favicon-32.png')}" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${url('apple-touch-icon.png')}">
<link rel="manifest" href="${url('site.webmanifest')}">
<link rel="alternate" type="text/plain" title="llms.txt" href="${url('llms.txt')}">
<link rel="alternate" type="application/json" title="MCP server card" href="${url('.well-known/mcp/server-card.json')}">
<link rel="preload" href="${url('fonts/Inter.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${url('styles.css')}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Sperax Trading Desk">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url(page)}">
<meta property="og:image" content="${url('og-image.png')}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Sperax Trading Desk: check the trade before you take it">
<meta property="og:video" content="${url(`media/${VIDEO_FILE}`)}">
<meta property="og:video:type" content="video/mp4">
<meta property="og:video:width" content="1920">
<meta property="og:video:height" content="1080">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="${X_HANDLE}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${url('og-image.png')}">
<meta name="twitter:image:alt" content="Sperax Trading Desk: check the trade before you take it">
${jsonLd.map(ldScript).join('\n')}
<script src="${url('app.js')}" defer></script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="nav">
  <div class="wrap">
    <a class="brand" href="${url()}"><img src="${url('favicon.svg')}" alt="" width="28" height="28">Sperax Trading Desk</a>
    <nav class="nav-links" aria-label="Main">
      <a href="${url('#tools')}">Tools</a>
      <a href="${url('#install')}">Install</a>
      <a href="${url('tools.html')}">Reference</a>
      <a href="${url('#faq')}">FAQ</a>
      <a href="${REPO_URL}">GitHub</a>
      <a class="btn btn-primary btn-sm" href="${STORE_URL}">Add to ChatGPT</a>
    </nav>
  </div>
</header>
`;

const footer = () => `<footer>
  <div class="wrap">
    <div class="cols">
      <p><strong>Sperax Trading Desk</strong> ${esc(plugin.version)} · read-only crypto analysis for ChatGPT and MCP clients.</p>
      <nav aria-label="Footer">
        <a href="${STORE_URL}">ChatGPT listing</a>
        <a href="${url('tools.html')}">Tool reference</a>
        <a href="${url('llms.txt')}">llms.txt</a>
        <a href="${url('.well-known/mcp/server-card.json')}">MCP server card</a>
        <a href="${REPO_URL}">Source</a>
        <a href="${esc(iface.supportURL)}">Support</a>
        <a href="${esc(iface.privacyPolicyURL)}">Privacy</a>
        <a href="${esc(iface.termsOfServiceURL)}">Terms</a>
        <a href="${REPO_URL}/security/policy">Security</a>
      </nav>
      <nav aria-label="Sperax">
        <a href="${SOCIALS.website}">sperax.io</a>
        <a href="${SOCIALS.x}">X</a>
        <a href="${SOCIALS.telegram}">Telegram</a>
        <a href="${SOCIALS.github}">GitHub</a>
      </nav>
    </div>
    <p>© ${YEAR} Sperax. Code licensed under Apache-2.0. Sperax and the Sperax logo are trademarks of Sperax. ChatGPT is a trademark of OpenAI. Nothing on this site or returned by the tools is financial advice.</p>
  </div>
</footer>
</body>
</html>
`;

// ---------------------------------------------------------------------------------------------
// index.html

const codeBlock = (code, label) =>
  `<div class="code"><pre><code>${esc(code)}</code></pre><button class="copy" type="button" aria-label="Copy ${esc(label)}">Copy</button></div>`;

const toolLink = (name) => `<a class="tool-name" href="${url(`tools.html#${name}`)}">${esc(name)}</a>`;

const promptCards = [
  ...iface.defaultPrompt.map((q, i) => ({ q, tools: DEFAULT_PROMPT_TOOLS[i] ?? [] })),
  ...EXTRA_PROMPTS,
]
  .map(
    (p) => `<li class="card prompt"><q>${esc(p.q)}</q><span>${p.tools.map(toolLink).join(' ')}</span></li>`,
  )
  .join('\n');

const analysisCards = analysis
  .map(
    (t) => `<a class="card" href="${url(`tools.html#${t.name}`)}">
  <h3>${esc(t.title)}</h3>
  <p>${esc(blurb(t))}</p>
  <span class="tool-name">${esc(t.name)}</span>
</a>`,
  )
  .join('\n');

const feedChips = feeds
  .map((t) => `<li><a href="${url(`tools.html#${t.name}`)}" title="${esc(blurb(t))}">${esc(t.title.replace(/^Get /, ''))}</a></li>`)
  .join('\n');

const skillCards = skills
  .map(
    (s) => `<a class="card" href="${REPO_URL}/blob/main/sperax-trading-copilot/skills/${s.name}/SKILL.md">
  <h3>${esc(s.name)}</h3>
  <p>${esc(sentences(s.description)[0])}</p>
  <span class="tool-name">skills/${esc(s.name)}</span>
</a>`,
  )
  .join('\n');

const installBlocks = INSTALL.map(
  (c) => `<div class="card install" id="install-${c.id}">
  <h3>${esc(c.name)}</h3>
  <p>${esc(c.note)}</p>
  ${c.code ? codeBlock(c.code, `${c.name} setup`) : ''}
  ${c.actions ? `<div class="actions">${c.actions.map((a) => `<a class="btn ${a.primary ? 'btn-primary' : 'btn-ghost'} btn-sm" href="${esc(a.href)}">${esc(a.label)}</a>`).join('')}</div>` : ''}
</div>`,
).join('\n');

const indexLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    applicationCategory: 'FinanceApplication',
    applicationSubCategory: 'Crypto trading analysis',
    description: META_DESCRIPTION,
    featureList: iface.capabilities,
    image: url('og-image.png'),
    installUrl: STORE_URL,
    isAccessibleForFree: true,
    keywords: plugin.keywords.join(', '),
    name: 'Sperax Trading Desk',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    operatingSystem: 'ChatGPT, any MCP client',
    publisher: ORG,
    author: ORG,
    releaseNotes: plugin.extensions['com.openai'].publication?.release_notes,
    sameAs: [STORE_URL, REPO_URL],
    screenshot: url('og-image.png'),
    softwareVersion: plugin.version,
    url: SITE_URL,
    datePublished: LAUNCH_DATE,
    video: {
      '@type': 'VideoObject',
      contentUrl: url(`media/${VIDEO_FILE}`),
      description: `A ${VIDEO_SECONDS}-second tour of Sperax Trading Desk in ChatGPT, showing real responses from the live tools.`,
      duration: `PT${VIDEO_SECONDS}S`,
      name: 'Sperax Trading Desk for ChatGPT',
      thumbnailUrl: url('og-image.png'),
      uploadDate: LAUNCH_DATE,
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    description: META_DESCRIPTION,
    name: 'Sperax Trading Desk',
    publisher: ORG,
    url: SITE_URL,
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(([q, a]) => ({
      '@type': 'Question',
      acceptedAnswer: { '@type': 'Answer', text: a },
      name: q,
    })),
  },
];

const indexHtml = `${head({ jsonLd: indexLd })}<main id="main">
<section class="hero">
  <div class="wrap">
    <a class="pill" href="${STORE_URL}"><span class="dot" aria-hidden="true"></span>Live in the ChatGPT plugin directory</a>
    <h1>Check the trade <span class="grad">before you take it.</span></h1>
    <p class="lead">${esc(leadParagraph)} Works in ChatGPT and any MCP client. Free, read-only, no sign-in.</p>
    <div class="cta">
      <a class="btn btn-primary" href="${STORE_URL}">Add to ChatGPT</a>
      <a class="btn btn-ghost" href="#install">Use with Claude, Cursor or VS Code</a>
      <a class="btn btn-ghost" href="${REPO_URL}">View source</a>
    </div>
    <ul class="stats">
      <li><strong>${tools.length}</strong><span>read-only tools</span></li>
      <li><strong>${analysis.length}</strong><span>analysis tools</span></li>
      <li><strong>${feeds.length}</strong><span>live market feeds</span></li>
      <li><strong>0</strong><span>sign-ins or API keys</span></li>
    </ul>
  </div>
</section>

<section aria-label="Launch video">
  <div class="wrap">
    <div class="video">
    <video controls playsinline preload="none" poster="${url('og-image.png')}" width="1920" height="1080">
      <source src="${url(`media/${VIDEO_FILE}`)}" type="video/mp4">
      <a href="${url(`media/${VIDEO_FILE}`)}">Watch the ${VIDEO_SECONDS}-second launch video</a>
    </video>
    </div>
  </div>
</section>

<section id="prompts">
  <div class="wrap">
    <div class="section-head">
      <p class="eyebrow">Try it</p>
      <h2>Ask in plain language</h2>
      <p>ChatGPT picks the tools. Each answer is built from live numbers, not guesses.</p>
    </div>
    <ul class="grid">
${promptCards}
    </ul>
  </div>
</section>

<section id="tools">
  <div class="wrap">
    <div class="section-head">
      <p class="eyebrow">${plural(analysis.length, 'analysis tool')}</p>
      <h2>Size, test and sanity-check</h2>
      <p>Each tool does one job a trader would otherwise do by hand across five tabs.</p>
    </div>
    <div class="grid">
${analysisCards}
    </div>
  </div>
</section>

<section id="feeds">
  <div class="wrap">
    <div class="section-head">
      <p class="eyebrow">${plural(feeds.length, 'market feed')}</p>
      <h2>One tool per live data set</h2>
      <p>Sentiment, macro, derivatives, on-chain flows, DeFi and news. Each takes only the parameters its feed uses.</p>
    </div>
    <ul class="chips">
${feedChips}
    </ul>
  </div>
</section>

<section id="skills">
  <div class="wrap">
    <div class="section-head">
      <p class="eyebrow">${plural(skills.length, 'skill')}</p>
      <h2>Guided flows</h2>
      <p>Skills chain the tools into the checks traders run most.</p>
    </div>
    <div class="grid">
${skillCards}
    </div>
  </div>
</section>

<section id="safety">
  <div class="wrap split">
    <div class="section-head">
      <p class="eyebrow">Read-only by design</p>
      <h2>What it will not do</h2>
      <p>Every tool is annotated <code>readOnlyHint: true</code> and <code>destructiveHint: false</code>. Your keys, accounts and funds never touch it.</p>
    </div>
    <ul class="guard">
${WILL_NOT.map(([t, d]) => `      <li><span class="x" aria-hidden="true">×</span><span><strong>${esc(t)}</strong> ${esc(d)}</span></li>`).join('\n')}
    </ul>
  </div>
</section>

<section id="install">
  <div class="wrap">
    <div class="section-head">
      <p class="eyebrow">Install</p>
      <h2>ChatGPT, or any MCP client</h2>
      <p>One endpoint: <code>${esc(MCP_URL)}</code>. Streamable HTTP, no auth.</p>
    </div>
    <div class="grid">
${installBlocks}
    </div>
  </div>
</section>

<section id="faq">
  <div class="wrap">
    <div class="section-head">
      <p class="eyebrow">FAQ</p>
      <h2>Questions</h2>
    </div>
    <div class="faq">
${FAQ.map(([q, a]) => `      <details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}
    </div>
  </div>
</section>

<section id="about">
  <div class="wrap">
    <div class="about">
      <img src="${url('icon-192.png')}" alt="Sperax logo" width="64" height="64">
      <div>
        <h2>Built by Sperax</h2>
        <p>Sperax has been building in crypto since 2019 and has raised $17M. It created USDs, the auto-yield stablecoin, and SperaxOS, the AI agent workspace that serves these tools. Sperax is in a strategic partnership with Microsoft through the Microsoft AI Cloud Partner Program, and SperaxOS is available on Microsoft Marketplace.</p>
        <p><a href="${SOCIALS.website}">sperax.io</a> · <a href="${SOCIALS.x}">X</a> · <a href="${SOCIALS.telegram}">Telegram</a> · <a href="${SOCIALS.github}">GitHub</a></p>
      </div>
    </div>
  </div>
</section>
</main>
${footer()}`;

// ---------------------------------------------------------------------------------------------
// tools.html

const typeOf = (schema = {}) => {
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(' | ');
  const types = [schema.type].flat().filter(Boolean);
  if (schema.anyOf || schema.oneOf) return (schema.anyOf ?? schema.oneOf).map(typeOf).join(' | ');
  return types
    .map((t) => (t === 'array' && schema.items ? `array of ${schema.items.properties ? 'objects' : typeOf(schema.items)}` : t))
    .join(' | ');
};

const constraintsOf = (schema = {}) => {
  const c = [];
  if (schema.default !== undefined) c.push(`default ${JSON.stringify(schema.default)}`);
  if (schema.minimum !== undefined) c.push(`≥ ${schema.minimum}`);
  if (schema.exclusiveMinimum !== undefined) c.push(`> ${schema.exclusiveMinimum}`);
  if (schema.maximum !== undefined) c.push(`≤ ${schema.maximum}`);
  if (schema.exclusiveMaximum !== undefined) c.push(`< ${schema.exclusiveMaximum}`);
  if (schema.minLength !== undefined) c.push(`min length ${schema.minLength}`);
  if (schema.maxLength !== undefined) c.push(`max length ${schema.maxLength}`);
  if (schema.minItems !== undefined) c.push(`min ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}`);
  if (schema.maxItems !== undefined) c.push(`max ${schema.maxItems} item${schema.maxItems === 1 ? '' : 's'}`);
  if (schema.items?.enum) c.push(`items: ${schema.items.enum.map((v) => JSON.stringify(v)).join(', ')}`);
  if (schema.pattern) c.push(`pattern ${schema.pattern}`);
  if (schema.format) c.push(`format ${schema.format}`);
  return c;
};

/** Flattens an input schema into rows, expanding array-of-object items as name[].field. */
const paramRows = (schema, prefix = '') => {
  const required = new Set(schema?.required ?? []);
  return Object.entries(schema?.properties ?? {}).flatMap(([name, prop]) => {
    const row = { constraints: constraintsOf(prop), description: prop.description ?? '', name: `${prefix}${name}`, required: required.has(name), type: typeOf(prop) };
    const nested = prop.items?.properties ? paramRows(prop.items, `${prefix}${name}[].`) : [];
    return [row, ...nested];
  });
};

const toolTags = (t) => {
  const a = t.annotations ?? {};
  const tags = [];
  if (a.readOnlyHint) tags.push(['Read-only', true]);
  if (a.destructiveHint === false) tags.push(['Non-destructive', true]);
  if (a.idempotentHint) tags.push(['Idempotent', false]);
  tags.push([a.openWorldHint ? 'Live external data' : 'Computed locally', false]);
  if (t._meta?.['openai/outputTemplate']) tags.push(['Interactive card in ChatGPT', false]);
  return tags;
};

const toolArticle = (t) => {
  const rows = paramRows(t.inputSchema);
  const outputs = Object.keys(t.outputSchema?.properties ?? {});
  return `<article class="tool" id="${esc(t.name)}">
  <header>
    <h3><a href="#${esc(t.name)}">${esc(t.title)}</a></h3>
    <code class="id">${esc(t.name)}</code>
  </header>
  <ul class="tags">${toolTags(t).map(([label, safe]) => `<li class="tag${safe ? ' tag-safe' : ''}">${esc(label)}</li>`).join('')}</ul>
  <p>${esc(t.description)}</p>
  ${
    rows.length
      ? `<div class="table"><table>
    <thead><tr><th scope="col">Parameter</th><th scope="col">Type</th><th scope="col">Description</th><th scope="col">Constraints</th></tr></thead>
    <tbody>
${rows
  .map(
    (r) => `      <tr><td><code>${esc(r.name)}</code>${r.required ? ' <span class="req">required</span>' : ''}</td><td><code>${esc(r.type)}</code></td>${r.description ? `<td>${esc(r.description)}</td>` : '<td class="none"><span class="muted">—</span></td>'}${r.constraints.length ? `<td data-label="Constraints">${esc(r.constraints.join(', '))}</td>` : '<td class="none"><span class="muted">—</span></td>'}</tr>`,
  )
  .join('\n')}
    </tbody>
  </table></div>`
      : '<p class="none">No parameters.</p>'
  }
  ${outputs.length ? `<p class="muted">Returns structured content with: ${outputs.map((o) => `<code>${esc(o)}</code>`).join(', ')}.</p>` : ''}
</article>`;
};

const toc = (list) => `<ul class="toc">${list.map((t) => `<li><a href="#${esc(t.name)}">${esc(t.title)}</a></li>`).join('')}</ul>`;
const TOOLS_DESCRIPTION = `Reference for all ${tools.length} Sperax Trading Desk MCP tools: parameters, types, constraints and annotations, generated from the live server.`;

const toolsHtml = `${head({
  description: TOOLS_DESCRIPTION,
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', item: SITE_URL, name: 'Sperax Trading Desk', position: 1 },
        { '@type': 'ListItem', item: url('tools.html'), name: 'Tool reference', position: 2 },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      about: { '@type': 'SoftwareApplication', name: 'Sperax Trading Desk', url: SITE_URL },
      dateModified: BUILD_DATE,
      description: TOOLS_DESCRIPTION,
      headline: 'Sperax Trading Desk tool reference',
      publisher: ORG,
      url: url('tools.html'),
    },
  ],
  page: 'tools.html',
  title: `Tool reference: ${tools.length} crypto analysis MCP tools · Sperax Trading Desk`,
})}<main id="main">
<section class="hero">
  <div class="wrap">
    <p class="eyebrow">Tool reference</p>
    <h1>${tools.length} read-only tools</h1>
    <p class="lead">Generated from <code>tools/list</code> on the live endpoint (server ${esc(live.serverInfo?.version)}, MCP ${esc(live.protocolVersion)}) on ${BUILD_DATE}. Every tool is read-only and needs no auth.</p>
  </div>
</section>
<section>
  <div class="wrap">
    <h2 class="toc-head">Analysis · ${analysis.length} tools</h2>
    ${toc(analysis)}
    <h2 class="toc-head">Market feeds · ${feeds.length} tools</h2>
    ${toc(feeds)}
  </div>
</section>
<section>
  <div class="wrap">
    <h2>Analysis tools</h2>
${analysis.map(toolArticle).join('\n')}
    <h2>Market feed tools</h2>
${feeds.map(toolArticle).join('\n')}
  </div>
</section>
</main>
${footer()}`;

// ---------------------------------------------------------------------------------------------
// 404.html

const notFoundHtml = `${head({ description: 'Page not found.', page: '404.html', title: 'Page not found · Sperax Trading Desk' }).replace(
  '<meta name="robots" content="index, follow, max-image-preview:large">',
  '<meta name="robots" content="noindex">',
)}<main id="main">
<section class="notfound">
  <div class="wrap">
    <h1>404</h1>
    <p class="lead">That page does not exist.</p>
    <div class="cta">
      <a class="btn btn-primary" href="${url()}">Home</a>
      <a class="btn btn-ghost" href="${url('tools.html')}">Tool reference</a>
    </div>
  </div>
</section>
</main>
${footer()}`;

// ---------------------------------------------------------------------------------------------
// llms.txt and llms-full.txt

const mdParams = (t) => {
  const rows = paramRows(t.inputSchema);
  if (!rows.length) return 'Parameters: none.';
  return [
    'Parameters:',
    ...rows.map(
      (r) =>
        `- \`${r.name}\` (${r.type}${r.required ? ', required' : ''})${r.description ? `: ${r.description}` : ''}${r.constraints.length ? ` [${r.constraints.join(', ')}]` : ''}`,
    ),
  ].join('\n');
};

const llmsTxt = `# Sperax Trading Desk

> ${leadParagraph} Free, read-only MCP server with ${tools.length} tools (${analysis.length} analysis tools and ${feeds.length} live market feeds), live in the ChatGPT plugin directory and usable from any MCP client. It cannot place orders, sign transactions or move funds.

- MCP endpoint: ${MCP_URL} (streamable HTTP, JSON-RPC over POST, no auth, 120 requests per minute per IP)
- ChatGPT listing: ${STORE_URL}
- Publisher: Sperax (${SOCIALS.website})
- Source: ${REPO_URL} (Apache-2.0)

## Docs

- [Full reference for LLMs](${url('llms-full.txt')}): every tool with its full description and parameters, install steps, limits and FAQ in one file
- [Tool reference](${url('tools.html')}): the same tools as a web page
- [MCP server card](${url('.well-known/mcp/server-card.json')}): server info, transport, capabilities and tool list as JSON
- [MCP Registry entry](${url('server.json')}): server.json for the official MCP Registry

## Analysis tools

${analysis.map((t) => `- [${t.name}](${url(`tools.html#${t.name}`)}): ${blurb(t)}`).join('\n')}

## Market feeds

${feeds.map((t) => `- [${t.name}](${url(`tools.html#${t.name}`)}): ${blurb(t)}`).join('\n')}

## Install

- ChatGPT: add Sperax Trading Desk from ${STORE_URL}
- Claude Code: \`claude mcp add --transport http ${SERVER_KEY} ${MCP_URL}\`
- Cursor, VS Code, Windsurf, Gemini CLI, Codex, Claude Desktop: [setup snippets](${url('#install')})

## Optional

- [Skills](${REPO_URL}/tree/main/sperax-trading-copilot/skills): ${skills.map((s) => s.name).join(', ')}
- [Plugin manifest](${REPO_URL}/blob/main/sperax-trading-copilot/plugin.json)
- [Launch video](${url(`media/${VIDEO_FILE}`)})
`;

const llmsFullTxt = `# Sperax Trading Desk

> ${leadParagraph}

${paragraphs(iface.longDescription).slice(1).join('\n\n')}

## Connection

- MCP endpoint: ${MCP_URL}
- Transport: streamable HTTP (JSON-RPC 2.0 over POST; GET answers 405)
- Protocol version: ${live.protocolVersion}
- Server: ${live.serverInfo?.name} ${live.serverInfo?.version}
- Authentication: none
- Rate limit: 120 requests per 60 seconds per client IP; over the limit the endpoint answers 429 with Retry-After
- Caching: responses are cached for 60 seconds to 15 minutes per argument set
- ChatGPT listing: ${STORE_URL}
- Source and manifest: ${REPO_URL}

## Server instructions

${live.instructions ?? ''}

## Install

${INSTALL.map((c) => `### ${c.name}\n\n${c.note}${c.actions ? `\n\n${c.actions.map((a) => `${a.label}: ${a.href}`).join('\n')}` : ''}${c.code ? `\n\n\`\`\`\n${c.code}\n\`\`\`` : ''}`).join('\n\n')}

## Analysis tools

${analysis.map((t) => `### ${t.name}\n\n${t.title}. ${t.description}\n\n${mdParams(t)}`).join('\n\n')}

## Market feed tools

${feeds.map((t) => `### ${t.name}\n\n${t.title}. ${t.description}\n\n${mdParams(t)}`).join('\n\n')}

## Skills

${skills.map((s) => `- ${s.name}: ${s.description}`).join('\n')}

## What it will not do

${WILL_NOT.map(([t, d]) => `- ${t} ${d}`).join('\n')}

## FAQ

${FAQ.map(([q, a]) => `### ${q}\n\n${a}`).join('\n\n')}

## Publisher

Sperax (${SOCIALS.website}). X: ${SOCIALS.x}. Telegram: ${SOCIALS.telegram}. GitHub: ${SOCIALS.github}. Support: ${iface.supportURL}. Privacy: ${iface.privacyPolicyURL}. Terms: ${iface.termsOfServiceURL}.

Generated ${BUILD_DATE} from the live server.
`;

// ---------------------------------------------------------------------------------------------
// Machine-readable discovery files

const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'Amazonbot',
  'meta-externalagent',
  'CCBot',
  'DuckAssistBot',
  'cohere-ai',
  'MistralAI-User',
  'Bytespider',
];

const robotsTxt = `# AI assistants and search engines are welcome to read and cite this site.
User-agent: *
Allow: /

${AI_CRAWLERS.map((bot) => `User-agent: ${bot}`).join('\n')}
Allow: /

Sitemap: ${url('sitemap.xml')}
`;

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
  <url>
    <loc>${url()}</loc>
    <lastmod>${BUILD_DATE}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <video:video>
      <video:thumbnail_loc>${url('og-image.png')}</video:thumbnail_loc>
      <video:title>Sperax Trading Desk for ChatGPT</video:title>
      <video:description>A ${VIDEO_SECONDS}-second tour of Sperax Trading Desk in ChatGPT, showing real responses from the live tools.</video:description>
      <video:content_loc>${url(`media/${VIDEO_FILE}`)}</video:content_loc>
      <video:duration>${VIDEO_SECONDS}</video:duration>
      <video:publication_date>${LAUNCH_DATE}</video:publication_date>
      <video:family_friendly>yes</video:family_friendly>
    </video:video>
  </url>
  <url>
    <loc>${url('tools.html')}</loc>
    <lastmod>${BUILD_DATE}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
`;

const serverCard = {
  name: serverJson.name,
  title: 'Sperax Trading Desk',
  description: serverJson.description,
  version: plugin.version,
  serverInfo: live.serverInfo,
  protocolVersion: live.protocolVersion,
  transport: { type: 'streamable-http', url: MCP_URL },
  authentication: { required: false, schemes: [] },
  capabilities: live.capabilities,
  instructions: live.instructions,
  publisher: { name: 'Sperax', url: SOCIALS.website, contact: iface.supportURL },
  websiteUrl: SITE_URL,
  documentationUrl: url('tools.html'),
  repositoryUrl: REPO_URL,
  iconUrl: url('icon-512.png'),
  distribution: { chatgpt: STORE_URL, mcpRegistry: url('server.json') },
  rateLimit: { requests: 120, windowSeconds: 60, scope: 'ip' },
  tools: tools.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    annotations: t.annotations,
    inputSchema: t.inputSchema,
  })),
};

const wellKnownMcp = {
  servers: [
    {
      name: serverJson.name,
      title: 'Sperax Trading Desk',
      description: serverJson.description,
      transport: 'streamable-http',
      url: MCP_URL,
      authentication: 'none',
      serverCard: url('.well-known/mcp/server-card.json'),
      documentation: url('llms-full.txt'),
    },
  ],
};

const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
const securityTxt = `Contact: mailto:${SECURITY_CONTACT}
Contact: ${REPO_URL}/security/advisories/new
Expires: ${expires}
Preferred-Languages: en
Policy: ${REPO_URL}/security/policy
Canonical: ${url('.well-known/security.txt')}
`;

const webManifest = {
  background_color: '#ffffff',
  description: META_DESCRIPTION,
  display: 'standalone',
  icons: [
    { purpose: 'any', sizes: '192x192', src: 'icon-192.png', type: 'image/png' },
    { purpose: 'any', sizes: '512x512', src: 'icon-512.png', type: 'image/png' },
    { purpose: 'any', sizes: 'any', src: 'favicon.svg', type: 'image/svg+xml' },
  ],
  name: 'Sperax Trading Desk',
  short_name: 'Trading Desk',
  start_url: './',
  theme_color: iface.brandColor,
};

// ---------------------------------------------------------------------------------------------
// Social card (og-image.png 1200x630, .github/social-preview.png 1280x640)

const fontFace = (family, file, weight) =>
  `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${readFileSync(path.join(ROOT, 'launch-video/fonts', file)).toString('base64')}) format('woff2');font-weight:${weight};}`;
const logoSvg = readFileSync(path.join(PKG, 'assets/logo.svg'), 'utf8');

const socialCardHtml = (width, height) => `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFace('Inter', 'Inter.woff2', '100 900')}
${fontFace('JetBrains Mono', 'JetBrainsMono.woff2', '100 800')}
*{box-sizing:border-box;margin:0}
body{width:${width}px;height:${height}px;overflow:hidden;font-family:Inter,sans-serif;color:#fff;
background:radial-gradient(circle at 85% 15%,rgba(167,139,250,.55),transparent 45%),radial-gradient(circle at 10% 100%,rgba(99,102,241,.6),transparent 50%),linear-gradient(135deg,#1e1b4b,#312e81 55%,#4c1d95);
padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between}
.top{display:flex;align-items:center;gap:20px;font-size:30px;font-weight:600;letter-spacing:-.01em}
.top svg{width:64px;height:64px;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.35)}
.badge{margin-left:auto;display:flex;align-items:center;gap:10px;padding:10px 18px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);font-size:20px;font-weight:500}
.badge i{width:10px;height:10px;border-radius:50%;background:#34d399;box-shadow:0 0 12px #34d399}
h1{font-size:84px;line-height:1.02;font-weight:800;letter-spacing:-.035em}
h1 span{background:linear-gradient(90deg,#c4b5fd,#a5b4fc);-webkit-background-clip:text;color:transparent}
p{margin-top:22px;font-size:28px;line-height:1.35;color:rgba(255,255,255,.82);max-width:960px}
.row{display:flex;gap:14px;font-family:'JetBrains Mono',monospace;font-size:21px}
.row div{padding:10px 16px;border-radius:12px;background:rgba(15,16,32,.45);border:1px solid rgba(255,255,255,.14)}
.row b{color:#c4b5fd;font-weight:700}
</style></head><body>
<div class="top">${logoSvg}<span>Sperax Trading Desk</span><div class="badge"><i></i>Live in ChatGPT</div></div>
<div><h1>Check the trade<br><span>before you take it.</span></h1>
<p>Futures positioning, trade sizing, backtests, token scans and live market feeds. Read-only. No sign-in.</p></div>
<div class="row"><div><b>${tools.length}</b> tools</div><div><b>${feeds.length}</b> live feeds</div><div>ChatGPT · Claude · Cursor · any MCP client</div></div>
</body></html>`;

const renderPng = async (browser, width, height, file) => {
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { height, width } });
  await page.setContent(socialCardHtml(width, height), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: file, type: 'png' });
  await page.close();
};

// ---------------------------------------------------------------------------------------------
// Write

rmSync(OUT, { force: true, recursive: true });
for (const dir of ['fonts', 'media', '.well-known/mcp']) mkdirSync(path.join(OUT, dir), { recursive: true });

const write = (rel, content) => writeFileSync(path.join(OUT, rel), content);
write('index.html', indexHtml);
write('tools.html', toolsHtml);
write('404.html', notFoundHtml);
write('llms.txt', llmsTxt);
write('llms-full.txt', llmsFullTxt);
write('robots.txt', robotsTxt);
write('sitemap.xml', sitemapXml);
write('site.webmanifest', `${json(webManifest)}\n`);
write('server.json', `${json(serverJson)}\n`);
write('.well-known/mcp/server-card.json', `${json(serverCard)}\n`);
write('.well-known/mcp.json', `${json(wellKnownMcp)}\n`);
write('.well-known/security.txt', securityTxt);
write('.nojekyll', '');

copyFileSync(path.join(ROOT, 'site/styles.css'), path.join(OUT, 'styles.css'));
copyFileSync(path.join(ROOT, 'site/app.js'), path.join(OUT, 'app.js'));
for (const font of ['Inter.woff2', 'JetBrainsMono.woff2']) {
  copyFileSync(path.join(ROOT, 'launch-video/fonts', font), path.join(OUT, 'fonts', font));
}
copyFileSync(path.join(ROOT, 'launch-video', VIDEO_FILE), path.join(OUT, 'media', VIDEO_FILE));
copyFileSync(path.join(PKG, 'assets/logo.svg'), path.join(OUT, 'favicon.svg'));

const logo = Buffer.from(logoSvg);
await Promise.all(
  [
    ['favicon-32.png', 32],
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
  ].map(([file, size]) => sharp(logo, { density: 384 }).resize(size, size).png().toFile(path.join(OUT, file))),
);

const browser = await chromium.launch();
try {
  await renderPng(browser, 1200, 630, path.join(OUT, 'og-image.png'));
  if (args.has('--social-preview')) {
    mkdirSync(path.join(ROOT, '.github'), { recursive: true });
    await renderPng(browser, 1280, 640, path.join(ROOT, '.github/social-preview.png'));
  }
} finally {
  await browser.close();
}

console.log(
  `Wrote ${path.relative(ROOT, OUT)}/ for ${SITE_URL}: ${tools.length} tools (${analysis.length} analysis, ${feeds.length} feeds), ${skills.length} skills, server ${live.serverInfo?.version}.`,
);
