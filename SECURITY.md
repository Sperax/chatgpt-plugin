# Security policy

## Reporting a vulnerability

Email **security@sperax.io**, or open a private report through
[GitHub security advisories](https://github.com/nirholas/chatgpt-plugin/security/advisories/new).
Do not open a public issue for a vulnerability.

Include what you found, how to reproduce it and what an attacker could do with it. We acknowledge
reports within three business days and keep you updated until the issue is resolved.

## Scope

- The plugin package in [`sperax-trading-copilot/`](./sperax-trading-copilot/): manifest, MCP
  server declaration and skills.
- The build, validation and site scripts in [`scripts/`](./scripts/).
- The public MCP endpoint `https://chat.sperax.io/webapi/mcp/trading-copilot`, for example a tool
  that returns data it should not, accepts input it should reject, or can be made to act on
  anything other than public market data.

Out of scope: rate limiting working as designed (120 requests per minute per IP), reports from
automated scanners without a demonstrated impact, and the third-party data providers behind the
market feeds.

## Design notes

Every tool is read-only. None can place orders, sign transactions, hold keys or move funds, and the
endpoint requires no account, so it stores no user credentials.
