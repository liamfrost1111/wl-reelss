// node render.js config.json out.mp4 [seed]
// Renders scene.html frame by frame with Playwright, adds an original lofi bed, encodes H.264 for Reels/TikTok.
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');

(async () => {
  const [cfgPath, out, seedArg] = process.argv.slice(2);
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const FPS = 30, D = cfg.dur || 10, N = Math.round(FPS * D);
  const seed = seedArg || String(Math.floor(Date.now() / 86400000));
  const dir = __dirname, tmp = fs.mkdtempSync('/tmp/reel-');
  const wav = path.join(tmp, 'm.wav');
  execFileSync('python3', [path.join(dir, 'tools/lofi.py'), wav, String(D + 0.5), seed]);

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] }).catch(() => chromium.launch());
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.goto('file://' + path.join(dir, 'scene.html'));
  await page.evaluate(c => { window.CFG = Object.assign(window.CFG, c); return window.ready; }, cfg);

  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p',
    '-profile:v', 'high', '-r', String(FPS), '-c:a', 'aac', '-b:a', '128k', '-af', 'volume=0.55', '-shortest', '-movflags', '+faststart', out],
    { stdio: ['pipe', 'inherit', 'inherit'] });

  for (let i = 0; i < N; i++) {
    await page.evaluate(t => window.renderAt(t), i / FPS);
    const buf = await page.locator('#c').screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', code => code === 0 ? res() : rej(new Error('ffmpeg ' + code))));
  // poster frame for HQ previews
  await page.evaluate(t => window.renderAt(t), Math.min(4.5, D / 2));
  await page.locator('#c').screenshot({ type: 'jpeg', quality: 80, path: out.replace(/\.mp4$/, '.jpg') });
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('ok', out);
})().catch(e => { console.error(e); process.exit(1); });
