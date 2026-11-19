/**
 * ChatGPT plugin bundle builder and pre-submission validator.
 *
 * Validates `sperax-trading-copilot/` against the rules OpenAI checks when a plugin
 * is uploaded for review (field lengths, URL and asset rules, review test cases,
 * forbidden files and fields), cross-checks the review test cases against the MCP
 * tool metadata served live by the Trading Desk MCP server, guards that metadata
 * against non-backward-compatible changes, and writes the upload ZIP.
 *
 * Usage:
 *   node scripts/build.mjs                 validate + zip to dist/
 *   node scripts/build.mjs --check         validate only
 *   node scripts/build.mjs --update-lock   accept the current live tool metadata
 *
 * MCP_URL overrides the server URL from sperax-trading-copilot/mcp.json, e.g. to
 * validate a staging deployment. See docs/runbook.md.
 */
import { zipSync } from 'fflate';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import { fetchLiveMetadata } from './lib/mcp.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PLUGIN_NAME = 'sperax-trading-copilot';
const PLUGIN_DIR = path.join(ROOT, PLUGIN_NAME);
const DIST_DIR = path.join(ROOT, 'dist');
const LOCK_PATH = path.join(ROOT, 'tool-metadata.lock.json');

const MAX_ASSET_BYTES = 5 * 1024 * 1024;
const ASSET_EXTENSIONS = new Set(['.jpeg', '.jpg', '.png', '.svg', '.webp']);
const MIN_ICON_PX = 48;

const args = new Set(process.argv.slice(2));
const errors = [];
const fail = (message) => errors.push(message);

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

// ---------------------------------------------------------------------------
// Field checks
// ---------------------------------------------------------------------------

const checkString = (label, value, max, required = true) => {
  if (value === undefined || value === null || value === '') {
    if (required) fail(`${label} is required`);
    return;
  }
  if (typeof value !== 'string') return fail(`${label} must be a string`);
  if (value.length > max) fail(`${label} is ${value.length} chars (max ${max})`);
};

const checkUrl = (label, value) => {
  checkString(label, value, 1024);
  if (typeof value === 'string' && !value.startsWith('https://'))
    fail(`${label} must use https://`);
};

// WCAG relative luminance contrast ratio.
const luminance = (hex) => {
  const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const checkColor = (label, value, background) => {
  if (typeof value !== 'string' || !/^#[\dA-Fa-f]{6}$/.test(value)) {
    return fail(`${label} must be a #RRGGBB hex colour`);
  }
  const ratio = contrast(value, background);
  if (ratio < 2)
    fail(`${label} ${value} has ${ratio.toFixed(2)}:1 contrast against ${background} (min 2:1)`);
};

const resolveAsset = (label, value) => {
  if (typeof value !== 'string') {
    fail(`${label} must be a ./-relative path`);
    return;
  }
  if (!value.startsWith('./') || value.includes('..')) {
    fail(`${label} must start with ./ and stay inside the plugin root`);
    return;
  }
  const file = path.join(PLUGIN_DIR, value);
  if (!existsSync(file)) {
    fail(`${label} points at ${value}, which does not exist`);
    return;
  }
  return file;
};

const checkImage = async (label, value, square) => {
  const file = resolveAsset(label, value);
  if (!file) return;
  const ext = path.extname(file).toLowerCase();
  if (!ASSET_EXTENSIONS.has(ext)) return fail(`${label} must be PNG, JPEG, WebP or SVG`);
  if (statSync(file).size > MAX_ASSET_BYTES) return fail(`${label} is larger than 5 MiB`);

  let width;
  let height;
  if (ext === '.svg') {
    const viewBox = /viewBox="([^"]+)"/.exec(readFileSync(file, 'utf8'))?.[1];
    const parts = viewBox
      ?.trim()
      .split(/[\s,]+/)
      .map(Number);
    if (!parts || parts.length !== 4 || parts.some(Number.isNaN)) {
      return fail(`${label} SVG needs a numeric viewBox`);
    }
    width = parts[2];
    height = parts[3];
  } else {
    ({ height, width } = await sharp(file).metadata());
  }
  if (!width || !height) return fail(`${label} has no readable dimensions`);
  if (square && width !== height) fail(`${label} must be square (is ${width}x${height})`);
  if (square && width < MIN_ICON_PX)
    fail(`${label} must be at least ${MIN_ICON_PX}x${MIN_ICON_PX}`);
};

const checkSkill = (value) => {
  const file = resolveAsset('onboardingSkill', value);
  if (!file) return;
  const frontmatter = /^---\n([\S\s]*?)\n---\n/.exec(readFileSync(file, 'utf8'))?.[1];
  if (!frontmatter) return fail('onboardingSkill SKILL.md needs YAML frontmatter');
  for (const key of ['name', 'description']) {
    if (!new RegExp(`^${key}:\\s*\\S`, 'm').test(frontmatter)) {
      fail(`onboardingSkill frontmatter is missing ${key}`);
    }
  }
};

const checkInterface = async (ui) => {
  checkString('interface.displayName', ui.displayName, 30);
  checkString('interface.shortDescription', ui.shortDescription, 30);
  checkString('interface.longDescription', ui.longDescription, 4000);
  checkString('interface.developerName', ui.developerName, 80);
  checkString('interface.category', ui.category, 80);
  for (const key of ['websiteURL', 'supportURL', 'privacyPolicyURL', 'termsOfServiceURL']) {
    checkUrl(`interface.${key}`, ui[key]);
  }

  const capabilities = ui.capabilities;
  if (!Array.isArray(capabilities)) fail('interface.capabilities must be an array');
  else {
    if (capabilities.length > 20)
      fail(`interface.capabilities has ${capabilities.length} entries (max 20)`);
    capabilities.forEach((c, i) => checkString(`interface.capabilities[${i}]`, c, 120));
  }

  const prompts = ui.defaultPrompt;
  if (!Array.isArray(prompts)) fail('interface.defaultPrompt must be an array');
  else {
    if (prompts.length > 3) fail(`interface.defaultPrompt has ${prompts.length} entries (max 3)`);
    if (new Set(prompts).size !== prompts.length)
      fail('interface.defaultPrompt entries must be unique');
    prompts.forEach((p, i) => {
      checkString(`interface.defaultPrompt[${i}]`, p, 128);
      if (typeof p === 'string' && /(^|\s)@\w/.test(p))
        fail(`interface.defaultPrompt[${i}] must not @mention`);
    });
  }

  checkColor('interface.brandColor', ui.brandColor, '#FFFFFF');
  checkColor('interface.brandColorDark', ui.brandColorDark, '#212121');

  await checkImage('interface.logo', ui.logo, true);
  await checkImage('interface.composerIcon', ui.composerIcon, true);
  if (ui.logoDark !== undefined) await checkImage('interface.logoDark', ui.logoDark, true);
  if (ui.composerIconDark !== undefined)
    await checkImage('interface.composerIconDark', ui.composerIconDark, true);
  if (ui.screenshots !== undefined) {
    if (!Array.isArray(ui.screenshots)) fail('interface.screenshots must be an array');
    else
      for (const [i, s] of ui.screenshots.entries())
        await checkImage(`interface.screenshots[${i}]`, s, false);
  }
};

const checkReview = (review, tools) => {
  if (!review) return fail('com.openai.review is required for submission');
  for (const forbidden of ['test_credentials', 'reviewer_instructions']) {
    if (forbidden in review)
      fail(`review.${forbidden} must not be in the bundle; enter it in the dashboard`);
  }
  if (typeof review.commerce !== 'boolean') fail('review.commerce must be true or false');
  if (review.commerce === true)
    checkString('review.commerce_description', review.commerce_description, 4000);

  const toolNames = new Set(tools.map((t) => t.name));
  const positive = review.test_cases?.positive ?? [];
  const negative = review.test_cases?.negative ?? [];
  if (positive.length !== 5)
    fail(`review.test_cases.positive needs exactly 5 cases (has ${positive.length})`);
  if (negative.length !== 3)
    fail(`review.test_cases.negative needs exactly 3 cases (has ${negative.length})`);

  positive.forEach((c, i) => {
    for (const key of ['description', 'prompt', 'tools_triggered', 'expected_behavior']) {
      checkString(`review.test_cases.positive[${i}].${key}`, c[key], 4000);
    }
    if (typeof c.tools_triggered === 'string') {
      for (const name of c.tools_triggered.split(',').map((s) => s.trim())) {
        if (!toolNames.has(name))
          fail(`review.test_cases.positive[${i}] names unknown tool "${name}"`);
      }
    }
  });
  negative.forEach((c, i) => {
    checkString(`review.test_cases.negative[${i}].description`, c.description, 4000);
    checkString(`review.test_cases.negative[${i}].prompt`, c.prompt, 4000);
  });
};

const checkPublication = (publication) => {
  if (!publication) return;
  if (publication.countries !== undefined && !Array.isArray(publication.countries)) {
    fail('publication.countries must be an array (empty = no restriction)');
  }
  checkString('publication.release_notes', publication.release_notes, 4000, false);
  const translations = publication.translations;
  if (translations && typeof translations === 'object') {
    for (const [locale, t] of Object.entries(translations)) {
      checkString(`publication.translations.${locale}.title`, t?.title, 30, false);
      checkString(`publication.translations.${locale}.subtitle`, t?.subtitle, 30, false);
    }
  }
};

// Tool metadata OpenAI reads from the live server at review time and on its daily rescan.
const checkTools = (tools) => {
  if (tools.length === 0) fail('MCP server returned no tools');
  for (const tool of tools) {
    const label = `MCP tool ${tool.name}`;
    if (typeof tool.description !== 'string' || !tool.description.startsWith('Use this when'))
      fail(`${label} description must start with "Use this when"`);
    if (!tool.outputSchema) fail(`${label} needs an outputSchema`);
    const { destructiveHint, openWorldHint, readOnlyHint } = tool.annotations ?? {};
    if ([destructiveHint, openWorldHint, readOnlyHint].some((v) => typeof v !== 'boolean')) {
      fail(`${label} must set readOnlyHint, destructiveHint and openWorldHint`);
    }
    for (const key of ['openai/toolInvocation/invoking', 'openai/toolInvocation/invoked']) {
      checkString(`${label} _meta.${key}`, tool._meta?.[key], 64);
    }
  }
};

// Wording OpenAI review rejects: gambling, credits and upsells, trade execution or
// prefilled trade links, and promotional claims. Field names (`required`) are skipped.
const REVIEW_FORBIDDEN =
  /prediction|polymarket|kalshi|credit|upgrade|subscribe|create_\w+_link|\bbest\b|recommend|guarantee|deep link|prefilled|open the swap/i;

const stringValues = (value, key = '') => {
  if (key === 'required') return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((v) => stringValues(v));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => stringValues(v, k));
  }
  return [];
};

const checkWording = (label, value) => {
  for (const text of stringValues(value)) {
    const match = REVIEW_FORBIDDEN.exec(text)?.[0];
    if (match)
      fail(`${label} contains "${match}", which OpenAI review rejects: ${text.slice(0, 80)}`);
  }
};

// Listing copy that names another AI assistant, model or platform draws the metadata
// finding "The plugin's name or description references another AI assistant, model,
// or platform". The package `name` and the MCP key are identifiers and stay exempt.
const OTHER_ASSISTANT =
  /\b(?:copilot|chatgpt|gpt(?:-?\d[\w.]*)?|openai|claude|anthropic|gemini|bard|grok|perplexity|deepseek|siri|alexa|cortana)\b/i;

const checkAssistantNames = (label, value) => {
  for (const text of stringValues(value)) {
    const match = OTHER_ASSISTANT.exec(text)?.[0];
    if (match)
      fail(`${label} names "${match}"; listing copy must not reference another AI assistant`);
  }
};

const lockFrom = (tools) =>
  tools.map((t) => ({
    inputProperties: Object.keys(t.inputSchema?.properties ?? {}).sort(),
    name: t.name,
    required: [...(t.inputSchema?.required ?? [])].sort(),
  }));

// A published plugin keeps working only if every tool, argument and optional
// argument it was approved with still exists, and nothing optional became required.
const checkBackwardCompatibility = (tools) => {
  if (!existsSync(LOCK_PATH))
    return fail(`${path.relative(ROOT, LOCK_PATH)} is missing; run with --update-lock`);
  const current = new Map(lockFrom(tools).map((t) => [t.name, t]));
  for (const locked of readJson(LOCK_PATH)) {
    const tool = current.get(locked.name);
    if (!tool) {
      fail(`MCP tool ${locked.name} was removed; published clients still call it`);
      continue;
    }
    for (const prop of locked.inputProperties) {
      if (!tool.inputProperties.includes(prop))
        fail(`MCP tool ${locked.name} lost input "${prop}"`);
    }
    for (const req of tool.required) {
      if (!locked.required.includes(req)) fail(`MCP tool ${locked.name} now requires "${req}"`);
    }
  }
};

const listFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });

const checkForbiddenFiles = (files) => {
  for (const file of files) {
    const rel = path.relative(PLUGIN_DIR, file);
    if (rel.startsWith('hooks') || rel.endsWith('.app.json')) {
      fail(`${rel} is not allowed in a ChatGPT plugin bundle`);
    }
  }
};

const checkMcpConfig = (mcp) => {
  const servers = Object.values(mcp.mcpServers ?? {});
  if (servers.length === 0) fail('mcp.json must declare one server under mcpServers');
  for (const server of servers) {
    if (server.type !== 'streamable-http') fail('mcp.json servers must use streamable-http');
    checkUrl('mcp.json server url', server.url);
    // The portal reads the connection's auth mode only from this field; without it the
    // MCP shows "Configuration incomplete" / "Authentication Unavailable" and never scans.
    if (server.extensions?.['com.openai']?.auth?.type !== 'none')
      fail('mcp.json servers must declare extensions["com.openai"].auth.type "none"');
    if (server.headers && Object.keys(server.headers).length > 0)
      fail('mcp.json servers must not send headers (public submission rejects them)');
  }
  return servers[0]?.url;
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async () => {
  const manifest = readJson(path.join(PLUGIN_DIR, 'plugin.json'));
  const mcp = readJson(path.join(PLUGIN_DIR, 'mcp.json'));
  const serverUrl = process.env.MCP_URL || checkMcpConfig(mcp);
  if (!serverUrl) {
    process.stderr.write('No MCP server URL: set one in mcp.json or MCP_URL\n');
    process.exit(1);
  }

  let live;
  try {
    live = await fetchLiveMetadata(serverUrl, 'sperax-plugin-build');
  } catch (error) {
    process.stderr.write(`Could not read tool metadata from the MCP server:\n  ${error.message}\n`);
    process.exit(1);
  }
  const { instructions, tools } = live;

  if (args.has('--update-lock')) {
    writeFileSync(LOCK_PATH, `${JSON.stringify(lockFrom(tools), null, 2)}\n`);
    process.stdout.write(`Wrote ${path.relative(ROOT, LOCK_PATH)} (${tools.length} tools)\n`);
    return;
  }

  const openai = manifest.extensions?.['com.openai'];

  if (manifest.name !== PLUGIN_NAME) fail(`plugin.json name must be ${PLUGIN_NAME}`);
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? ''))
    fail('plugin.json version must be semver x.y.z');
  if (process.env.MCP_URL) checkMcpConfig(mcp);
  if (!openai) fail('plugin.json needs extensions["com.openai"]');
  else {
    if (!openai.interface) fail('com.openai.interface is required');
    else await checkInterface(openai.interface);
    checkSkill(openai.onboardingSkill);
    checkReview(openai.review, tools);
    checkPublication(openai.publication);
  }
  checkTools(tools);
  checkBackwardCompatibility(tools);

  const files = listFiles(PLUGIN_DIR).filter((f) => path.basename(f) !== 'README.md');
  checkForbiddenFiles(files);

  checkWording('plugin.json', manifest);
  for (const tool of tools) checkWording(`MCP tool ${tool.name}`, tool);
  for (const file of files.filter((f) => f.endsWith('.md'))) {
    const rel = path.relative(PLUGIN_DIR, file);
    const text = readFileSync(file, 'utf8');
    checkWording(rel, text);
    checkAssistantNames(rel, text);
  }
  checkAssistantNames('plugin.json description', manifest.description);
  checkAssistantNames('plugin.json interface', openai?.interface);
  checkAssistantNames('MCP server instructions', instructions);
  for (const tool of tools) {
    checkAssistantNames(`MCP tool ${tool.name}`, [tool.title, tool.description]);
  }

  if (errors.length > 0) {
    process.stderr.write(
      `ChatGPT plugin validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    `${PLUGIN_NAME}@${manifest.version}: valid (${files.length} files, ${tools.length} live tools from ${serverUrl})\n`,
  );
  if (args.has('--check')) return;

  const entries = Object.fromEntries(
    files.map((f) => [path.relative(PLUGIN_DIR, f).split(path.sep).join('/'), readFileSync(f)]),
  );
  mkdirSync(DIST_DIR, { recursive: true });
  const out = path.join(DIST_DIR, `${PLUGIN_NAME}-${manifest.version}.zip`);
  writeFileSync(out, zipSync(entries, { level: 9 }));
  process.stdout.write(`Wrote ${path.relative(ROOT, out)}\n`);
};

await main();
