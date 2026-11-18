import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const SAMPLE_RATE = 22050;

function encodeWav16Mono(samples) {
  const numSamples = samples.length;
  const dataBytes = numSamples * 2;
  const buf = Buffer.alloc(44 + dataBytes);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // AudioFormat 1 = PCM
  buf.writeUInt16LE(1, 22); // Mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28); // ByteRate
  buf.writeUInt16LE(2, 32); // BlockAlign
  buf.writeUInt16LE(16, 34); // BitsPerSample
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return buf;
}

function synthCue(cue) {
  let durationSec = 0.2;
  if (cue === 'siren') durationSec = 0.85;
  else if (cue === 'gameover') durationSec = 0.95;
  else if (cue === 'victory') durationSec = 0.9;
  else if (cue === 'squelch') durationSec = 0.35;
  else if (cue === 'point') durationSec = 0.32;
  else if (cue === 'hazard') durationSec = 0.42;
  else if (cue === 'shot') durationSec = 0.28;
  else if (cue === 'cuff') durationSec = 0.22;
  else if (cue === 'tick') durationSec = 0.04;

  const len = Math.floor(SAMPLE_RATE * durationSec);
  const out = new Float32Array(len);
  let phase = 0;

  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const progress = i / len;
    const env = Math.min(1, i / 120) * Math.max(0, 1 - Math.pow(progress, 2));
    let v = 0;

    if (cue === 'siren') {
      const freq = 580 + 380 * Math.sin(t * Math.PI * 2.4);
      phase += (2 * Math.PI * freq) / SAMPLE_RATE;
      v = (Math.sin(phase) >= 0 ? 0.35 : -0.35) * env;
    } else if (cue === 'squelch') {
      if (t < 0.06 || (t > 0.08 && t < 0.14)) {
        v = Math.sin(2 * Math.PI * 1950 * t) * 0.35;
      } else {
        v = (Math.random() * 2 - 1) * 0.22 * (1 - progress);
      }
    } else if (cue === 'tick') {
      v = Math.sin(2 * Math.PI * 1100 * t) * 0.2 * (1 - progress);
    } else if (cue === 'cuff') {
      const click1 = t < 0.05 ? Math.sin(2 * Math.PI * 2400 * t) * (1 - t / 0.05) : 0;
      const click2 = t > 0.09 && t < 0.15 ? Math.sin(2 * Math.PI * 2700 * t) * (1 - (t - 0.09) / 0.06) : 0;
      v = (click1 + click2) * 0.45;
    } else if (cue === 'shot') {
      v = ((Math.random() * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * 110 * t) * 0.4) * Math.exp(-t * 16);
    } else if (cue === 'hazard') {
      const freq = Math.floor(t * 8) % 2 === 0 ? 880 : 620;
      v = (Math.sin(2 * Math.PI * freq * t) >= 0 ? 0.35 : -0.35) * env;
    } else if (cue === 'point') {
      const notes = [523.25, 659.25, 783.99];
      const idx = Math.min(2, Math.floor(progress * 3));
      const f = notes[idx];
      v = Math.sin(2 * Math.PI * f * t) * 0.35 * env;
    } else if (cue === 'gameover') {
      const notes = [293.66, 277.18, 261.63, 220.0];
      const idx = Math.min(3, Math.floor(progress * 4));
      const f = notes[idx];
      v = (Math.sin(2 * Math.PI * f * t) >= 0 ? 0.3 : -0.3) * env;
    } else if (cue === 'victory') {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      const idx = Math.min(3, Math.floor(progress * 4));
      const f = notes[idx];
      v = (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)) * 0.28 * env;
    }

    out[i] = v;
  }

  return encodeWav16Mono(out);
}

export const AUDIO_CUES = [
  'siren',
  'squelch',
  'tick',
  'cuff',
  'shot',
  'hazard',
  'point',
  'gameover',
  'victory',
];

export function createAudioEngine({
  enabled = true,
  cacheDir = '/tmp/precinct-84-audio',
} = {}) {
  let isAudioEnabled = Boolean(enabled);
  let lastCue = 'idle';
  let lastCueAt = 0;
  let assetsReady = false;
  const wavPaths = {};

  function ensureAssets() {
    if (assetsReady) return wavPaths;
    fs.mkdirSync(cacheDir, { recursive: true });
    for (const cue of AUDIO_CUES) {
      const target = path.join(cacheDir, `${cue}.wav`);
      if (!fs.existsSync(target)) {
        fs.writeFileSync(target, synthCue(cue));
      }
      wavPaths[cue] = target;
    }
    assetsReady = true;
    return wavPaths;
  }

  function play(cue) {
    if (!cue || !AUDIO_CUES.includes(cue)) return;
    lastCue = cue;
    lastCueAt = Date.now();
    if (!isAudioEnabled) return;

    try {
      const files = ensureAssets();
      const wavPath = files[cue];
      if (!wavPath) return;
      const child = spawn('ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', wavPath], {
        stdio: 'ignore',
        detached: true,
      });
      child.on('error', () => {
        // Silently degrade if ffplay or audio device is unavailable
      });
      child.unref();
    } catch {
      // Ignore audio failures so gameplay never interrupts
    }
  }

  function toggle() {
    isAudioEnabled = !isAudioEnabled;
    return isAudioEnabled;
  }

  function isEnabled() {
    return isAudioEnabled;
  }

  function getLastCue() {
    return { cue: lastCue, at: lastCueAt };
  }

  function getEqDisplay() {
    if (!isAudioEnabled) return 'MUTE';
    const recent = Date.now() - lastCueAt < 1200;
    return recent ? `♪ ${lastCue.toUpperCase()} ▂▄▆` : 'AUDIO ON';
  }

  return {
    ensureAssets,
    play,
    toggle,
    isEnabled,
    getLastCue,
    getEqDisplay,
  };
}
