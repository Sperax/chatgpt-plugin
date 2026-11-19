"""Synthesize the launch video's soundtrack from the cue sheet written by render.cjs.

Usage: python3 audio.py sfx.json audio.wav
Everything is generated here (no samples): an original D-major pad, a soft 100 BPM pulse
that enters on the headline, and UI foley (keystrokes, whooshes, pops, dings, impacts)
placed on the exact timestamps the animation exposes as window.SFX.
"""
import json
import sys
import wave

import numpy as np
from scipy.signal import butter, sosfilt

SR = 48000
BPM = 100
BEAT = 60 / BPM
PULSE_IN = 9.85  # headline boom: drums enter
BREAK = (31.3, 33.95)  # read-only scene: drums drop out, pad carries
OUTRO = 38.55  # end card: drums stop, pad rings out

rng = np.random.default_rng(7)


def bandpass(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype='band', fs=SR, output='sos'), x)


def lowpass(x, f, order=2):
    return sosfilt(butter(order, f, btype='low', fs=SR, output='sos'), x)


def highpass(x, f, order=2):
    return sosfilt(butter(order, f, btype='high', fs=SR, output='sos'), x)


def place(buf, clip, t, gain=1.0, pan=0.0):
    i = int(round(t * SR))
    if i >= buf.shape[0]:
        return
    n = min(clip.shape[0], buf.shape[0] - i)
    left, right = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[i:i + n, 0] += clip[:n] * gain * left
    buf[i:i + n, 1] += clip[:n] * gain * right


def env_adsr(n, a, r):
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    e[:na] = np.linspace(0, 1, na) ** 2
    e[n - nr:] *= np.linspace(1, 0, nr) ** 2
    return e


def midi(m):
    return 440 * 2 ** ((m - 69) / 12)


# ---------- music ----------
CHORDS = [  # D major: Dmaj9, Bm9, Gmaj9, A6sus -> two bars each
    [50, 57, 61, 64, 66],
    [47, 54, 57, 61, 62],
    [43, 50, 54, 57, 62],
    [45, 52, 57, 59, 62],
]
BASS = [38, 35, 31, 33]


def pad_voice(freq, n, pan_seed):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for det in (-0.07, 0.0, 0.07):  # semitone detune for a wide chorus
        f = freq * 2 ** (det / 12)
        ph = rng.uniform(0, 2 * np.pi)
        lfo = 1 + 0.002 * np.sin(2 * np.pi * (0.13 + pan_seed * 0.05) * t)
        saw = 2 * ((f * lfo * t + ph / (2 * np.pi)) % 1) - 1
        out += 0.55 * saw + 0.45 * np.sin(2 * np.pi * f * lfo * t + ph)
    return out / 3


def music(dur):
    n = int(dur * SR)
    buf = np.zeros((n, 2))
    bar = 4 * BEAT
    seg = 2 * bar
    k = 0
    t0 = 0.0
    while t0 < dur:
        ln = min(seg + 1.2, dur - t0)  # overlap tails into the next chord
        m = int(ln * SR)
        e = env_adsr(m, 0.9, min(1.4, ln * 0.4))
        for j, note in enumerate(CHORDS[k % 4]):
            v = lowpass(pad_voice(midi(note), m, j), 1900) * e
            place(buf, v, t0, 0.055, pan=(j - 2) * 0.32)
        tb = np.arange(m) / SR
        bass = np.sin(2 * np.pi * midi(BASS[k % 4]) * tb) * env_adsr(m, 0.25, 0.8)
        if t0 >= PULSE_IN - 0.1:
            place(buf, bass, t0, 0.16)
        k += 1
        t0 += seg
    # gentle swell for the first two seconds, long fade on the end card
    fade = np.ones(n)
    fade[:int(2.0 * SR)] = np.linspace(0, 1, int(2.0 * SR)) ** 1.5
    tail = int((dur - OUTRO) * SR)
    fade[n - tail:] = np.linspace(1, 0, tail) ** 1.2
    return buf * fade[:, None]


def pluck(freq):
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    tone = sum(a * np.sin(2 * np.pi * freq * h * t) for h, a in ((1, 1), (2, 0.4), (3, 0.15)))
    return tone * np.exp(-t * 9) * np.minimum(1, t * 600)


def arp(dur):
    """Eighth-note chord-tone arpeggio: carries the intro before the drums, then sits underneath."""
    n = int(dur * SR)
    buf = np.zeros((n, 2))
    seg = 8 * BEAT
    t, i = 1.0, 0
    while t < OUTRO:
        notes = CHORDS[int(t // seg) % 4]
        note = notes[[1, 2, 3, 4, 3, 2][i % 6]] + 12
        gain = 0.075 if t < PULSE_IN else 0.035
        if not (BREAK[0] <= t < BREAK[1]) or t < PULSE_IN:
            place(buf, pluck(midi(note)), t, gain, pan=0.4 * np.sin(i * 0.7))
        t += BEAT / 2
        i += 1
    return buf


def kick():
    n = int(0.42 * SR)
    t = np.arange(n) / SR
    f = 46 + 84 * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 9) + 0.25 * lowpass(rng.standard_normal(n), 2500) * np.exp(-t * 180)


def hat():
    n = int(0.06 * SR)
    t = np.arange(n) / SR
    return highpass(rng.standard_normal(n), 8000, 4) * np.exp(-t * 70)


def drums(dur):
    n = int(dur * SR)
    buf = np.zeros((n, 2))
    duck = np.ones(n)
    k, h = kick(), hat()
    t = PULSE_IN
    i = 0
    while t < OUTRO - 0.05:
        if not (BREAK[0] <= t < BREAK[1]):
            place(buf, k, t, 0.42)
            a = int(t * SR)
            d = 1 - 0.38 * np.exp(-np.arange(int(0.35 * SR)) / SR * 9)
            duck[a:a + d.size] = np.minimum(duck[a:a + d.size], d[:max(0, n - a)])
            place(buf, h, t + BEAT / 2, 0.05, pan=0.35 if i % 2 else -0.35)
        t += BEAT
        i += 1
    return buf, duck


# ---------- foley ----------
def keystroke():
    n = int(0.03 * SR)
    t = np.arange(n) / SR
    click = bandpass(rng.standard_normal(n), 1800, 6500) * np.exp(-t * 260)
    thock = np.sin(2 * np.pi * rng.uniform(170, 230) * t) * np.exp(-t * 160) * 0.5
    return click + thock


def whoosh(length=0.55):
    n = int(length * SR)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    steps = 24  # sweep a band upward through the clip
    edges = np.linspace(0, n, steps + 1, dtype=int)
    for s in range(steps):
        c = 350 * (9 ** (s / steps))
        seg = bandpass(noise, c * 0.6, min(c * 1.7, SR / 2 - 100))[edges[s]:edges[s + 1]]
        out[edges[s]:edges[s + 1]] = seg
    x = np.linspace(0, 1, n)
    return out * np.sin(np.pi * x) ** 1.6


def pop():
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    f = 320 + 520 * np.exp(-t * 55)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 42)


def ding(f0=1318.5):
    n = int(1.3 * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for ratio, amp, dec in ((1, 1, 3.2), (2.0, 0.35, 5), (2.76, 0.22, 7), (5.4, 0.08, 12)):
        out += amp * np.sin(2 * np.pi * f0 * ratio * t) * np.exp(-t * dec)
    return out * np.minimum(1, t * 400)


def boom():
    n = int(2.2 * SR)
    t = np.arange(n) / SR
    f = 34 + 60 * np.exp(-t * 7)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.1)
    hit = lowpass(rng.standard_normal(n), 900) * np.exp(-t * 14) * 0.6
    air = highpass(rng.standard_normal(n), 4000) * np.exp(-t * 6) * 0.08
    return sub + hit + air


def riser(length=0.9):
    n = int(length * SR)
    x = np.linspace(0, 1, n)
    noise = rng.standard_normal(n)
    lo = bandpass(noise, 300, 2000) * (1 - x)
    hi = bandpass(noise, 2000, 9000) * x
    return (lo + hi) * x ** 2.5


def main():
    src, dst = sys.argv[1], sys.argv[2]
    cues = json.load(open(src))
    dur = float(cues['duration'])
    n = int(dur * SR)

    mus = music(dur)
    drm, duck = drums(dur)
    lift = np.ones(n)  # pad sits higher before the drums so the intro is not dead air
    a, b = int((PULSE_IN - 0.4) * SR), int(PULSE_IN * SR)
    lift[:a] = 2.2
    lift[a:b] = np.linspace(2.2, 1, b - a)
    mix = (mus * lift[:, None] + arp(dur)) * duck[:, None] + drm

    fx = np.zeros((n, 2))
    for t in cues['type']:
        place(fx, keystroke(), t + rng.uniform(-0.004, 0.004), rng.uniform(0.07, 0.11), pan=rng.uniform(-0.2, 0.2))
    for i, t in enumerate(cues['whoosh']):
        place(fx, whoosh(), t - 0.2, 0.16, pan=(-0.25 if i % 2 else 0.25))
    for t in cues['pop']:
        place(fx, pop(), t, 0.22)
    for t in cues['ding']:
        place(fx, ding(), t, 0.11)
        place(fx, ding(1975.5), t + 0.07, 0.05, pan=0.3)
    for t in cues['boom']:
        place(fx, riser(), t - 0.9, 0.09)
        place(fx, boom(), t, 0.5)

    out = mix + fx
    out = highpass(out.T, 25).T  # strip DC and inaudible sub rumble
    peak = np.max(np.abs(out))
    out = np.tanh(out / peak * 1.25) / np.tanh(1.25) * 0.89  # soft limiter, ~-1 dBFS ceiling
    pcm = (out * 32767).astype('<i2')
    with wave.open(dst, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f'wrote {dst}: {dur:.2f}s, {len(cues["type"])} keystrokes')


if __name__ == '__main__':
    main()
