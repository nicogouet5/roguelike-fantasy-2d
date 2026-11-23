import { describe, expect, it } from 'vitest';
import { getTriceratopsHornGrowth } from '../src/game/triceratopsHorns.ts';

describe('Triceratops horn visual growth', () => {
  it('derives each milestone from the current level, every four levels', () => {
    expect(getTriceratopsHornGrowth(1)).toMatchObject({ stage: 0, drawnLength: 0 });
    expect(getTriceratopsHornGrowth(3)).toMatchObject({ stage: 0, drawnLength: 0 });
    expect(getTriceratopsHornGrowth(4)).toMatchObject({ stage: 1, drawnLength: 2 });
    expect(getTriceratopsHornGrowth(7)).toMatchObject({ stage: 1, drawnLength: 2 });
    expect(getTriceratopsHornGrowth(8)).toMatchObject({ stage: 2, drawnLength: 4 });
    expect(getTriceratopsHornGrowth(12)).toMatchObject({ stage: 3, drawnLength: 6 });
  });

  it('caps only drawn length while preserving a visual signal for later milestones', () => {
    const capped = getTriceratopsHornGrowth(24);
    expect(capped).toMatchObject({ stage: 6, drawnLength: 12, overflowNotches: 0 });
    expect(getTriceratopsHornGrowth(28)).toMatchObject({ stage: 7, drawnLength: 12, overflowNotches: 1 });
  });
});
