import { useSettings } from '../config/settings';
import { bus } from '../game/eventBus';
import type { CharId } from '../game/types';

/* Per-fighter impact voicing: weight/timbre of punches & kicks. */
export interface PowerVoice { pitch: number; bright: number; sub: number }

export const POWER_VOICE: Record<CharId, PowerVoice> = {
  ryden: { pitch: 0.95, bright: 1.0, sub: 0.25 },
  kaito: { pitch: 1.08, bright: 1.3, sub: 0 },
  vesper: { pitch: 1.0, bright: 0.75, sub: 0.1 },
  gruun: { pitch: 0.68, bright: 0.6, sub: 0.55 },
  yuki: { pitch: 1.18, bright: 1.5, sub: 0 },
  ember: { pitch: 1.02, bright: 1.1, sub: 0.1 },
  volt: { pitch: 1.25, bright: 1.6, sub: 0 },
  nyx: { pitch: 0.85, bright: 0.55, sub: 0.3 },
  oracle: { pitch: 1.05, bright: 1.2, sub: 0.05 },
  slab: { pitch: 0.6, bright: 0.5, sub: 0.7 },
  sable: { pitch: 1.2, bright: 1.7, sub: 0 },
  hex: { pitch: 1.1, bright: 1.4, sub: 0 },
  solara: { pitch: 1.0, bright: 1.25, sub: 0.15 },
  fen: { pitch: 0.8, bright: 0.9, sub: 0.45 },
  zero: { pitch: 1.12, bright: 1.8, sub: 0.05 },
};

const IMPACT_NAMES = new Set(['punchL', 'punchH', 'kickL', 'kickH', 'zapHit', 'armorClang', 'whiff', 'whiffH', 'launchHit', 'bodyFall']);

/* ================================================================== */
/*  Fully procedural audio: every SFX is synthesized with the Web     */
/*  Audio API (noise bursts, sine thuds, filtered sweeps), plus a     */
/*  rain ambience loop and a small dark-synthwave music sequencer.    */
/* ================================================================== */

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private ambBus!: GainNode;
  private noiseBuf: AudioBuffer | null = null;
  private rainSrc: AudioBufferSourceNode | null = null;
  private musicTimer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private started = false;
  private off: (() => void) | null = null;

  init(): void {
    if (this.started) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.started = true;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.connect(this.master);
    this.ambBus = this.ctx.createGain();
    this.ambBus.connect(this.master);

    // white noise buffer
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.applyVolumes();
    useSettings.subscribe(() => this.applyVolumes());

    this.off = bus.on((e) => {
      if (e.type === 'sfx') this.play(e.name, e.gain ?? 1, e.pan ?? 0, e.char);
    });
  }

  dispose(): void {
    this.off?.();
    this.stopMusic();
    this.stopRain();
    this.ctx?.close();
    this.ctx = null;
    this.started = false;
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const s = useSettings.getState();
    this.master.gain.value = s.masterVolume;
    this.sfxBus.gain.value = s.sfxVolume;
    this.musicBus.gain.value = s.musicVolume * 0.5;
    this.ambBus.gain.value = s.sfxVolume * 0.8;
  }

  private now(): number { return this.ctx ? this.ctx.currentTime : 0; }

  private panner(pan: number): StereoPannerNode | null {
    if (!this.ctx) return null;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      return p;
    }
    return null;
  }

  private connectOut(node: AudioNode, pan: number): void {
    const p = this.panner(pan);
    if (p) { node.connect(p); p.connect(this.sfxBus); }
    else node.connect(this.sfxBus);
  }

  private tone(
    type: OscillatorType, f0: number, f1: number, dur: number,
    gain: number, pan = 0, attack = 0.002,
  ): void {
    if (!this.ctx) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    this.connectOut(g, pan);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private filteredNoise(dur: number, freq: number, q: number, gain: number, pan = 0, type: BiquadFilterType = 'bandpass', sweepTo?: number): void {
    if (!this.ctx || !this.noiseBuf) return;
    const t = this.now();
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g);
    this.connectOut(g, pan);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }

  play(name: string, gain = 1, pan = 0, char?: CharId): void {
    if (!this.ctx || this.ctx.state === 'suspended') return;
    if (name === 'power' && char) { this.playPower(char, gain, pan); return; }
    // per-fighter impact voicing + slight random detune (anti machine-gun)
    const V = char && IMPACT_NAMES.has(name) ? POWER_VOICE[char] : null;
    const jit = V ? 0.96 + Math.random() * 0.08 : 1;
    const P = (f: number) => f * (V ? V.pitch : 1) * jit;
    const B = (f: number) => f * (V ? V.bright : 1);
    if (V && V.sub > 0 && (name === 'punchH' || name === 'kickH' || name === 'launchHit')) {
      this.tone('sine', 62 * V.pitch, 30, 0.24, 0.5 * V.sub * gain, pan);
    }
    switch (name) {
      case 'punchL':
        this.tone('sine', P(160), P(60), 0.09, 0.55 * gain, pan);
        this.filteredNoise(0.06, B(2400), 1.2, 0.28 * gain, pan);
        break;
      case 'punchH':
        this.tone('sine', P(110), P(38), 0.18, 0.85 * gain, pan);
        this.tone('triangle', P(220), P(70), 0.1, 0.3 * gain, pan);
        this.filteredNoise(0.12, B(1700), 0.9, 0.45 * gain, pan);
        break;
      case 'kickL':
        this.tone('sine', P(140), P(52), 0.1, 0.6 * gain, pan);
        this.filteredNoise(0.07, B(3000), 1.4, 0.25 * gain, pan);
        break;
      case 'kickH':
        this.tone('sine', P(95), P(34), 0.2, 0.9 * gain, pan);
        this.filteredNoise(0.14, B(1400), 0.8, 0.5 * gain, pan);
        break;
      case 'block':
        this.filteredNoise(0.07, 3600, 2.5, 0.4 * gain, pan);
        this.tone('square', 420, 240, 0.05, 0.12 * gain, pan);
        break;
      case 'whiff':
        this.filteredNoise(0.12, 900, 0.7, 0.16 * gain, pan, 'bandpass', 2600);
        break;
      case 'whiffH':
        this.filteredNoise(0.2, 600, 0.6, 0.24 * gain, pan, 'bandpass', 2200);
        break;
      case 'zapHit':
        this.filteredNoise(0.16, 5200, 1.6, 0.4 * gain, pan, 'bandpass', 900);
        this.tone('sawtooth', 880, 110, 0.14, 0.22 * gain, pan);
        this.tone('sine', 130, 45, 0.14, 0.6 * gain, pan);
        break;
      case 'launchHit':
        this.tone('sine', 200, 40, 0.3, 0.9 * gain, pan);
        this.filteredNoise(0.25, 1200, 0.7, 0.5 * gain, pan, 'bandpass', 3400);
        break;
      case 'bodyFall':
        this.tone('sine', 80, 30, 0.25, 0.8 * gain, pan);
        this.filteredNoise(0.2, 500, 0.6, 0.35 * gain, pan);
        break;
      case 'land':
        this.filteredNoise(0.08, 700, 0.8, 0.3 * gain, pan);
        this.tone('sine', 90, 40, 0.09, 0.35 * gain, pan);
        break;
      case 'step':
        this.filteredNoise(0.05, 1500, 1.6, 0.1 * gain, pan);
        break;
      case 'stepSplash':
        this.filteredNoise(0.09, 4200, 1.1, 0.14 * gain, pan, 'bandpass', 1800);
        break;
      case 'dash':
        this.filteredNoise(0.16, 500, 0.5, 0.2 * gain, pan, 'bandpass', 2400);
        break;
      case 'jump':
        this.tone('sine', 240, 420, 0.09, 0.16 * gain, pan);
        break;
      case 'specialCharge':
        this.tone('sawtooth', 90, 420, 0.5, 0.16 * gain, pan, 0.15);
        this.filteredNoise(0.5, 400, 0.8, 0.14 * gain, pan, 'lowpass', 3200);
        break;
      case 'superActivate':
        this.tone('sawtooth', 60, 660, 0.75, 0.3 * gain, pan, 0.05);
        this.tone('square', 120, 880, 0.6, 0.12 * gain, pan, 0.1);
        this.filteredNoise(0.8, 300, 0.5, 0.25 * gain, pan, 'lowpass', 4200);
        break;
      case 'ko':
        this.tone('sine', 90, 24, 1.1, 1.0 * gain, pan);
        this.tone('sawtooth', 180, 40, 0.8, 0.25 * gain, pan, 0.01);
        this.filteredNoise(0.9, 800, 0.4, 0.55 * gain, pan, 'lowpass', 200);
        break;
      case 'thunder': {
        this.filteredNoise(1.8, 160, 0.3, 0.5 * gain, pan, 'lowpass');
        this.filteredNoise(0.5, 2400, 0.6, 0.16 * gain, pan, 'highpass');
        break;
      }
      case 'tick':
        this.tone('square', 1250, 1250, 0.04, 0.14 * gain, pan);
        break;
      case 'bell':
        this.tone('triangle', 660, 640, 0.5, 0.3 * gain, pan, 0.005);
        this.tone('triangle', 990, 962, 0.42, 0.18 * gain, pan, 0.005);
        break;
      case 'whooshBig':
        this.filteredNoise(0.35, 300, 0.5, 0.3 * gain, pan, 'bandpass', 1800);
        break;
      case 'victorySting':
        this.tone('sawtooth', 330, 330, 0.22, 0.2 * gain, 0, 0.01);
        window.setTimeout(() => this.tone('sawtooth', 440, 440, 0.22, 0.2 * gain, 0, 0.01), 140);
        window.setTimeout(() => this.tone('sawtooth', 660, 655, 0.5, 0.24 * gain, 0, 0.01), 280);
        break;
      case 'perfect':
        this.tone('triangle', 523, 523, 0.16, 0.2 * gain, 0, 0.008);
        window.setTimeout(() => this.tone('triangle', 659, 659, 0.16, 0.2 * gain, 0, 0.008), 110);
        window.setTimeout(() => this.tone('triangle', 784, 784, 0.16, 0.22 * gain, 0, 0.008), 220);
        window.setTimeout(() => this.tone('triangle', 1046, 1044, 0.5, 0.24 * gain, 0, 0.008), 330);
        break;
      case 'matchWin':
        this.tone('triangle', 392, 392, 0.3, 0.22 * gain, 0, 0.01);
        window.setTimeout(() => this.tone('triangle', 523, 523, 0.3, 0.22 * gain, 0, 0.01), 180);
        window.setTimeout(() => this.tone('triangle', 784, 780, 0.7, 0.26 * gain, 0, 0.01), 360);
        break;
      case 'ability':
        this.tone('triangle', 300, 900, 0.3, 0.3 * gain, pan, 0.01);
        this.tone('sine', 150, 450, 0.35, 0.25 * gain, pan, 0.01);
        this.filteredNoise(0.3, 800, 0.7, 0.2 * gain, pan, 'bandpass', 4200);
        break;
      case 'projectile':
        this.tone('sawtooth', 500, 140, 0.28, 0.24 * gain, pan, 0.005);
        this.filteredNoise(0.25, 2600, 1.1, 0.2 * gain, pan, 'bandpass', 700);
        break;
      case 'teleport':
        this.filteredNoise(0.22, 3800, 1.4, 0.3 * gain, pan, 'bandpass', 400);
        this.tone('sine', 880, 220, 0.2, 0.2 * gain, pan);
        break;
      case 'gravity':
        this.tone('sine', 180, 40, 0.5, 0.5 * gain, pan);
        this.filteredNoise(0.5, 400, 0.6, 0.25 * gain, pan, 'lowpass', 120);
        break;
      case 'armorClang':
        this.tone('square', 340, 240, 0.09, 0.3 * gain, pan);
        this.filteredNoise(0.14, 3200, 2.2, 0.35 * gain, pan);
        this.tone('triangle', 1250, 900, 0.12, 0.12 * gain, pan);
        break;
      case 'ui':
        this.tone('square', 720, 700, 0.05, 0.08 * gain, 0);
        break;
      case 'uiHover':
        this.tone('sine', 1150, 1140, 0.04, 0.05 * gain, 0);
        break;
      case 'rainOn':
        this.startRain();
        break;
      default:
        break;
    }
  }

  /** Unique activation voice per fighter (specials/supers/abilities). */
  playPower(char: CharId, gain = 1, pan = 0): void {
    if (!this.ctx) return;
    const t = (type: OscillatorType, f0: number, f1: number, dur: number, g: number, atk = 0.005) =>
      this.tone(type, f0, f1, dur, g * gain, pan, atk);
    const nz = (dur: number, f: number, q: number, g: number, type: BiquadFilterType = 'bandpass', to?: number) =>
      this.filteredNoise(dur, f, q, g * gain, pan, type, to);
    switch (char) {
      case 'ryden': t('sawtooth', 80, 340, 0.5, 0.3, 0.02); nz(0.45, 300, 0.6, 0.25, 'lowpass', 2600); t('sine', 160, 680, 0.4, 0.14, 0.02); break;
      case 'kaito': t('square', 1200, 240, 0.16, 0.16); nz(0.2, 5200, 1.4, 0.24, 'highpass'); t('sine', 320, 90, 0.22, 0.3); break;
      case 'vesper':
        [0, 90, 180].forEach((d, i) => window.setTimeout(() => t('sine', 180 + i * 90, 460 + i * 120, 0.14, 0.16, 0.01), d));
        nz(0.5, 420, 0.8, 0.2, 'lowpass', 900); break;
      case 'gruun': t('sine', 52, 26, 0.6, 0.6, 0.01); nz(0.5, 240, 0.5, 0.4, 'lowpass', 90); t('square', 84, 40, 0.24, 0.1); break;
      case 'yuki':
        [1200, 1800, 2430].forEach((f, i) => window.setTimeout(() => t('triangle', f, f * 1.02, 0.3, 0.09, 0.004), i * 55));
        nz(0.4, 6800, 2, 0.08, 'highpass'); break;
      case 'ember': nz(0.5, 400, 0.7, 0.3, 'bandpass', 3200); t('sine', 120, 300, 0.4, 0.18, 0.03); t('sawtooth', 240, 600, 0.35, 0.08, 0.05); break;
      case 'volt': t('sawtooth', 900, 180, 0.14, 0.2); nz(0.22, 4800, 1.2, 0.28, 'highpass'); t('square', 1800, 400, 0.08, 0.07); break;
      case 'nyx': t('sine', 320, 55, 0.7, 0.3, 0.28); nz(0.7, 260, 0.5, 0.25, 'lowpass'); break;
      case 'oracle': t('triangle', 660, 655, 0.7, 0.14, 0.02); t('triangle', 990, 985, 0.6, 0.1, 0.03); t('sine', 220, 218, 0.8, 0.12, 0.1); break;
      case 'slab': t('square', 92, 28, 0.4, 0.4); nz(0.3, 180, 0.6, 0.4, 'lowpass'); nz(0.5, 2300, 8, 0.1); break;
      case 'sable': nz(0.14, 6200, 1.4, 0.3, 'bandpass', 1400); nz(0.1, 5200, 1.6, 0.2, 'bandpass', 1200); break;
      case 'hex':
        [0, 55, 105, 160].forEach((d, i) => window.setTimeout(() => t('square', 300 + ((i * 397) % 900), 200 + ((i * 211) % 700), 0.05, 0.12), d));
        nz(0.2, 3000, 3, 0.14); break;
      case 'solara': t('sine', 220, 880, 0.5, 0.2, 0.02); t('triangle', 1760, 1740, 0.4, 0.06, 0.02); nz(0.4, 5200, 1.2, 0.1, 'highpass'); break;
      case 'fen': t('sawtooth', 70, 92, 0.35, 0.3, 0.02); t('sawtooth', 92, 60, 0.4, 0.28, 0.02); nz(0.4, 320, 0.7, 0.22, 'lowpass', 700); break;
      case 'zero':
        [440, 660, 880].forEach((f, i) => window.setTimeout(() => t('square', f, f, 0.07, 0.09), i * 65));
        t('sine', 2400, 1200, 0.35, 0.05, 0.01); break;
    }
  }

  /* ---------------- ambience ---------------- */

  startRain(): void {
    if (!this.ctx || !this.noiseBuf || this.rainSrc) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 240;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, this.now());
    g.gain.linearRampToValueAtTime(0.16, this.now() + 2.5);
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(this.ambBus);
    src.start();
    this.rainSrc = src;
  }

  stopRain(): void {
    if (!this.ctx || !this.rainSrc) return;
    try { this.rainSrc.stop(this.now() + 0.4); } catch { /* already stopped */ }
    this.rainSrc = null;
  }

  /* ---------------- music: minimal dark synthwave loop ---------------- */

  startMusic(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    this.nextNoteTime = this.now() + 0.1;
    this.step = 0;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 90);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private scheduleMusic(): void {
    if (!this.ctx) return;
    const bpm = 128;
    const spb = 60 / bpm / 4; // 16th notes
    while (this.nextNoteTime < this.now() + 0.25) {
      this.playStep(this.step, this.nextNoteTime);
      this.nextNoteTime += spb;
      this.step = (this.step + 1) % 64;
    }
  }

  private musicGainNode(dest: AudioNode, t: number, gain: number, dur: number, attack = 0.01): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(dest);
    return g;
  }

  private playStep(step: number, t: number): void {
    if (!this.ctx) return;
    const bar = Math.floor(step / 16);
    // Am — F — C — G (dark, driving)
    const roots = [55.0, 43.65, 32.7 * 2, 49.0]; // A1 F1 C2 G1
    const root = roots[bar % 4];
    const beat = step % 16;

    // kick on quarters
    if (beat % 4 === 0) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
      const g = this.musicGainNode(this.musicBus, t, 0.5, 0.16, 0.002);
      o.connect(g); o.start(t); o.stop(t + 0.2);
    }
    // hat on off-16ths
    if (beat % 4 === 2 && this.noiseBuf) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 7000;
      const g = this.musicGainNode(this.musicBus, t, 0.07, 0.045, 0.001);
      src.connect(hp); hp.connect(g);
      src.start(t, Math.random()); src.stop(t + 0.06);
    }
    // bass 16th drive
    if (beat % 2 === 0) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      const f = root * (beat % 8 === 6 ? 1.5 : 1);
      o.frequency.setValueAtTime(f, t);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(420, t);
      lp.frequency.exponentialRampToValueAtTime(160, t + 0.12);
      const g = this.musicGainNode(this.musicBus, t, 0.16, 0.13, 0.004);
      o.connect(lp); lp.connect(g);
      o.start(t); o.stop(t + 0.15);
    }
    // pad chord on bar start
    if (beat === 0) {
      const freqs = [root * 4, root * 5, root * 6.06];
      for (const f of freqs) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = (Math.random() - 0.5) * 12;
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 900;
        const g = this.musicGainNode(this.musicBus, t, 0.035, 1.9, 0.35);
        o.connect(lp); lp.connect(g);
        o.start(t); o.stop(t + 2.0);
      }
    }
  }
}

export const audio = new AudioEngine();
