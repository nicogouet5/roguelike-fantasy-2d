import { describe, expect, it } from 'vitest';
import { getBossAttackCue, getBossMotion } from '../src/game/bossVisuals.ts';

describe('Bodoque Hoja-Abisal visual grammar', () => {
  it('gives its signature attacks distinct anticipation families', () => {
    expect(getBossAttackCue('boss_odachi_cleave').family).toBe('cleave');
    expect(getBossAttackCue('boss_tidal_barrage').family).toBe('volley');
    expect(getBossAttackCue('boss_abyssal_leap').family).toBe('leap');
    expect(getBossAttackCue('boss_maelstrom').family).toBe('ritual');
  });

  it('uses a compressed leap and a forward cleave without changing combat coordinates', () => {
    const leapWindup = getBossMotion({
      attackSkillId: 'boss_abyssal_leap',
      attackProgress: 0.25,
      moving: false,
      walkPhase: 0,
      phase: 1,
      hitFlashMs: 0,
    });
    const cleaveImpact = getBossMotion({
      attackSkillId: 'boss_odachi_cleave',
      attackProgress: 0.56,
      moving: false,
      walkPhase: 0,
      phase: 1,
      hitFlashMs: 0,
    });

    expect(leapWindup.scaleY).toBeLessThan(0.85);
    expect(leapWindup.offsetY).toBeGreaterThan(0);
    expect(cleaveImpact.offsetX).toBeGreaterThan(0);
    expect(cleaveImpact.shadowScale).toBeGreaterThan(1);
  });

  it('adds a readable hit recoil and phase-two idle presence', () => {
    const hit = getBossMotion({
      attackSkillId: 'boss_hydro_wave',
      attackProgress: 0.62,
      moving: false,
      walkPhase: 0,
      phase: 2,
      hitFlashMs: 80,
    });
    const phaseTwoIdle = getBossMotion({
      moving: false,
      walkPhase: 0,
      phase: 2,
      hitFlashMs: 0,
    });

    expect(hit.offsetX).toBeLessThan(0);
    expect(phaseTwoIdle.offsetY).toBe(-1);
    expect(phaseTwoIdle.scaleX).toBeGreaterThan(1);
  });
});
