import type { SfxKind } from '../core/types.ts';

class DinoAudioManager {
  private ctx: AudioContext | null = null;
  private muted = false;
  private bgmTimer: number | null = null;
  private bgmStep = 0;

  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (this.bgmTimer === null && !this.muted) {
      this.startBgm();
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.muted) this.stopBgm();
    else this.startBgm();
    return this.muted;
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    type: OscillatorType,
    volume: number,
    delaySec = 0
  ): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime + delaySec;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), now + durationSec);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec);
  }

  play(kind: SfxKind): void {
    if (this.muted) return;
    switch (kind) {
      case 'greatsword':
        this.playTone(220, 75, 0.17, 'sawtooth', 0.14);
        this.playTone(480, 180, 0.09, 'square', 0.06, 0.02);
        break;
      case 'katana':
        this.playTone(880, 260, 0.08, 'triangle', 0.11);
        this.playTone(1240, 420, 0.06, 'sawtooth', 0.05, 0.02);
        break;
      case 'shield':
        this.playTone(320, 140, 0.14, 'square', 0.12);
        break;
      case 'bow':
        this.playTone(620, 210, 0.09, 'triangle', 0.1);
        break;
      case 'magic':
      case 'fire':
        this.playTone(540, 160, 0.18, 'sawtooth', 0.1);
        this.playTone(300, 95, 0.2, 'triangle', 0.08, 0.03);
        break;
      case 'wind':
        this.playTone(720, 380, 0.12, 'sine', 0.09);
        break;
      case 'slam':
        this.playTone(130, 42, 0.24, 'sawtooth', 0.16);
        break;
      case 'roar':
      case 'boss_phase':
        this.playTone(190, 58, 0.38, 'sawtooth', 0.16);
        this.playTone(145, 48, 0.35, 'square', 0.1, 0.05);
        break;
      case 'buff':
        this.playTone(380, 680, 0.14, 'triangle', 0.1);
        this.playTone(540, 880, 0.16, 'triangle', 0.09, 0.08);
        break;
      case 'levelup':
      case 'chest':
        this.playTone(440, 440, 0.09, 'square', 0.09, 0);
        this.playTone(554, 554, 0.09, 'square', 0.09, 0.09);
        this.playTone(659, 659, 0.12, 'square', 0.1, 0.18);
        this.playTone(880, 880, 0.22, 'triangle', 0.12, 0.27);
        break;
      case 'portal':
        this.playTone(280, 740, 0.26, 'sine', 0.11);
        break;
      case 'hurt':
        this.playTone(170, 70, 0.12, 'square', 0.12);
        break;
      case 'hit':
      default:
        this.playTone(260, 110, 0.07, 'square', 0.07);
        break;
    }
  }

  private startBgm(): void {
    if (typeof window === 'undefined' || this.bgmTimer !== null) return;
    // Subtle prehistoric tribal/chiptune bassline pulse
    const notes = [110, 110, 130.8, 110, 146.8, 130.8, 98, 110];
    this.bgmTimer = window.setInterval(() => {
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
      const f = notes[this.bgmStep % notes.length]!;
      this.bgmStep += 1;
      this.playTone(f, f * 0.96, 0.14, 'triangle', 0.032);
    }, 280);
  }

  private stopBgm(): void {
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}

export const audioManager = new DinoAudioManager();
