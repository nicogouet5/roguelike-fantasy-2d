import type { SfxKind } from '../core/types.ts';

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
    files: ['longsword_hit_flesh_01.wav', 'longsword_hit_flesh_02.wav', 'plague_hound_bite_01.wav'],
    volume: 0.28,
    pitchJitter: 0.09,
    minIntervalMs: 65,
  },
  crit: {
    files: ['critical_blow_bone_crack_01.wav', 'critical_blow_blood_splatter_01.wav'],
    volume: 0.44,
    pitchJitter: 0.06,
    minIntervalMs: 80,
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

class DinoAudioManager {
  private ctx: AudioContext | null = null;
  private muted = false;
  private buffers = new Map<string, AudioBuffer>();
  private loadingStarted = false;
  private lastPlayedMs = new Map<SfxKind, number>();
  private variantCounter = new Map<SfxKind, number>();

  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (this.ctx && !this.loadingStarted) {
      this.loadingStarted = true;
      void this.preloadAll(this.ctx);
    }
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
    return this.muted;
  }

  private playSynthFallback(kind: SfxKind): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = kind === 'slam' || kind === 'roar' ? 'sawtooth' : 'triangle';
    const startFreq = kind === 'katana' || kind === 'bow' ? 640 : kind === 'slam' ? 140 : 320;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(45, startFreq * 0.4), now + 0.12);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  play(kind: SfxKind): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const entry = SFX_BANK[kind];
    if (!entry) return;

    const nowMs = performance.now();
    const prevMs = this.lastPlayedMs.get(kind) ?? 0;
    if (entry.minIntervalMs && nowMs - prevMs < entry.minIntervalMs) return;
    this.lastPlayedMs.set(kind, nowMs);

    // Cycle cleanly through variants when available
    const idx = this.variantCounter.get(kind) ?? 0;
    this.variantCounter.set(kind, idx + 1);
    const file = entry.files[idx % entry.files.length]!;
    const buffer = this.buffers.get(file);

    if (!buffer) {
      this.playSynthFallback(kind);
      return;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    if (entry.pitchJitter) {
      src.playbackRate.value = 1 + (Math.random() * 2 - 1) * entry.pitchJitter;
    }
    const gain = this.ctx.createGain();
    gain.gain.value = entry.volume;
    src.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(0);
  }
}

export const audioManager = new DinoAudioManager();
