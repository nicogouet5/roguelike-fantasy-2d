import type { ElementName } from './types.ts';

export type ElementMatrix = Record<ElementName, Record<ElementName, number>>;

export function getElementMultiplier(
  matrix: ElementMatrix,
  attackElement: ElementName,
  targetElement: ElementName
): number {
  return matrix[attackElement]?.[targetElement] ?? 1.0;
}
