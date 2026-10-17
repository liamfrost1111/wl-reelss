"""Voiceover for WL reels. Free, offline (Kokoro, Apache-2.0 model).
Usage: python3 tools/tts.py config.json outdir
Writes outdir/seg<i>.wav for every segment with a "say" line and outdir/durations.json.
"""
import sys, json, os, soundfile as sf
from kokoro_onnx import Kokoro

cfg = json.load(open(sys.argv[1])); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
here = os.path.dirname(os.path.abspath(__file__)); mdir = os.path.join(here, "..", "models")
k = Kokoro(os.path.join(mdir, "kokoro-v1.0.int8.onnx"), os.path.join(mdir, "voices-v1.0.bin"))
voice = cfg.get("voice", "bm_george"); speed = float(cfg.get("speed", 1.08))
durs = []
for i, seg in enumerate(cfg["segments"]):
    text = seg.get("say", "").strip()
    if not text:
        durs.append(float(seg.get("hold", 1.2))); continue
    s, sr = k.create(text, voice=voice, speed=speed, lang="en-gb")
    sf.write(os.path.join(out, f"seg{i}.wav"), s, sr)
    durs.append(len(s) / sr)
json.dump(durs, open(os.path.join(out, "durations.json"), "w"))
print("ok", [round(d, 2) for d in durs])
