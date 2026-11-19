# Sperax Trading Desk launch video

Source for the 43-second, 1920x1080 launch video for the Sperax Trading Desk plugin in ChatGPT. The animation is one HTML page with a deterministic `window.render(t)` function. Playwright renders it frame by frame, ffmpeg encodes the frames, and `audio.py` synthesizes the soundtrack from the same cue timings. The video uses no stock footage, samples or third-party logos.

The finished video is committed as [`sperax-trading-desk-chatgpt.mp4`](./sperax-trading-desk-chatgpt.mp4) (H.264, AAC, faststart). Rebuild it with the steps below.

## Storyboard

| Time (s) | Scene | Content |
|---|---|---|
| 1.0–9.75 | Prompt bar | Three trader questions typed into a chat bar |
| 9.85–11.7 | Headline | "Can ChatGPT check it first?" |
| 11.6–15.2 | Reply | "Now it can. With Sperax Trading Desk." with tool chips |
| 15.0–20.6 | BTC card | `get_derivatives_positioning`: long/short ratio, funding, crowding |
| 20.4–26.0 | SOL card | `build_trade_plan`: size, risk, R-multiple, take-profit ladder |
| 25.8–31.4 | PEPE card | `scan_token`: honeypot, tax, holders, liquidity, owner flags |
| 31.3–34.0 | Read-only | No exchange keys, no orders, no signing |
| 33.9–36.0 | Claim | "Check the trade before you take it." |
| 35.9–38.6 | Tools | 43 tools, with a marquee of tool names |
| 38.5–43.0 | End card | Wordmark, tagline, live-in-directory pill, disclaimer |

## Data

Every number on the three cards comes from a real call to the production MCP endpoint `https://chat.sperax.io/webapi/mcp/trading-copilot` on 17 Nov 2026. The raw JSON-RPC responses are in `data/`:

- `get_derivatives_positioning.json`: BTC positioning.
- `build_trade_plan.json`: SOL long plan, $100 risk.
- `scan.json`: PEPE contract scan, `0x6982508145454Ce325dDbE47a25d4ec3d2311933` on Ethereum.

For a new cut with fresh numbers, call the same tools again and update the matching values in `index.html`. Also update the capture date in the `#disc` disclaimer line.

## Build

The build needs Node.js 20 or later, ffmpeg, and Python 3 with numpy and scipy. Install Playwright and its Chromium from the repository root with `npm install` and `npx playwright install chromium`, then run from this directory:

```bash
node render.cjs stills 12 17 23 28 40          # spot-check frames -> stills/
node render.cjs video out_silent.mp4 30        # ~1,290 frames, also writes sfx.json
python3 audio.py sfx.json audio.wav            # soundtrack from the cue sheet
ffmpeg -y -i out_silent.mp4 -i audio.wav -c:v copy -c:a aac -b:a 192k -shortest \
  -movflags +faststart sperax-trading-desk-chatgpt.mp4
```

On a bare Linux host, Chromium may exit with code 127 because system libraries are missing. `npx playwright install-deps chromium` installs them.

## Soundtrack

`audio.py` generates everything in code:

- **Music:** an original D-major pad (Dmaj9, Bm9, Gmaj9, A6sus) with an eighth-note pluck arpeggio, and a 100 BPM kick, hi-hat and bass that come in on the headline.
- **Sound effects:** keystrokes, whooshes, pops, dings and impacts. Each lands on the timestamps the page exposes as `window.SFX`.
- **Mastering:** the mix is soft-limited to about -1 dBFS, around -15 LUFS integrated.

## Rules for edits

- Keep the closing disclaimer: educational analysis, not financial advice, read-only, data sources and capture date, and "ChatGPT is a trademark of OpenAI".
- Don't add OpenAI or exchange logos, and don't imply a partnership with OpenAI.
- Don't show price predictions. The cards show positioning, sizing and safety checks only.
- Fonts are Inter and JetBrains Mono, both under the SIL Open Font License 1.1, subset to Latin. The license text is in [`fonts/OFL.txt`](./fonts/OFL.txt).
