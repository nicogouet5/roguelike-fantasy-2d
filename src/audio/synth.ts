import type { SfxKind } from '../core/types.ts';

type MusicMode = 'ambient' | 'boss';

/** Local Web Audio synthesis only: no samples, network calls, or music models. */
class DinoAudioManager {
  private ctx: AudioContext | null = null;
  private muted = false;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private musicMode: MusicMode = 'ambient';
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) this.createGraph();
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
    if (this.musicTimer === null && !this.muted) this.startMusic();
  }

  isMuted(): boolean { return this.muted; }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(this.muted ? 0.0001 : 0.72, this.ctx.currentTime, 0.025);
    }
    if (this.muted) this.stopMusic(); else this.startMusic();
    return this.muted;
  }

  setMusicMode(mode: MusicMode): void {
    if (this.musicMode === mode) return;
    this.musicMode = mode;
    this.musicStep = 0;
    if (!this.muted && this.ctx?.state === 'running') this.playModeSting(mode);
  }

  /** Renderer-level impact layer for impacts without a dedicated logic SFX event. */
  playImpact(heavy: boolean): void {
    if (heavy) {
      this.thump(84, 0.22, 0.12);
      this.noise(0.09, 0.11, 'bandpass', 820);
    } else {
      this.thump(155, 0.07, 0.045);
      this.noise(0.025, 0.035, 'bandpass', 1500);
    }
  }

  play(kind: SfxKind): void {
    switch (kind) {
      case 'greatsword': this.sweep(260, 62, 0.19, 'sawtooth', 0.11); this.noise(0.05, 0.06, 'highpass', 1350, 0.012); break;
      case 'katana': this.sweep(1250, 210, 0.11, 'triangle', 0.085); this.sweep(760, 180, 0.08, 'sine', 0.045, 0.018); break;
      case 'shield': this.thump(185, 0.16, 0.11); this.noise(0.05, 0.055, 'bandpass', 690, 0.02); break;
      case 'bow': this.sweep(760, 190, 0.12, 'triangle', 0.08); this.noise(0.025, 0.028, 'highpass', 2200); break;
      case 'magic': this.sweep(440, 880, 0.19, 'sine', 0.075); this.sweep(660, 1320, 0.16, 'triangle', 0.045, 0.045); break;
      case 'fire': this.noise(0.16, 0.12, 'bandpass', 490); this.sweep(220, 72, 0.2, 'sawtooth', 0.075); break;
      case 'wind': this.noise(0.12, 0.055, 'highpass', 1100); this.sweep(980, 380, 0.13, 'sine', 0.05); break;
      case 'slam': this.thump(112, 0.27, 0.16); this.noise(0.11, 0.08, 'bandpass', 420, 0.018); break;
      case 'roar': this.roar(0.24, false); break;
      case 'boss_phase': this.roar(0.48, true); break;
      case 'buff': this.sweep(340, 680, 0.15, 'triangle', 0.07); this.sweep(510, 1020, 0.18, 'sine', 0.055, 0.07); break;
      case 'levelup':
      case 'chest': [440, 554, 659, 880].forEach((note, index) => this.sweep(note, note, index === 3 ? 0.24 : 0.1, 'triangle', 0.07, index * 0.085)); break;
      case 'portal': this.sweep(210, 790, 0.31, 'sine', 0.085); this.noise(0.12, 0.035, 'highpass', 1800, 0.07); break;
      case 'hurt': this.thump(145, 0.13, 0.09); this.noise(0.035, 0.05, 'bandpass', 900); break;
      case 'hit':
      default: this.playImpact(false); break;
    }
  }

  private createGraph(): void {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.72;
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -22; compressor.knee.value = 16; compressor.ratio.value = 7; compressor.attack.value = 0.004; compressor.release.value = 0.18;
    this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.34;
    this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.9;
    this.musicBus.connect(this.master); this.sfxBus.connect(this.master); this.master.connect(compressor); compressor.connect(this.ctx.destination);
    this.noiseBuffer = this.makeNoiseBuffer(this.ctx);
  }

  private makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private getGraph(): { ctx: AudioContext; sfxBus: GainNode; musicBus: GainNode } | null {
    if (this.muted || !this.ctx || this.ctx.state !== 'running' || !this.sfxBus || !this.musicBus) return null;
    return { ctx: this.ctx, sfxBus: this.sfxBus, musicBus: this.musicBus };
  }

  private sweep(start: number, end: number, duration: number, type: OscillatorType, volume: number, delay = 0, music = false): void {
    const graph = this.getGraph();
    if (!graph) return;
    const now = graph.ctx.currentTime + delay;
    const osc = graph.ctx.createOscillator(); const gain = graph.ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(Math.max(25, start), now); osc.frequency.exponentialRampToValueAtTime(Math.max(25, end), now + duration);
    gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(volume, now + Math.min(0.025, duration * 0.22)); gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain); gain.connect(music ? graph.musicBus : graph.sfxBus); osc.start(now); osc.stop(now + duration + 0.02);
  }

  private noise(duration: number, volume: number, filterType: BiquadFilterType, frequency: number, delay = 0): void {
    const graph = this.getGraph();
    if (!graph || !this.noiseBuffer) return;
    const now = graph.ctx.currentTime + delay;
    const source = graph.ctx.createBufferSource(); const filter = graph.ctx.createBiquadFilter(); const gain = graph.ctx.createGain();
    source.buffer = this.noiseBuffer; filter.type = filterType; filter.frequency.value = frequency; filter.Q.value = 0.8;
    gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter); filter.connect(gain); gain.connect(graph.sfxBus); source.start(now); source.stop(now + duration + 0.02);
  }

  private thump(freq: number, duration: number, volume: number): void { this.sweep(freq, 36, duration, 'sine', volume); this.sweep(freq * 0.5, 30, duration * 0.82, 'triangle', volume * 0.55, 0.008); }
  private roar(duration: number, enraged: boolean): void {
    this.sweep(enraged ? 175 : 145, 48, duration, 'sawtooth', enraged ? 0.15 : 0.095);
    this.sweep(enraged ? 92 : 78, 38, duration * 0.9, 'square', enraged ? 0.07 : 0.045, 0.035);
    this.noise(duration * 0.72, enraged ? 0.085 : 0.045, 'bandpass', enraged ? 320 : 430, 0.03);
  }

  private startMusic(): void { if (typeof window === 'undefined' || this.musicTimer !== null) return; this.musicTimer = window.setInterval(() => this.tickMusic(), 360); this.tickMusic(); }
  private tickMusic(): void { if (!this.getGraph()) return; const step = this.musicStep++; if (this.musicMode === 'boss') this.tickBossMusic(step); else this.tickAmbientMusic(step); }
  private tickAmbientMusic(step: number): void {
    const bass = [73.42, 73.42, 65.41, 55, 73.42, 82.41, 65.41, 55][step % 8]!;
    if (step % 2 === 0) this.sweep(bass, bass * 0.992, 0.62, 'triangle', 0.042, 0, true);
    if (step % 8 === 0) { this.sweep(bass * 1.5, bass * 1.497, 1.8, 'sine', 0.022, 0.06, true); this.sweep(bass * 2, bass * 1.996, 1.3, 'sine', 0.012, 0.22, true); }
  }
  private tickBossMusic(step: number): void {
    const note = [73.42, 82.41, 87.31, 73.42, 65.41, 73.42, 98, 87.31][step % 8]!;
    this.sweep(note, note * 0.985, 0.22, 'sawtooth', 0.038, 0, true);
    if (step % 4 === 0) this.sweep(note * 0.5, 36, 0.28, 'triangle', 0.048, 0, true);
    if (step % 8 === 4) this.sweep(note * 2, note * 1.99, 0.36, 'triangle', 0.018, 0.04, true);
  }
  private playModeSting(mode: MusicMode): void { if (mode === 'boss') { this.sweep(146.83, 73.42, 0.34, 'sawtooth', 0.055, 0, true); this.sweep(220, 110, 0.3, 'triangle', 0.04, 0.05, true); } else this.sweep(110, 146.83, 0.32, 'sine', 0.04, 0, true); }
  private stopMusic(): void { if (this.musicTimer !== null) { window.clearInterval(this.musicTimer); this.musicTimer = null; } }
}

export const audioManager = new DinoAudioManager();
