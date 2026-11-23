import { describe, expect, it } from 'vitest';
import { BODOQUE_SCORE } from '../src/audio/synth.ts';

describe('Bodoque final-battle score', () => {
  it('uses a full sixteen-bar original progression in both phases', () => {
    expect(BODOQUE_SCORE.bpm).toBe(100);
    expect(BODOQUE_SCORE.stepsPerBar).toBe(8);
    expect(BODOQUE_SCORE.phaseOne).toHaveLength(BODOQUE_SCORE.barsPerCycle);
    expect(BODOQUE_SCORE.phaseTwo).toHaveLength(BODOQUE_SCORE.barsPerCycle);
    expect(new Set(BODOQUE_SCORE.phaseOne.map((bar) => bar.root)).size).toBeGreaterThan(3);
  });

  it('raises the rhythmic and melodic density for phase two', () => {
    const phaseOneNotes = BODOQUE_SCORE.phaseOne.flatMap((bar) => bar.melody).filter((note) => note !== null).length;
    const phaseTwoNotes = BODOQUE_SCORE.phaseTwo.flatMap((bar) => bar.melody).filter((note) => note !== null).length;

    expect(phaseTwoNotes).toBeGreaterThan(phaseOneNotes);
    expect(BODOQUE_SCORE.phaseTwo).not.toEqual(BODOQUE_SCORE.phaseOne);
  });
});
