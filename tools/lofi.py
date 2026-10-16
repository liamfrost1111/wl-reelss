"""Original lofi bed for WL reels. Pure synthesis, no samples, so no copyright.
Usage: python3 lofi.py out.wav SECONDS SEED
"""
import sys, numpy as np, wave

SR = 44100
out, secs, seed = sys.argv[1], float(sys.argv[2]), int(sys.argv[3]) if len(sys.argv) > 3 else 1
rng = np.random.default_rng(seed)
BPM = [72, 76, 80, 84][seed % 4]
beat = 60 / BPM
n = int(SR * secs)
t = np.arange(n) / SR
mix = np.zeros(n)

def lp(x, cut):  # one-pole low-pass
    a = np.exp(-2 * np.pi * cut / SR); y = np.zeros_like(x); s = 0.0
    for i in range(len(x)):
        s = (1 - a) * x[i] + a * s; y[i] = s
    return y

def place(sig, start):
    i = int(start * SR)
    if i >= n: return
    j = min(n, i + len(sig)); mix[i:j] += sig[: j - i]

def midi(m): return 440 * 2 ** ((m - 69) / 12)

# progressions (MIDI notes), all soft jazzy 7ths
PROGS = [
    [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]],   # Fmaj7 Em7 Dm7 Cmaj7
    [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]],   # Am7 Fmaj7 G7 Em7
    [[50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59], [57, 60, 64, 67]],   # Dm7 G7 Cmaj7 Am7
]
prog = PROGS[seed % len(PROGS)]

def epiano(freq, dur):
    tt = np.arange(int(SR * dur)) / SR
    env = np.exp(-tt * 1.6) * (1 - np.exp(-tt * 60))
    det = 1 + 0.003 * np.sin(2 * np.pi * 0.7 * tt)  # tape wobble
    s = (np.sin(2 * np.pi * freq * det * tt) + 0.35 * np.sin(2 * np.pi * 2 * freq * tt) * np.exp(-tt * 3)
         + 0.12 * np.sin(2 * np.pi * 3 * freq * tt) * np.exp(-tt * 5))
    return s * env

bar = 4 * beat
k = 0
while k * bar < secs:
    chord = prog[k % 4]
    for j, m in enumerate(chord):
        place(0.11 * epiano(midi(m), bar + 1.0), k * bar + j * 0.018)   # slight strum
    place(0.16 * epiano(midi(chord[0] - 12), bar), k * bar)             # bass
    k += 1

def kick():
    tt = np.arange(int(SR * 0.35)) / SR
    f = 50 + 70 * np.exp(-tt * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 9)
def snare():
    tt = np.arange(int(SR * 0.25)) / SR
    return lp(rng.standard_normal(len(tt)), 2500) * np.exp(-tt * 18)
def hat():
    tt = np.arange(int(SR * 0.06)) / SR
    x = rng.standard_normal(len(tt)); x = x - lp(x, 6000)
    return x * np.exp(-tt * 60)

K, Sn, H = kick(), snare(), hat()
b = 0
while b * beat < secs:
    tb = b * beat
    if b % 4 in (0, 2) or (b % 8 == 7):
        place(0.33 * K, tb + (0.5 * beat if b % 8 == 7 else 0))
    if b % 4 in (1, 3):
        place(0.16 * Sn, tb + 0.012)
    for h in range(2):  # swung 8ths
        place((0.05 if h == 0 else 0.035) * H, tb + h * beat * 0.58)
    b += 1

# vinyl crackle + hiss
crackle = np.zeros(n)
idx = rng.integers(0, n, int(secs * 14))
crackle[idx] = rng.uniform(-1, 1, len(idx))
mix += 0.12 * lp(crackle, 3000) + 0.006 * lp(rng.standard_normal(n), 1200)

mix = lp(mix, 5200)  # warm it up
fade = int(SR * 0.8)
mix[:fade] *= np.linspace(0, 1, fade); mix[-fade * 2:] *= np.linspace(1, 0, fade * 2)
mix /= np.max(np.abs(mix)) + 1e-9
mix *= 0.5
st = np.stack([mix, np.roll(mix, 220)], 1)  # tiny stereo width
pcm = (st * 32767).astype(np.int16)
with wave.open(out, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("ok", out, BPM)
