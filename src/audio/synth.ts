import type { SfxKind } from '../core/types.ts';

type MusicMode = 'ambient' | 'boss';

interface SfxBankEntry {
  files: string[];
  volume: number;
  pitchJitter?: number;
  minIntervalMs?: number;
}

const SFX_BANK: Record<SfxKind, SfxBankEntry> = {
  greatsword: {
    files: ['ashen_knight_heavy_attack_01.wav', 'ashen_knight_heavy_attack_02.wav'],
    volume: 0.42,
    pitchJitter: 0.06,
    minIntervalMs: 70,
  },
  katana: {
    files: ['ashen_knight_light_attack_01.wav', 'ashen_knight_light_attack_02.wav'],
    volume: 0.36,
    pitchJitter: 0.08,
    minIntervalMs: 55,
  },
  shield: {
    files: ['ashen_knight_shield_block_01.wav', 'ashen_knight_parry_01.wav'],
    volume: 0.4,
    pitchJitter: 0.06,
    minIntervalMs: 70,
  },
  bow: {
    files: ['longbow_shoot_01.wav', 'longbow_shoot_02.wav'],
    volume: 0.38,
    pitchJitter: 0.07,
    minIntervalMs: 55,
  },
  dash: {
    files: ['ashen_knight_dodge_roll_01.wav'],
    volume: 0.45,
    pitchJitter: 0.08,
    minIntervalMs: 80,
  },
  magic: {
    files: ['dark_sorcery_cast_01.wav'],
    volume: 0.36,
    pitchJitter: 0.07,
    minIntervalMs: 65,
  },
  fire: {
    files: ['fire_sorcery_cast_01.wav', 'fire_sorcery_explode_01.wav'],
    volume: 0.42,
    pitchJitter: 0.06,
    minIntervalMs: 75,
  },
  wind: {
    files: ['ancient_dragon_flap_wings_01.wav'],
    volume: 0.38,
    pitchJitter: 0.08,
    minIntervalMs: 70,
  },
  slam: {
    files: ['giant_knight_slam_01.wav'],
    volume: 0.48,
    pitchJitter: 0.05,
    minIntervalMs: 90,
  },
  roar: {
    files: ['ancient_dragon_roar_01.wav'],
    volume: 0.46,
    pitchJitter: 0.05,
    minIntervalMs: 120,
  },
  boss_phase: {
    files: ['giant_knight_roar_01.wav', 'ancient_dragon_roar_01.wav'],
    volume: 0.54,
    pitchJitter: 0.03,
    minIntervalMs: 200,
  },
  buff: {
    files: ['healing_miracle_cast_01.wav'],
    volume: 0.38,
    pitchJitter: 0.04,
    minIntervalMs: 90,
  },
  potion: {
    files: ['ashen_knight_drink_flask_01.wav'],
    volume: 0.48,
    pitchJitter: 0.04,
    minIntervalMs: 100,
  },
  hit: {
    files: [
      'longsword_hit_flesh_01.wav',
      'longsword_hit_flesh_02.wav',
      'longsword_hit_flesh_03.wav',
      'longsword_hit_armor_01.wav',
      'longbow_arrow_impact_01.wav',
    ],
    volume: 0.56,
    pitchJitter: 0.1,
    minIntervalMs: 24,
  },
  crit: {
    files: ['critical_blow_bone_crack_01.wav', 'critical_blow_blood_splatter_01.wav'],
    volume: 0.64,
    pitchJitter: 0.07,
    minIntervalMs: 35,
  },
  hurt: {
    files: ['ashen_knight_hurt_01.wav', 'ashen_knight_hurt_02.wav'],
    volume: 0.44,
    pitchJitter: 0.06,
    minIntervalMs: 110,
  },
  death: {
    files: ['you_died_01.wav'],
    volume: 0.56,
    minIntervalMs: 300,
  },
  victory: {
    files: ['enemy_felled_01.wav'],
    volume: 0.56,
    minIntervalMs: 300,
  },
  levelup: {
    files: ['level_up_01.wav'],
    volume: 0.48,
    minIntervalMs: 180,
  },
  chest: {
    files: ['treasure_chest_open_01.wav'],
    volume: 0.46,
    minIntervalMs: 150,
  },
  portal: {
    files: ['fog_gate_pass_01.wav'],
    volume: 0.48,
    minIntervalMs: 200,
  },
  pickup: {
    files: ['pick_up_item_01.wav'],
    volume: 0.4,
    pitchJitter: 0.05,
    minIntervalMs: 70,
  },
  ui_click: {
    files: ['click_01.wav'],
    volume: 0.34,
    pitchJitter: 0.04,
    minIntervalMs: 40,
  },
};

/** Combines Soulslike WAV SFX buffers with procedural dark-ambient & boss music mix. */
class DinoAudioManager {
  private ctx: AudioContext | null = null;
  private muted = false;
  private buffers = new Map<string, AudioBuffer>();
  private loadingStarted = false;
  private lastPlayedMs = new Map<SfxKind, number>();
  private variantCounter = new Map<SfxKind, number>();

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
    if (this.ctx && !this.loadingStarted) {
      this.loadingStarted = true;
      void this.preloadAll(this.ctx);
    }
    if (this.musicTimer === null && !this.muted) this.startMusic();
  }

  private async preloadAll(ctx: AudioContext): Promise<void> {
    const uniqueFiles = new Set<string>();
    for (const entry of Object.values(SFX_BANK)) {
      for (const f of entry.files) uniqueFiles.add(f);
    }
    await Promise.all(
      [...uniqueFiles].map(async (file) => {
        try {
          const res = await fetch(`./assets/sfx/${file}`);
          if (!res.ok) return;
          const arr = await res.arrayBuffer();
          const decoded = await ctx.decodeAudioData(arr);
          this.buffers.set(file, decoded);
        } catch {
          // Graceful fallback to procedural synth if a file fails to load
        }
      })
    );
  }

  isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(this.muted ? 0.0001 : 0.72, this.ctx.currentTime, 0.025);
    }
    if (this.muted) this.stopMusic();
    else this.startMusic();
    return this.muted;
  }

  setMusicMode(mode: MusicMode): void {
    if (this.musicMode === mode) return;
    this.musicMode = mode;
    this.musicStep = 0;
    if (!this.muted && this.ctx?.state === 'running') this.playModeSting(mode);
  }

  /** Punchy layered impact SFX triggered on every player hit (melee, ranged, crit, weakness). */
  playHitImpact(isCrit: boolean, isWeakness: boolean, isRanged = false): void {
    const graph = this.getGraph();
    if (!graph) return;

    const kind: SfxKind = isCrit ? 'crit' : 'hit';
    const nowMs = performance.now();
    const prevMs = this.lastPlayedMs.get(kind) ?? 0;
    const minInterval = isCrit ? 35 : 24;
    if (nowMs - prevMs < minInterval) return;
    this.lastPlayedMs.set(kind, nowMs);

    const entry = SFX_BANK[kind];
    let file: string;
    if (!isCrit && isRanged) {
      file = 'longbow_arrow_impact_01.wav';
    } else {
      const pool = isCrit ? entry.files : entry.files.slice(0, 4);
      const idx = this.variantCounter.get(kind) ?? 0;
      this.variantCounter.set(kind, idx + 1);
      file = pool[idx % pool.length]!;
    }

    const buffer = this.buffers.get(file);
    if (buffer) {
      const src = graph.ctx.createBufferSource();
      src.buffer = buffer;
      const jitter = entry.pitchJitter ?? 0.08;
      src.playbackRate.value = (isWeakness ? 1.08 : 1.0) + (Math.random() * 2 - 1) * jitter;
      const gain = graph.ctx.createGain();
      gain.gain.value = entry.volume;
      src.connect(gain);
      gain.connect(graph.sfxBus);
      src.start(0);
    }

    // Tactile sub-thump + crisp impact snap so every single hit cuts through the mix
    if (isCrit) {
      this.thump(130, 0.14, 0.16);
      this.noise(0.055, 0.11, 'bandpass', 1800);
    } else {
      this.thump(isRanged ? 190 : 155, 0.08, 0.1);
      this.noise(0.032, 0.065, 'bandpass', isRanged ? 2200 : 1450);
    }
    if (isWeakness) {
      this.sweep(620, 980, 0.08, 'triangle', 0.065);
    }
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
    const graph = this.getGraph();
    if (!graph) return;
    const entry = SFX_BANK[kind];
    if (!entry) return;

    const nowMs = performance.now();
    const prevMs = this.lastPlayedMs.get(kind) ?? 0;
    if (entry.minIntervalMs && nowMs - prevMs < entry.minIntervalMs) return;
    this.lastPlayedMs.set(kind, nowMs);

    const idx = this.variantCounter.get(kind) ?? 0;
    this.variantCounter.set(kind, idx + 1);
    const file = entry.files[idx % entry.files.length]!;
    const buffer = this.buffers.get(file);

    if (buffer) {
      const src = graph.ctx.createBufferSource();
      src.buffer = buffer;
      if (entry.pitchJitter) {
        src.playbackRate.value = 1 + (Math.random() * 2 - 1) * entry.pitchJitter;
      }
      const gain = graph.ctx.createGain();
      gain.gain.value = entry.volume;
      src.connect(gain);
      gain.connect(graph.sfxBus);
      src.start(0);
      return;
    }

    // Procedural fallback while WAVs decode
    switch (kind) {
      case 'greatsword':
        this.sweep(260, 62, 0.19, 'sawtooth', 0.11);
        this.noise(0.05, 0.06, 'highpass', 1350, 0.012);
        break;
      case 'katana':
        this.sweep(1250, 210, 0.11, 'triangle', 0.085);
        break;
      case 'shield':
        this.thump(185, 0.16, 0.11);
        break;
      case 'bow':
        this.sweep(760, 190, 0.12, 'triangle', 0.08);
        break;
      case 'magic':
        this.sweep(440, 880, 0.19, 'sine', 0.075);
        break;
      case 'fire':
        this.noise(0.16, 0.12, 'bandpass', 490);
        this.sweep(220, 72, 0.2, 'sawtooth', 0.075);
        break;
      case 'wind':
      case 'dash':
        this.noise(0.12, 0.055, 'highpass', 1100);
        this.sweep(980, 380, 0.13, 'sine', 0.05);
        break;
      case 'slam':
        this.thump(112, 0.27, 0.16);
        break;
      case 'roar':
        this.roar(0.24, false);
        break;
      case 'boss_phase':
        this.roar(0.48, true);
        break;
      case 'buff':
      case 'potion':
        this.sweep(340, 680, 0.15, 'triangle', 0.07);
        break;
      case 'levelup':
      case 'chest':
      case 'victory':
        [440, 554, 659, 880].forEach((note, i) =>
          this.sweep(note, note, i === 3 ? 0.24 : 0.1, 'triangle', 0.07, i * 0.085)
        );
        break;
      case 'portal':
        this.sweep(210, 790, 0.31, 'sine', 0.085);
        break;
      case 'hurt':
      case 'death':
        this.thump(145, 0.13, 0.09);
        break;
      default:
        this.playImpact(kind === 'crit');
        break;
    }
  }

  private createGraph(): void {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.72;
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -22;
    compressor.knee.value = 16;
    compressor.ratio.value = 7;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.34;
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(compressor);
    compressor.connect(this.ctx.destination);
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

  private sweep(
    start: number,
    end: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
    music = false
  ): void {
    const graph = this.getGraph();
    if (!graph) return;
    const now = graph.ctx.currentTime + delay;
    const osc = graph.ctx.createOscillator();
    const gain = graph.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(25, start), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(25, end), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + Math.min(0.025, duration * 0.22));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(music ? graph.musicBus : graph.sfxBus);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private noise(
    duration: number,
    volume: number,
    filterType: BiquadFilterType,
    frequency: number,
    delay = 0
  ): void {
    const graph = this.getGraph();
    if (!graph || !this.noiseBuffer) return;
    const now = graph.ctx.currentTime + delay;
    const source = graph.ctx.createBufferSource();
    const filter = graph.ctx.createBiquadFilter();
    const gain = graph.ctx.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(graph.sfxBus);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  private thump(freq: number, duration: number, volume: number): void {
    this.sweep(freq, 36, duration, 'sine', volume);
    this.sweep(freq * 0.5, 30, duration * 0.82, 'triangle', volume * 0.55, 0.008);
  }

  private roar(duration: number, enraged: boolean): void {
    this.sweep(enraged ? 175 : 145, 48, duration, 'sawtooth', enraged ? 0.15 : 0.095);
    this.sweep(enraged ? 92 : 78, 38, duration * 0.9, 'square', enraged ? 0.07 : 0.045, 0.035);
    this.noise(duration * 0.72, enraged ? 0.085 : 0.045, 'bandpass', enraged ? 320 : 430, 0.03);
  }

  private startMusic(): void {
    if (typeof window === 'undefined' || this.musicTimer !== null) return;
    this.musicTimer = window.setInterval(() => this.tickMusic(), 360);
    this.tickMusic();
  }

  private tickMusic(): void {
    if (!this.getGraph()) return;
    const step = this.musicStep++;
    if (this.musicMode === 'boss') this.tickBossMusic(step);
    else this.tickAmbientMusic(step);
  }

  private tickAmbientMusic(step: number): void {
    const bass = [73.42, 73.42, 65.41, 55, 73.42, 82.41, 65.41, 55][step % 8]!;
    if (step % 2 === 0) this.sweep(bass, bass * 0.992, 0.62, 'triangle', 0.042, 0, true);
    if (step % 8 === 0) {
      this.sweep(bass * 1.5, bass * 1.497, 1.8, 'sine', 0.022, 0.06, true);
      this.sweep(bass * 2, bass * 1.996, 1.3, 'sine', 0.012, 0.22, true);
    }
  }

  private tickBossMusic(step: number): void {
    const note = [73.42, 82.41, 87.31, 73.42, 65.41, 73.42, 98, 87.31][step % 8]!;
    this.sweep(note, note * 0.985, 0.22, 'sawtooth', 0.038, 0, true);
    if (step % 4 === 0) this.sweep(note * 0.5, 36, 0.28, 'triangle', 0.048, 0, true);
    if (step % 8 === 4) this.sweep(note * 2, note * 1.99, 0.36, 'triangle', 0.018, 0.04, true);
  }

  private playModeSting(mode: MusicMode): void {
    if (mode === 'boss') {
      this.sweep(146.83, 73.42, 0.34, 'sawtooth', 0.055, 0, true);
      this.sweep(220, 110, 0.3, 'triangle', 0.04, 0.05, true);
    } else {
      this.sweep(110, 146.83, 0.32, 'sine', 0.04, 0, true);
    }
  }

  private stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}

export const audioManager = new DinoAudioManager();
