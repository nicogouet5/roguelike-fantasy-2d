import type { SfxKind } from '../core/types.ts';

export type MusicMode = 'ambient' | 'boss';

/**
 * Original score material for Bodoque Hoja-Abisal.  A score cycle is sixteen
 * bars long (about 38 seconds at 100 BPM), deliberately long enough not to
 * read as a short UI loop.  Values are semitones relative to the chord root.
 */
export const BODOQUE_SCORE = {
  bpm: 100,
  barsPerCycle: 16,
  stepsPerBar: 8,
  phaseOne: [
    { root: 38, chord: [0, 3, 7, 14], melody: [14, null, 10, null, 7, null, 3, null] }, // Dm(add9)
    { root: 34, chord: [0, 4, 7, 11], melody: [11, null, 14, null, 16, null, 14, null] }, // Bbmaj7
    { root: 29, chord: [0, 4, 7, 14], melody: [12, null, 9, null, 7, null, 4, null] }, // F(add9)/A
    { root: 36, chord: [0, 2, 7, 14], melody: [14, null, 9, null, 7, null, 2, null] }, // Csus2
    { root: 38, chord: [0, 3, 7, 14], melody: [14, null, 15, null, 17, null, 14, null] },
    { root: 39, chord: [0, 4, 7, 11], melody: [11, null, 14, null, 18, null, 14, null] }, // Eb, sacred unease
    { root: 34, chord: [0, 4, 7, 11], melody: [14, null, 11, null, 7, null, 4, null] },
    { root: 45, chord: [0, 4, 7, 10], melody: [10, null, 7, null, 4, null, 1, null] }, // A7, held tension
    { root: 38, chord: [0, 3, 7, 14], melody: [14, null, 10, null, 7, null, 10, null] },
    { root: 34, chord: [0, 4, 7, 11], melody: [16, null, 14, null, 11, null, 14, null] },
    { root: 29, chord: [0, 4, 7, 14], melody: [12, null, 16, null, 19, null, 16, null] },
    { root: 36, chord: [0, 2, 7, 14], melody: [14, null, 12, null, 9, null, 7, null] },
    { root: 38, chord: [0, 3, 7, 14], melody: [14, null, 17, null, 15, null, 14, null] },
    { root: 39, chord: [0, 4, 7, 11], melody: [18, null, 16, null, 14, null, 11, null] },
    { root: 34, chord: [0, 4, 7, 11], melody: [14, null, 16, null, 18, null, 14, null] },
    { root: 45, chord: [0, 4, 7, 10], melody: [13, null, 10, null, 7, null, 4, null] },
  ],
  phaseTwo: [
    { root: 38, chord: [0, 3, 7, 13], melody: [13, 14, null, 10, null, 17, 14, null] },
    { root: 39, chord: [0, 4, 7, 11], melody: [14, null, 18, null, 16, 14, null, 11] },
    { root: 34, chord: [0, 4, 7, 11], melody: [16, null, 14, 11, null, 14, 16, null] },
    { root: 45, chord: [0, 4, 7, 10], melody: [13, null, 10, 7, null, 4, 7, null] },
    { root: 38, chord: [0, 3, 7, 14], melody: [17, null, 14, 15, null, 17, 19, null] },
    { root: 39, chord: [0, 4, 7, 11], melody: [18, 16, null, 14, 11, null, 14, 16] },
    { root: 34, chord: [0, 4, 7, 11], melody: [19, null, 16, 14, null, 11, 14, null] },
    { root: 45, chord: [0, 4, 7, 10], melody: [17, null, 13, 10, 7, null, 4, null] },
    { root: 38, chord: [0, 3, 7, 13], melody: [13, 14, null, 17, 14, null, 10, 14] },
    { root: 39, chord: [0, 4, 7, 11], melody: [18, null, 16, 14, null, 18, 16, null] },
    { root: 34, chord: [0, 4, 7, 11], melody: [16, 14, null, 11, 14, null, 16, 18] },
    { root: 45, chord: [0, 4, 7, 10], melody: [17, null, 13, 10, 7, 10, null, 13] },
    { root: 38, chord: [0, 3, 7, 14], melody: [21, null, 19, 17, null, 14, 17, null] },
    { root: 39, chord: [0, 4, 7, 11], melody: [18, 16, null, 14, 16, null, 18, 21] },
    { root: 34, chord: [0, 4, 7, 11], melody: [19, null, 18, 16, 14, null, 16, null] },
    { root: 45, chord: [0, 4, 7, 10], melody: [17, null, 13, 10, 7, null, 4, null] },
  ],
} as const;

type ScoreBar = {
  root: number;
  chord: readonly number[];
  melody: readonly (number | null)[];
};

const MUSIC_TICK_MS = 300;
const MUSIC_VOLUME = 0.26;
const hzFromMidi = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

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
  private cutscenePlaying = false;
  private musicStep = 0;
  private musicMode: MusicMode = 'ambient';
  private bossPhase: 1 | 2 = 1;
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
    this.startMusic();
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
    // GameScene calls this when the final map loads and calls it once more for
    // the existing `boss_phase` event.  Keeping this behaviour here means the
    // score can grow at phase two without coupling audio to combat internals.
    if (this.musicMode === mode) {
      if (mode === 'boss' && this.bossPhase === 1) {
        this.bossPhase = 2;
        this.musicStep = 0;
        if (!this.muted && this.ctx?.state === 'running') this.playBossPhaseSting();
      }
      return;
    }
    this.musicMode = mode;
    this.bossPhase = 1;
    this.musicStep = 0;
    if (!this.cutscenePlaying && !this.muted && this.ctx?.state === 'running') this.playModeSting(mode);
  }

  setCutscenePlaying(active: boolean): void {
    if (this.cutscenePlaying === active) return;
    this.cutscenePlaying = active;

    if (this.musicBus && this.ctx) {
      const now = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(now);
      if (active) this.musicBus.gain.setValueAtTime(0, now);
      else this.musicBus.gain.setTargetAtTime(MUSIC_VOLUME, now, 0.035);
    }

    if (active) this.stopMusic();
    else this.startMusic();
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
    // The score can carry several synthesized voices at once; leave ample
    // headroom for combat SFX before the final master compressor.
    this.musicBus.gain.value = this.cutscenePlaying ? 0 : MUSIC_VOLUME;
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
    if (typeof window === 'undefined' || !this.ctx || this.muted || this.cutscenePlaying || this.musicTimer !== null) return;
    this.musicTimer = window.setInterval(() => this.tickMusic(), MUSIC_TICK_MS);
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
    const phrase = this.bossPhase === 2 ? BODOQUE_SCORE.phaseTwo : BODOQUE_SCORE.phaseOne;
    const stepInBar = step % BODOQUE_SCORE.stepsPerBar;
    const bar = phrase[Math.floor(step / BODOQUE_SCORE.stepsPerBar) % phrase.length]!;
    const root = hzFromMidi(bar.root);
    const phaseTwo = this.bossPhase === 2;

    if (stepInBar === 0) {
      // The pad, bowed strings and vowel-formant choir establish a real
      // harmonic cadence, rather than a single repeated drone.
      this.playSacredPad(bar, phaseTwo ? 2.7 : 2.45, phaseTwo ? 0.021 : 0.017);
      this.playChoir(bar, phaseTwo ? 2.35 : 2.15, phaseTwo ? 0.016 : 0.013);
      this.playBass(root, phaseTwo ? 0.58 : 0.5, phaseTwo ? 0.047 : 0.035);
      this.playWarDrum(root, phaseTwo ? 0.11 : 0.075);
    }

    if (stepInBar === 4) {
      this.playBass(root, phaseTwo ? 0.46 : 0.38, phaseTwo ? 0.037 : 0.027);
      this.playWarDrum(root * 0.76, phaseTwo ? 0.075 : 0.048);
    }

    const melody = bar.melody[stepInBar] ?? null;
    if (melody !== null) {
      const note = hzFromMidi(bar.root + melody + 12);
      this.playString(note, phaseTwo ? 0.3 : 0.38, phaseTwo ? 0.019 : 0.014);
      if (phaseTwo && stepInBar % 2 === 0) this.playChoirNote(note * 0.5, 0.6, 0.008, 0.04);
    }

    if (phaseTwo) {
      // Phase two adds a restrained taiko subdivision and low choral pedal;
      // it raises stakes without masking attacks or becoming a harsh drone.
      if (stepInBar === 2 || stepInBar === 6) this.playWarDrum(root * 0.62, 0.046);
      const middleInterval = bar.chord[1];
      if (stepInBar % 2 === 0 && middleInterval !== undefined) {
        this.playString(hzFromMidi(bar.root + middleInterval + 12), 0.19, 0.011);
      }
      if (stepInBar === 0) this.playChoirNote(root * 0.5, 2.1, 0.012, 0.02);
    }
  }

  /** Soft, detuned low-passed oscillators suggest bowed strings without samples. */
  private playSacredPad(bar: ScoreBar, duration: number, volume: number): void {
    for (const interval of bar.chord.slice(0, 3)) {
      if (interval === undefined) continue;
      const freq = hzFromMidi(bar.root + interval + 12);
      this.playFilteredTone(freq, duration, volume, 'sawtooth', -5, 1450, 0.16);
      this.playFilteredTone(freq, duration * 0.96, volume * 0.7, 'triangle', 5, 1050, 0.2, 0.035);
    }
  }

  /** Formant-filtered synthesized vowel layer: an original ethereal choir. */
  private playChoir(bar: ScoreBar, duration: number, volume: number): void {
    for (const interval of [bar.chord[0], bar.chord[1], bar.chord[3]]) {
      if (interval === undefined) continue;
      this.playChoirNote(hzFromMidi(bar.root + interval + 24), duration, volume);
    }
  }

  private playChoirNote(freq: number, duration: number, volume: number, delay = 0): void {
    const graph = this.getGraph();
    if (!graph) return;
    const now = graph.ctx.currentTime + delay;
    const source = graph.ctx.createOscillator();
    const sourceGain = graph.ctx.createGain();
    const dry = graph.ctx.createGain();
    const formantA = graph.ctx.createBiquadFilter();
    const formantB = graph.ctx.createBiquadFilter();
    const formantAGain = graph.ctx.createGain();
    const formantBGain = graph.ctx.createGain();
    const output = graph.ctx.createGain();

    source.type = 'triangle';
    source.frequency.setValueAtTime(freq, now);
    source.detune.value = -3;
    formantA.type = 'bandpass';
    formantA.frequency.value = 760;
    formantA.Q.value = 2.2;
    formantB.type = 'bandpass';
    formantB.frequency.value = 1180;
    formantB.Q.value = 2.8;
    dry.gain.value = 0.28;
    formantAGain.gain.value = 0.38;
    formantBGain.gain.value = 0.24;
    const release = Math.min(0.5, duration * 0.3);
    output.gain.setValueAtTime(0.0001, now);
    output.gain.exponentialRampToValueAtTime(volume, now + Math.min(0.16, duration * 0.2));
    output.gain.setTargetAtTime(0.0001, now + duration - release, release / 4);

    source.connect(sourceGain);
    sourceGain.connect(dry);
    sourceGain.connect(formantA);
    sourceGain.connect(formantB);
    dry.connect(output);
    formantA.connect(formantAGain);
    formantB.connect(formantBGain);
    formantAGain.connect(output);
    formantBGain.connect(output);
    output.connect(graph.musicBus);
    source.start(now);
    source.stop(now + duration + 0.08);
  }

  private playFilteredTone(
    freq: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    detune: number,
    cutoff: number,
    attack: number,
    delay = 0
  ): void {
    const graph = this.getGraph();
    if (!graph) return;
    const now = graph.ctx.currentTime + delay;
    const source = graph.ctx.createOscillator();
    const filter = graph.ctx.createBiquadFilter();
    const gain = graph.ctx.createGain();
    source.type = type;
    source.frequency.setValueAtTime(freq, now);
    source.detune.value = detune;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, now);
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + Math.min(attack, duration * 0.3));
    gain.gain.setTargetAtTime(0.0001, now + duration * 0.62, Math.max(0.08, duration * 0.18));
    source.connect(filter);
    filter.connect(gain);
    gain.connect(graph.musicBus);
    source.start(now);
    source.stop(now + duration + 0.08);
  }

  private playString(freq: number, duration: number, volume: number): void {
    this.playFilteredTone(freq, duration, volume, 'sawtooth', 0, 2100, 0.025);
    this.playFilteredTone(freq * 2, duration * 0.75, volume * 0.24, 'triangle', 4, 2600, 0.018, 0.012);
  }

  private playBass(freq: number, duration: number, volume: number): void {
    this.playFilteredTone(freq * 0.5, duration, volume, 'triangle', 0, 320, 0.018);
    this.playFilteredTone(freq * 0.25, duration * 0.84, volume * 0.4, 'sine', 0, 180, 0.012, 0.01);
  }

  private playWarDrum(freq: number, volume: number): void {
    const graph = this.getGraph();
    if (!graph || !this.noiseBuffer) return;
    const now = graph.ctx.currentTime;
    const kick = graph.ctx.createOscillator();
    const kickGain = graph.ctx.createGain();
    const skin = graph.ctx.createBufferSource();
    const skinFilter = graph.ctx.createBiquadFilter();
    const skinGain = graph.ctx.createGain();
    kick.type = 'sine';
    kick.frequency.setValueAtTime(Math.max(42, freq), now);
    kick.frequency.exponentialRampToValueAtTime(42, now + 0.18);
    kickGain.gain.setValueAtTime(volume, now);
    kickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.27);
    skin.buffer = this.noiseBuffer;
    skinFilter.type = 'lowpass';
    skinFilter.frequency.value = 680;
    skinFilter.Q.value = 0.8;
    skinGain.gain.setValueAtTime(volume * 0.3, now);
    skinGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    kick.connect(kickGain);
    kickGain.connect(graph.musicBus);
    skin.connect(skinFilter);
    skinFilter.connect(skinGain);
    skinGain.connect(graph.musicBus);
    kick.start(now);
    skin.start(now);
    kick.stop(now + 0.3);
    skin.stop(now + 0.14);
  }

  private playModeSting(mode: MusicMode): void {
    if (mode === 'boss') {
      this.sweep(146.83, 73.42, 0.34, 'sawtooth', 0.055, 0, true);
      this.sweep(220, 110, 0.3, 'triangle', 0.04, 0.05, true);
    } else {
      this.sweep(110, 146.83, 0.32, 'sine', 0.04, 0, true);
    }
  }

  private playBossPhaseSting(): void {
    // A calm choral rise makes the transition legible before the denser
    // percussion arrives on the following bar.
    this.playChoirNote(hzFromMidi(50), 1.4, 0.026);
    this.playChoirNote(hzFromMidi(57), 1.2, 0.02, 0.12);
    this.playChoirNote(hzFromMidi(62), 1.0, 0.018, 0.24);
    this.playWarDrum(hzFromMidi(38), 0.09);
  }

  private stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}

export const audioManager = new DinoAudioManager();
