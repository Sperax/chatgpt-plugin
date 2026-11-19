// Deterministic frame renderer: steps window.render(t) per frame and pipes PNGs to ffmpeg.
// Usage: node render.cjs stills 1.5 12.3 ...   |   node render.cjs video out.mp4 [fps]
const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');
const { once } = require('events');
const fs = require('fs');
const path = require('path');

(async () => {
  const [mode, ...rest] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => { console.error('PAGEERROR', e.message); process.exitCode = 1; });
  await page.goto('file://' + path.join(__dirname, 'index.html'));
  await page.evaluate(() => document.fonts.ready.then(() => Promise.all([...document.fonts].map((f) => f.load()))));
  const ok = await page.evaluate(() => document.fonts.check('700 40px Inter') && document.fonts.check('500 20px JB'));
  if (!ok) throw new Error('fonts failed to load');

  if (mode === 'stills') {
    fs.mkdirSync(path.join(__dirname, 'stills'), { recursive: true });
    for (const t of rest) {
      await page.evaluate((x) => window.render(x), Number(t));
      await page.screenshot({ path: path.join(__dirname, 'stills', `s_${t}.png`) });
    }
  } else {
    const out = rest[0];
    const fps = Number(rest[1] || 30);
    const duration = await page.evaluate(() => window.DURATION);
    const frames = Math.round(duration * fps);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
      { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let i = 0; i < frames; i++) {
      await page.evaluate((x) => window.render(x), i / fps);
      const buf = await page.screenshot({ type: 'png' });
      if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');
      if (i % 150 === 0) process.stderr.write(`frame ${i}/${frames}\n`);
    }
    ff.stdin.end();
    const [code] = await once(ff, 'close');
    if (code !== 0) throw new Error('ffmpeg exited ' + code);
    fs.writeFileSync(path.join(__dirname, 'sfx.json'), JSON.stringify(await page.evaluate(() => ({ ...window.SFX, duration: window.DURATION }))));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
