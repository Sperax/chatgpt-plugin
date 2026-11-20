#!/usr/bin/env node
/**
 * Builds the static site into _site/ (served by Cloudflare Pages; `npm run deploy`).
 *
 * Every tool name, title, description and parameter comes from the live MCP endpoint, so the
 * site cannot drift from what ChatGPT serves. Listing copy comes from plugin.json, skills from
 * their SKILL.md frontmatter.
 *
 *   node scripts/site.mjs                    # write _site/
 *   node scripts/site.mjs --social-preview   # also write .github/social-preview.png
 *
 * Env: SITE_URL (default https://sperax-trading-desk.pages.dev/), MCP_URL (fetch tools
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
const SITE_URL = new URL(process.env.SITE_URL ?? 'https://sperax-trading-desk.pages.dev/').href;
const REPO_URL = 'https://github.com/Sperax/chatgpt-plugin';
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
    note: 'Open the listing in the ChatGPT plugin directory and add it.',
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

// ---------------------------------------------------------------------------------------------
// Tool metadata, shared by index.html and tools.html

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

// ---------------------------------------------------------------------------------------------
// Page chrome

const PAPER = '#0A0B0D';

const svg = (body, size = 16, viewBox = '0 0 16 16') =>
  `<svg class="ic" viewBox="${viewBox}" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ARROW_UR = svg('<path d="M5 11 11 5M6.5 5H11v4.5"/>');
const ARROW_DOWN = svg('<path d="M8 3v10M4 9l4 4 4-4"/>');
const ARROW_RIGHT = svg('<path d="M3 8h10M9 4l4 4-4 4"/>');
const CHECK = svg('<path d="m3.5 8.5 3 3 6-7"/>');

/** Button with a trailing icon. Variants: lime, ink, white, ghost, outline-light. */
const btn = (href, label, variant = 'lime', icon = ARROW_UR, size = '') =>
  `<a class="btn btn-${variant}${size ? ` btn-${size}` : ''}" href="${esc(href)}"><span>${esc(label)}</span>${icon}</a>`;

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
<meta name="theme-color" content="${PAPER}">
<link rel="canonical" href="${url(page)}">
<link rel="icon" href="${url('favicon.svg')}" type="image/svg+xml">
<link rel="icon" href="${url('favicon-32.png')}" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${url('apple-touch-icon.png')}">
<link rel="manifest" href="${url('site.webmanifest')}">
<link rel="alternate" type="text/plain" title="llms.txt" href="${url('llms.txt')}">
<link rel="alternate" type="application/json" title="MCP server card" href="${url('.well-known/mcp/server-card.json')}">
<link rel="preload" href="${url('fonts/DMSans.woff2')}" as="font" type="font/woff2" crossorigin>
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
  <div class="wrap nav-inner">
    <a class="brand" href="${url()}" aria-label="Sperax Trading Desk home"><img src="${url('logo.svg')}" alt="" width="113" height="24"><span>Trading Desk</span></a>
    <nav class="nav-links" aria-label="Main">
      <a href="${url('#tools')}">Tools</a>
      <a href="${url('#install')}">Install</a>
      <a href="${url('tools')}">Reference</a>
      <a href="${url('#faq')}">FAQ</a>
      <a href="${REPO_URL}">GitHub</a>
    </nav>
    ${btn(STORE_URL, 'Add to ChatGPT', 'lime', ARROW_UR, 'sm')}
  </div>
</header>
`;

const footerNav = (label, links) => `<nav aria-label="${esc(label)}"><p class="tiny">${esc(label)}</p>${links.map(([href, text]) => `<a href="${esc(href)}">${esc(text)}</a>`).join('')}</nav>`;

const footer = () => `<footer class="footer">
  <div class="wrap">
    <div class="footer-top">
      <div class="footer-brand">
        <a class="brand" href="${url()}" aria-label="Sperax Trading Desk home"><img src="${url('logo.svg')}" alt="" width="113" height="24"><span>Trading Desk</span></a>
        <p>Read-only crypto analysis for ChatGPT and any MCP client. Version ${esc(plugin.version)}.</p>
      </div>
      ${footerNav('Product', [[STORE_URL, 'ChatGPT listing'], [url('tools'), 'Tool reference'], [url('#install'), 'Install'], [url('#faq'), 'FAQ']])}
      ${footerNav('For agents', [[url('llms.txt'), 'llms.txt'], [url('llms-full.txt'), 'llms-full.txt'], [url('.well-known/mcp/server-card.json'), 'MCP server card'], [url('server.json'), 'server.json']])}
      ${footerNav('Project', [[REPO_URL, 'Source'], [`${REPO_URL}/security/policy`, 'Security'], [iface.supportURL, 'Support'], [iface.privacyPolicyURL, 'Privacy'], [iface.termsOfServiceURL, 'Terms']])}
      ${footerNav('Sperax', [[SOCIALS.website, 'sperax.io'], [SOCIALS.x, 'X'], [SOCIALS.telegram, 'Telegram'], [SOCIALS.github, 'GitHub']])}
    </div>
    <p class="fine">© ${YEAR} Sperax. Code licensed under Apache-2.0. Sperax and the Sperax logo are trademarks of Sperax. ChatGPT is a trademark of OpenAI. Nothing on this site or returned by the tools is financial advice.</p>
  </div>
</footer>
</body>
</html>
`;

// ---------------------------------------------------------------------------------------------
// index.html

const codeBlock = (code, label) =>
  `<div class="code"><pre><code>${esc(code)}</code></pre><button class="copy" type="button" aria-label="Copy ${esc(label)}">Copy</button></div>`;

const toolLink = (name) => `<a class="tool-name" href="${url(`tools#${name}`)}">${esc(name)}</a>`;
const requiredOf = (t) => t.inputSchema?.required ?? [];
const hasCard = (t) => Boolean(t._meta?.['openai/outputTemplate']);
const countTools = (test) => tools.filter(test).length;

const PROMPTS = [
  ...iface.defaultPrompt.map((q, i) => ({ q, tools: DEFAULT_PROMPT_TOOLS[i] ?? [] })),
  ...EXTRA_PROMPTS,
];
// The worked example in the flow panel: the prompt that chains the most tools.
const FLOW_PROMPT = PROMPTS.reduce((best, p) => (p.tools.length > best.tools.length ? p : best));
const flowTags = [...new Map(FLOW_PROMPT.tools.flatMap((n) => toolTags(toolByName.get(n)))).keys()];

const promptCards = PROMPTS.filter((p) => p !== FLOW_PROMPT).map(
  (p) => `<li><q>${esc(p.q)}</q><span class="chips">${p.tools.map(toolLink).join('')}</span></li>`,
).join('\n');

const icon = (body) => svg(body, 22, '0 0 24 24');
const HERO_TOOLS = [
  ['analyze_coin', icon('<path d="M3 17l5-5 4 3 8-8"/><path d="M15 7h5v5"/>')],
  ['build_trade_plan', icon('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>')],
  ['backtest_signal_strategy', icon('<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 3.5V8h4.5"/><path d="M12 7.5V12l3 2"/>')],
  ['scan_token', icon('<path d="M12 2.5 19.5 5.5v6c0 4.6-3.1 7.9-7.5 9.5-4.4-1.6-7.5-4.9-7.5-9.5v-6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>')],
];

const heroCards = HERO_TOOLS.map(([name, glyph], i) => {
  const t = toolByName.get(name);
  const required = requiredOf(t);
  return `<li class="fcard">
  <a href="${url(`tools#${t.name}`)}">
    <div class="fcard-head"><span class="tile tile-${i + 1}">${glyph}</span><div><h3>${esc(t.title)}</h3><code>${esc(t.name)}</code></div></div>
    <p class="fcard-desc">${esc(blurb(t))}</p>
    <div class="kv"><span class="tiny">Required ${required.length === 1 ? 'input' : 'inputs'}</span><strong>${required.length ? esc(required.join(' · ')) : 'None'}</strong></div>
    <div class="fcard-foot"><span>${hasCard(t) ? 'Interactive card in ChatGPT' : 'Analysis'}</span><span class="view">Reference${ARROW_UR}</span></div>
  </a>
</li>`;
}).join('\n');

const analysisList = analysis
  .map(
    (t) => `<li><a href="${url(`tools#${t.name}`)}"><span class="tl-title">${esc(t.title)}${ARROW_UR}</span><span class="tl-desc">${esc(blurb(t))}</span><code>${esc(t.name)}</code></a></li>`,
  )
  .join('\n');

const feedList = feeds
  .map((t) => `<li><a href="${url(`tools#${t.name}`)}" title="${esc(blurb(t))}"><span>${esc(t.title.replace(/^Get /, ''))}</span>${ARROW_UR}</a></li>`)
  .join('\n');

const skillList = skills
  .map(
    (s) => `<li><a href="${REPO_URL}/blob/main/sperax-trading-copilot/skills/${s.name}/SKILL.md"><strong>${esc(s.name)}</strong><span>${esc(sentences(s.description)[0])}</span></a></li>`,
  )
  .join('\n');

const AGENT_FILES = [
  [url('llms.txt'), 'llms.txt', 'Plain-text summary for language models.'],
  [url('llms-full.txt'), 'llms-full.txt', 'Every tool with its full description and parameters.'],
  [url('.well-known/mcp/server-card.json'), 'server-card.json', 'MCP server card with transport and capabilities.'],
  [url('server.json'), 'server.json', `MCP registry entry, published as ${serverJson.name}.`],
];

const INSTALL_POINTS = {
  chatgpt: [
    `${plural(tools.length, 'tool')}, all read-only`,
    `Interactive cards from ${plural(countTools(hasCard), 'tool')}`,
    'No sign-in, no API key',
    `Live server ${esc(live.serverInfo?.version)}, MCP ${esc(live.protocolVersion)}`,
  ],
};

const installBlocks = INSTALL.map(
  (c) => `<div class="icard" id="install-${c.id}">
  <h3>${esc(c.name)}</h3>
  <p>${esc(c.note)}</p>
  ${INSTALL_POINTS[c.id] ? `<ul class="checks">${INSTALL_POINTS[c.id].map((pt) => `<li>${CHECK}<span>${pt}</span></li>`).join('')}</ul>` : ''}
  ${c.code ? codeBlock(c.code, `${c.name} setup`) : ''}
  ${c.actions ? `<div class="actions">${c.actions.map((a) => btn(a.href, a.label, a.primary ? 'lime' : 'ghost', ARROW_UR, 'sm')).join('')}</div>` : ''}
</div>`,
).join('\n');

const ANNOTATIONS = [
  ['readOnlyHint: true', countTools((t) => t.annotations?.readOnlyHint === true)],
  ['destructiveHint: false', countTools((t) => t.annotations?.destructiveHint === false)],
  ['openWorldHint: true', countTools((t) => t.annotations?.openWorldHint === true)],
  ['openai/outputTemplate', countTools(hasCard)],
];

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

const DOT = '<span class="dot">.</span>';
const SERVER_LINE = `Server ${esc(live.serverInfo?.version)} · MCP ${esc(live.protocolVersion)}`;
const segment = (n) => `style="flex-grow:${n}"`;
const CATALOG = [
  ['Analysis tools', analysis.length, 'seg-1'],
  ['Market feeds', feeds.length, 'seg-2'],
  ['Skills', skills.length, 'seg-3'],
];

const indexHtml = `${head({ jsonLd: indexLd })}<main id="main">
<section class="hero">
  <div class="wrap">
    <div class="hero-panel">
      <div class="hero-copy">
        <p class="hero-intro"><a href="${STORE_URL}">Live in the ChatGPT plugin directory</a></p>
        <h1>Check the trade before you take it${DOT}</h1>
        <p class="lead">${esc(leadParagraph)} Works in ChatGPT and any MCP client. Free, read-only, no sign-in.</p>
        <div class="cta">
          ${btn(STORE_URL, 'Add to ChatGPT')}
          ${btn('#install', 'Install in any MCP client', 'white', ARROW_DOWN)}
        </div>
      </div>
      <div class="hero-media">
        <video controls playsinline preload="none" poster="${url('og-image.png')}" width="1920" height="1080">
          <source src="${url(`media/${VIDEO_FILE}`)}" type="video/mp4">
          <a href="${url(`media/${VIDEO_FILE}`)}">Watch the ${VIDEO_SECONDS}-second launch video</a>
        </video>
        <p class="tiny">Launch video · ${VIDEO_SECONDS} seconds</p>
      </div>
    </div>
    <ul class="fcards">
${heroCards}
    </ul>
  </div>
</section>

<section id="prompts" class="section">
  <div class="wrap">
    <div class="split-head">
      <div>
        <p class="eyebrow">For traders</p>
        <h2>Your questions.<br>Live numbers to answer them.</h2>
      </div>
      <div class="split-aside">
        <p>Ask in plain language. ChatGPT picks the tools and builds the answer from live market data, not guesses.</p>
        ${btn(STORE_URL, 'Add to ChatGPT', 'ink')}
      </div>
    </div>

    <div class="flow">
      <div class="step">
        <div class="step-head"><span>Your question</span><span class="num">01</span></div>
        <div class="step-ask">
          <span class="tile tile-1">${HERO_TOOLS[0][1]}</span>
          <q>${esc(FLOW_PROMPT.q)}</q>
        </div>
        <dl class="fields">
          <div><dt>Client</dt><dd>ChatGPT or any MCP client</dd></div>
          <div><dt>Sign-in</dt><dd>None</dd></div>
        </dl>
        <a class="step-link" href="${STORE_URL}">Ask it in ChatGPT${ARROW_UR}</a>
      </div>
      <span class="flow-arrow" aria-hidden="true">${ARROW_RIGHT}</span>
      <div class="step">
        <div class="step-head"><span>Tools called</span><span class="num">02</span></div>
        <div class="step-band">
          <div class="step-band-tools">${FLOW_PROMPT.tools.map((n) => `<code>${esc(n)}</code>`).join('')}</div>
          ${ARROW_UR}
          <p class="tiny">${plural(FLOW_PROMPT.tools.length, 'tool')} chained on one question</p>
        </div>
        <ol class="chain">
${FLOW_PROMPT.tools
  .map((n, i) => {
    const t = toolByName.get(n);
    const required = requiredOf(t);
    return `          <li><span class="num">${String(i + 1).padStart(2, '0')}</span><div><strong>${esc(t.title)}</strong><span>${required.length ? `Needs ${esc(required.join(', '))}` : 'No required inputs'}</span></div></li>`;
  })
  .join('\n')}
        </ol>
        <div class="step-row"><span>Live endpoint</span><a href="${url('tools')}">${SERVER_LINE}${ARROW_UR}</a></div>
        <p class="step-note">Streamable HTTP, no auth, 120 requests per minute per IP.</p>
      </div>
      <span class="flow-arrow" aria-hidden="true">${ARROW_RIGHT}</span>
      <div class="step">
        <div class="step-head"><span>What comes back</span><span class="num">03</span></div>
        <ul class="checks">
${flowTags.map((tag) => `          <li>${CHECK}<span>${esc(tag)}</span></li>`).join('\n')}
        </ul>
        <p class="step-note">No orders, no keys, no custody.</p>
      </div>
    </div>

    <ol class="numbered">
      <li><span class="num">01</span><div><h3>Ask in plain language.</h3><p>No commands to learn. ChatGPT reads the question and picks the right tools.</p></div></li>
      <li><span class="num">02</span><div><h3>Live data on every call.</h3><p>${analysis.length} analysis tools and ${feeds.length} market feeds read public sources at the moment you ask.</p></div></li>
      <li><span class="num">03</span><div><h3>Read the result, then decide.</h3><p>Sizing, liquidation distance, backtests and scans. The decision and the trade stay with you.</p></div></li>
    </ol>

    <div class="try">
      <p class="eyebrow">Try asking</p>
      <ul class="prompt-list">
${promptCards}
      </ul>
    </div>
  </div>
</section>

<section id="tools" class="section">
  <div class="wrap">
    <div class="panel panel-tint split">
      <div>
        <p class="eyebrow">${plural(analysis.length, 'analysis tool')}</p>
        <h2 class="h2-sm">Size, test and sanity-check the trade${DOT}</h2>
        <p class="lead-sm">Each tool does one job a trader would otherwise do by hand across five tabs.</p>
        <ul class="tool-list">
${analysisList}
        </ul>
      </div>
      <div class="catalog">
        <div class="card">
          <div class="card-head"><p class="eyebrow">Live catalog</p><a class="pill" href="${url('tools')}">Full reference</a></div>
          <div class="card-id">
            <img src="${url('icon-192.png')}" alt="" width="42" height="42">
            <div><strong>Sperax Trading Desk</strong><span>${SERVER_LINE}</span></div>
            <span class="live">${ARROW_UR}Live</span>
          </div>
          <div class="bar" role="img" aria-label="${analysis.length} analysis tools, ${feeds.length} market feeds, ${skills.length} skills">
${CATALOG.map(([, n, cls]) => `            <span class="${cls}" ${segment(n)}></span>`).join('\n')}
          </div>
          <ul class="legend">
${CATALOG.map(([label, n, cls]) => `            <li><span class="swatch ${cls}" aria-hidden="true"></span>${esc(label)}<strong>${n}</strong></li>`).join('\n')}
          </ul>
          <p class="tiny">Endpoint</p>
          ${codeBlock(MCP_URL, 'MCP endpoint')}
        </div>
      </div>
    </div>
  </div>
</section>

<section id="safety" class="section">
  <div class="wrap split">
    <div>
      <p class="eyebrow">Read-only by design</p>
      <h2 class="h2-sm">What it will not do${DOT}</h2>
      <p class="lead-sm">Your keys, accounts and funds never touch it. Every tool declares itself read-only to the client that calls it.</p>
      ${btn(REPO_URL, 'Read the source', 'ink')}
      <ul class="bold-list">
${WILL_NOT.map(([t, d]) => `        <li><strong>${esc(t)}</strong> ${esc(d)}</li>`).join('\n')}
      </ul>
    </div>
    <div class="frame frame-beige">
      <div class="card card-flush">
        <div class="band">
          <span class="band-word">read-only</span>${ARROW_UR}
          <p class="tiny">Every tool, every call.</p>
        </div>
        <div class="card-body">
          <div class="card-title"><h3>Tool annotations</h3><span>${plural(tools.length, 'tool')}</span></div>
          <p>Declared by the live server in <code>tools/list</code>. Clients read these hints before they call a tool.</p>
          <ul class="pills"><li>MCP ${esc(live.protocolVersion)}</li><li>No auth</li><li>120 requests per minute per IP</li></ul>
          <p class="eyebrow">What the server declares</p>
          <ul class="ann">
${ANNOTATIONS.map(([label, n]) => `            <li><code>${esc(label)}</code><span>${n} of ${tools.length}</span></li>`).join('\n')}
          </ul>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section" aria-labelledby="behind">
  <div class="wrap">
    <h2 class="h2-sm" id="behind">See what's behind the answer${DOT}</h2>
    <p class="lead-sm">The feeds, the guided flows and the files agents read. All of it is public.</p>
    <div class="trio">
      <article class="tcard">
        <div class="tcard-media tint-green">
          <div class="card">
            <span class="tile tile-1">${HERO_TOOLS[0][1]}</span>
            <h3 class="tcard-num">${feeds.length} feeds</h3>
            <ul class="mini">
${feeds.slice(0, 4).map((t) => `              <li><a href="${url(`tools#${t.name}`)}">${esc(t.title.replace(/^Get /, ''))}${ARROW_UR}</a></li>`).join('\n')}
            </ul>
          </div>
          <p class="tiny">From the live catalog</p>
        </div>
        <h3>Live market feeds.</h3>
        <p>Sentiment, macro, derivatives, on-chain flows, DeFi and news. Each feed takes only the parameters it uses. <a href="#feeds">See all ${feeds.length}</a>.</p>
      </article>
      <article class="tcard" id="skills">
        <div class="tcard-media tint-beige">
          <div class="card">
            <p class="tiny">${plural(skills.length, 'skill')}</p>
            <ul class="skill-list">
${skillList}
            </ul>
          </div>
          <p class="tiny">Guided flows</p>
        </div>
        <h3>Guided skills.</h3>
        <p>Skills chain the tools into the checks traders run most. Each one is a readable file in the repository.</p>
      </article>
      <article class="tcard">
        <div class="tcard-media tint-lime">
          <div class="card">
            <p class="tiny">For agents and crawlers</p>
            <ul class="mini mini-desc">
${AGENT_FILES.map(([href, name, desc]) => `              <li><a href="${esc(href)}"><strong>${esc(name)}</strong><span>${esc(desc)}</span></a></li>`).join('\n')}
            </ul>
          </div>
          <p class="tiny">Machine-readable</p>
        </div>
        <h3>Readable by machines.</h3>
        <p>llms.txt, an MCP server card and a registry entry, so assistants can find and describe the server correctly.</p>
      </article>
    </div>
  </div>
</section>

<section id="feeds" class="section">
  <div class="wrap">
    <div class="split-head">
      <div>
        <p class="eyebrow">${plural(feeds.length, 'market feed')}</p>
        <h2 class="h2-sm">One tool per live data set${DOT}</h2>
      </div>
      <div class="split-aside"><p>Hover a feed for what it returns, or open it in the reference for every parameter.</p></div>
    </div>
    <ul class="feed-list">
${feedList}
    </ul>
  </div>
</section>

<section id="install" class="section">
  <div class="wrap">
    <div class="split-head">
      <div>
        <p class="eyebrow">Install</p>
        <h2 class="h2-sm">ChatGPT, or any MCP client${DOT}</h2>
      </div>
      <div class="split-aside"><p>One endpoint, streamable HTTP, no auth. Pick your client and paste.</p></div>
    </div>
    <div class="install-grid">
${installBlocks}
    </div>
  </div>
</section>

<section id="about" class="section">
  <div class="wrap">
    <div class="panel panel-green split">
      <div>
        <p class="eyebrow">Built by Sperax</p>
        <h2 class="h2-sm">Building in crypto since 2019${DOT}</h2>
        <p class="lead-sm">Sperax created USDs, the auto-yield stablecoin, and SperaxOS, the AI agent workspace that serves these tools. Sperax is in a strategic partnership with Microsoft through the Microsoft AI Cloud Partner Program, and SperaxOS is available on Microsoft Marketplace.</p>
        <p class="links"><a href="${SOCIALS.website}">sperax.io${ARROW_UR}</a><a href="${SOCIALS.x}">X${ARROW_UR}</a><a href="${SOCIALS.telegram}">Telegram${ARROW_UR}</a><a href="${SOCIALS.github}">GitHub${ARROW_UR}</a></p>
      </div>
      <ul class="facts">
        <li><img src="${url('icon-192.png')}" alt="Sperax logo" width="42" height="42"></li>
        <li><strong>2019</strong><span>Building in crypto since</span></li>
        <li><strong>$17M</strong><span>Raised</span></li>
        <li><strong>Microsoft</strong><span>Strategic partner through the AI Cloud Partner Program</span></li>
      </ul>
    </div>
  </div>
</section>

<section id="faq" class="section faq-section">
  <div class="wrap faq-split">
    <h2 class="h2-sm">Questions?</h2>
    <div class="faq">
${FAQ.map(([q, a]) => `      <details><summary>${esc(q)}<span class="plus" aria-hidden="true"></span></summary><p>${esc(a)}</p></details>`).join('\n')}
    </div>
  </div>
</section>

<section class="section-cta" aria-labelledby="cta-title">
  <div class="wrap">
    <div class="cta-band">
      <h2 id="cta-title">Check the trade.<br>Before you take it${DOT}</h2>
      <p>Free in ChatGPT and in any MCP client. No sign-in, no keys.</p>
      <div class="cta">
        ${btn(STORE_URL, 'Add to ChatGPT')}
        ${btn('#install', 'Install in any MCP client', 'outline-light', ARROW_DOWN)}
      </div>
    </div>
  </div>
</section>
</main>
${footer()}`;

// ---------------------------------------------------------------------------------------------
// tools.html

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
        { '@type': 'ListItem', item: url('tools'), name: 'Tool reference', position: 2 },
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
      url: url('tools'),
    },
  ],
  page: 'tools',
  title: `Tool reference: ${tools.length} crypto analysis MCP tools · Sperax Trading Desk`,
})}<main id="main"><section class="page-head">
  <div class="wrap">
    <p class="eyebrow">Tool reference</p>
    <h1>${tools.length} read-only tools<span class="dot">.</span></h1>
    <p class="lead">Generated from <code>tools/list</code> on the live endpoint (server ${esc(live.serverInfo?.version)}, MCP ${esc(live.protocolVersion)}) on ${BUILD_DATE}. Every tool is read-only and needs no auth.</p>
    <div class="cta">
      ${btn(STORE_URL, 'Add to ChatGPT')}
      ${btn(url('#install'), 'Install in any MCP client', 'white', ARROW_DOWN)}
    </div>
  </div>
</section>
<section class="section ref-section">
  <div class="wrap ref">
    <aside class="ref-nav" aria-label="Tools">
      <p class="tiny">Analysis · ${analysis.length}</p>
      ${toc(analysis)}
      <p class="tiny">Market feeds · ${feeds.length}</p>
      ${toc(feeds)}
    </aside>
    <div class="ref-body">
      <h2 class="h2-sm">Analysis tools<span class="dot">.</span></h2>
${analysis.map(toolArticle).join('\n')}
      <h2 class="h2-sm">Market feed tools<span class="dot">.</span></h2>
${feeds.map(toolArticle).join('\n')}
    </div>
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
    <p class="eyebrow">Error 404</p>
    <h1>That page does not exist<span class="dot">.</span></h1>
    <p class="lead">The link may be out of date. The tools and the install guides are one click away.</p>
    <div class="cta">
      ${btn(url(), 'Home', 'lime')}
      ${btn(url('tools'), 'Tool reference', 'white')}
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
- [Tool reference](${url('tools')}): the same tools as a web page
- [MCP server card](${url('.well-known/mcp/server-card.json')}): server info, transport, capabilities and tool list as JSON
- [MCP Registry entry](${url('server.json')}): server.json for the official MCP Registry

## Analysis tools

${analysis.map((t) => `- [${t.name}](${url(`tools#${t.name}`)}): ${blurb(t)}`).join('\n')}

## Market feeds

${feeds.map((t) => `- [${t.name}](${url(`tools#${t.name}`)}): ${blurb(t)}`).join('\n')}

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
    <loc>${url('tools')}</loc>
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
  documentationUrl: url('tools'),
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
  background_color: PAPER,
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
  theme_color: PAPER,
};

// ---------------------------------------------------------------------------------------------
// Social card (og-image.png 1200x630, .github/social-preview.png 1280x640)

const fontFace = (family, file, weight) =>
  `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${readFileSync(file).toString('base64')}) format('woff2');font-weight:${weight};}`;
const logoSvg = readFileSync(path.join(PKG, 'assets/logo.svg'), 'utf8');
const wordmarkSvg = readFileSync(path.join(ROOT, 'site/logo.svg'), 'utf8');

const socialCardHtml = (width, height) => `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFace('DM Sans', path.join(ROOT, 'site/fonts/DMSans.woff2'), '100 1000')}
${fontFace('Inter', path.join(ROOT, 'launch-video/fonts/Inter.woff2'), '100 900')}
${fontFace('JetBrains Mono', path.join(ROOT, 'launch-video/fonts/JetBrainsMono.woff2'), '100 800')}
*{box-sizing:border-box;margin:0}
body{width:${width}px;height:${height}px;overflow:hidden;font-family:'DM Sans',Inter,sans-serif;color:#EDEDEF;background:radial-gradient(70% 90% at 100% 0%,rgba(139,147,255,.22) 0%,transparent 60%),radial-gradient(60% 80% at 0% 100%,rgba(94,230,196,.10) 0%,transparent 60%),${PAPER};
padding:64px 72px;display:flex;flex-direction:column;justify-content:space-between}
.top{display:flex;align-items:center;gap:18px;font-size:28px;font-weight:600;letter-spacing:-.02em}
.top svg{display:block;width:auto;height:44px}
.top span{padding-left:20px;border-left:2px solid rgba(255,255,255,.18);color:#9597A0;line-height:44px}
.badge{margin-left:auto;display:flex;align-items:center;gap:10px;padding:10px 18px;border-radius:4px;background:rgba(94,230,196,.12);color:#5EE6C4;box-shadow:inset 0 0 0 1px rgba(94,230,196,.35);font-size:18px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.badge i{width:9px;height:9px;border-radius:50%;background:#5EE6C4;box-shadow:0 0 0 4px rgba(94,230,196,.2)}
h1{font-family:'Helvetica Neue',Helvetica,Inter,Arial,sans-serif;font-size:88px;line-height:1.0;font-weight:700;letter-spacing:-.045em}
h1 span{color:#9597A0}
h1 em{font-style:normal;color:#8B93FF}
p{margin-top:24px;font-size:27px;line-height:1.4;color:#9597A0;max-width:940px}
.row{display:flex;gap:12px;font-size:20px;color:#EDEDEF}
.row div{padding:12px 18px;border-radius:6px;background:#15161B;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.row b{font-family:'JetBrains Mono',monospace;color:#A9AFFF;font-weight:700;margin-right:4px}
.row .dark{background:#F4F4F6;color:#0A0B0D;box-shadow:none}
</style></head><body>
<div class="top">${wordmarkSvg}<span>Trading Desk</span><div class="badge"><i></i>Live in ChatGPT</div></div>
<div><h1>Check the trade<br><span>before you take it</span><em>.</em></h1>
<p>Futures positioning, trade sizing, backtests, token scans and live market feeds. Read-only. No sign-in.</p></div>
<div class="row"><div><b>${tools.length}</b> tools</div><div><b>${feeds.length}</b> live feeds</div><div class="dark">ChatGPT · Claude · Cursor · any MCP client</div></div>
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
write(
  '_headers',
  `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
/.well-known/*
  Access-Control-Allow-Origin: *
/llms.txt
  Access-Control-Allow-Origin: *
/llms-full.txt
  Access-Control-Allow-Origin: *
/server.json
  Access-Control-Allow-Origin: *
/fonts/*
  Cache-Control: public, max-age=2592000
/media/*
  Cache-Control: public, max-age=2592000
`,
);

copyFileSync(path.join(ROOT, 'site/styles.css'), path.join(OUT, 'styles.css'));
copyFileSync(path.join(ROOT, 'site/app.js'), path.join(OUT, 'app.js'));
copyFileSync(path.join(ROOT, 'site/logo.svg'), path.join(OUT, 'logo.svg'));
for (const font of ['Inter.woff2', 'JetBrainsMono.woff2', 'OFL.txt']) {
  copyFileSync(path.join(ROOT, 'launch-video/fonts', font), path.join(OUT, 'fonts', font));
}
for (const file of ['DMSans.woff2', 'DMSans-OFL.txt']) {
  copyFileSync(path.join(ROOT, 'site/fonts', file), path.join(OUT, 'fonts', file));
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
