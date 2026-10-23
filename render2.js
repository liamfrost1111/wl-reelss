// Voiceover ad reel. node render2.js config.json out.mp4 [seed]
// config: {voice, speed, music (background volume, default 0.16, 0 = none), crackle (vinyl crackle, default false), segments:[{say, show:"hook"|"notif"|"chat"|"office"|"cta", caption, accent, notifs, chat, contact, focus, button, sub}]}
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');

(async () => {
  const [cfgPath, out, seedArg] = process.argv.slice(2);
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const dir = __dirname, tmp = fs.mkdtempSync('/tmp/ad-'), FPS = 30;
  execFileSync('python3', [path.join(dir, 'tools/tts.py'), cfgPath, tmp], { stdio: 'inherit' });
  const durs = JSON.parse(fs.readFileSync(path.join(tmp, 'durations.json')));
  // timeline: short lead-in, small gaps, hold on the CTA
  let t = 0.35; const TL = cfg.segments.map((s, i) => { const seg = { ...s, start: t, end: t + durs[i] + (s.pad || 0.15) }; t = seg.end + 0.12; return seg; });
  TL[TL.length - 1].end += 1.6; const D = TL[TL.length - 1].end + 0.4, N = Math.round(D * FPS);

  // audio: voice segments placed on the timeline, lofi bed underneath (ducked)
  const music = path.join(tmp, 'm.wav');
  const musicVol = cfg.music === undefined ? 0.16 : Math.max(0, Number(cfg.music) || 0);
  if (musicVol > 0) execFileSync('python3', [path.join(dir, 'tools/lofi.py'), music, String(D + 0.5), seedArg || '1', cfg.crackle ? '1' : '0']);
  const ins = [], filt = []; let n = 0;
  TL.forEach((s, i) => { const f = path.join(tmp, `seg${i}.wav`); if (fs.existsSync(f)) { ins.push('-i', f); filt.push(`[${n}:a]aresample=44100,adelay=${Math.round(s.start * 1000)}|${Math.round(s.start * 1000)},volume=1.6[v${n}]`); n++; } });
  const vlabels = Array.from({ length: n }, (_, k) => `[v${k}]`).join('');
  if (musicVol > 0) {
    ins.push('-i', music); filt.push(`[${n}:a]volume=${musicVol}[mus]`);
    filt.push(`${vlabels}amix=inputs=${n}:normalize=0[vo]`, `[vo][mus]amix=inputs=2:normalize=0,alimiter=limit=0.95,atrim=0:${D.toFixed(2)}[aout]`);
  } else {
    filt.push(`${vlabels}amix=inputs=${n}:normalize=0,alimiter=limit=0.95,apad,atrim=0:${D.toFixed(2)}[aout]`);
  }
  const mix = path.join(tmp, 'mix.wav');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...ins, '-filter_complex', filt.join(';'), '-map', '[aout]', '-ac', '2', '-ar', '44100', mix]);

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.goto('file://' + path.join(dir, process.env.AD_HTML || 'ad.html'));
  await page.evaluate(tl => { window.TL = tl; return window.ready; }, TL);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-i', mix,
    '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-maxrate', '4500k', '-bufsize', '9000k', '-pix_fmt', 'yuv420p',
    '-profile:v', 'high', '-r', String(FPS), '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-shortest', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < N; i++) {
    await page.evaluate(x => window.renderAt(x), i / FPS);
    const buf = await page.locator('#c').screenshot({ type: 'jpeg', quality: 90 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg ' + c))));
  const posterT = (TL.find(s => s.show !== 'hook') || TL[0]).start + 1.2;
  await page.evaluate(x => window.renderAt(x), posterT);
  await page.locator('#c').screenshot({ type: 'jpeg', quality: 80, path: out.replace(/\.mp4$/, '.jpg') });
  await browser.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log('ok', out, D.toFixed(1) + 's');
})().catch(e => { console.error(e); process.exit(1); });
