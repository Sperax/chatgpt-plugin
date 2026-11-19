# Contributing

This repository holds the ChatGPT plugin package for Sperax Trading Desk, the scripts that validate
and package it, the launch video source and the GitHub Pages site. The MCP server itself runs in
SperaxOS and is not part of this repository.

## Ways to help

- **Report a bug**: a tool returns wrong numbers, an install snippet fails in your client, or the
  site is broken. Use the [bug report](https://github.com/nirholas/chatgpt-plugin/issues/new?template=bug_report.yml).
- **Request a tool or data feed**: use the
  [tool request](https://github.com/nirholas/chatgpt-plugin/issues/new?template=tool_request.yml).
- **Improve the package, skills, scripts or docs**: open a pull request.

## Development

Requires Node.js 20.11 or later.

```bash
npm ci
npm run check                     # validate the package against the live endpoint
npx playwright install chromium   # once, for the site's social card
npm run site                      # build the Pages site into _site/
```

`npm run check` fails when the live tool list no longer matches `tool-metadata.lock.json`. If the
server changed on purpose, run `npm run update-lock` and commit the new lock file with your change.

## Pull requests

- Keep each pull request to one change, and say what it fixes or adds.
- Run `npm run check` before you push.
- Use a [gitmoji](https://gitmoji.dev) prefix in commit messages, for example `🐛 fix:` or `📝 docs:`.
- Tools are read-only by design. Changes that would let a tool place orders, sign transactions or
  move funds will not be accepted.

By contributing you agree that your contributions are licensed under the
[Apache License 2.0](./LICENSE).
