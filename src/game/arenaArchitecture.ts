import type Phaser from 'phaser';

export type RuinKind = 'retaining' | 'rubble' | 'pillar' | 'arch' | 'bastion';
const KINDS: RuinKind[] = ['retaining', 'rubble', 'pillar', 'arch', 'bastion'];
const MATERIALS = [
  { top: '#738b86', side: '#435f60', dark: '#293e49', mortar: '#203138', accent: '#e6a968', glow: '#fff0b3' },
  { top: '#8c8198', side: '#62516d', dark: '#382e48', mortar: '#2a2839', accent: '#bf6258', glow: '#ffb275' },
  { top: '#74889b', side: '#495d72', dark: '#2b354c', mortar: '#202b38', accent: '#e37262', glow: '#ffcc94' },
  { top: '#97a399', side: '#566b70', dark: '#344952', mortar: '#243841', accent: '#63a1ac', glow: '#bde2d8' },
];
type Pt = readonly [number, number];
const WIDTH = 64;
const HEIGHT = 72;

export function ruinKey(floor: number, kind: RuinKind): string {
  return `arena_${floor}_${kind}`;
}

export function buildArenaArchitecture(scene: Phaser.Scene): void {
  MATERIALS.forEach((m, floor) => KINDS.forEach(kind => {
    const key = ruinKey(floor, kind);
    if (scene.textures.exists(key)) return;
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d')!;
    const poly = (points: readonly Pt[], color: string): void => {
      ctx.fillStyle = color;
      ctx.beginPath();
      points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.closePath();
      ctx.fill();
    };
    const block = (x: number, y: number, w: number, d: number, h: number, offset = 0): void => {
      // y is the upper edge of the top diamond; the wall's feet are at y + 2d + h.
      const left: Pt[] = [[x - w, y + d], [x, y + 2 * d], [x, y + 2 * d + h], [x - w, y + d + h]];
      const right: Pt[] = [[x, y + 2 * d], [x + w, y + d], [x + w, y + d + h], [x, y + 2 * d + h]];
      poly(right, m.dark);
      poly(left, m.side);
      [left, right].forEach((face, faceIdx) => {
        ctx.save();
        ctx.beginPath();
        face.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py));
        ctx.closePath();
        ctx.clip();
        for (let row = 0; row < 1 + Math.ceil(h / 5); row++) {
          const rowY = y + d + row * 5;
          const edgeX = x + (faceIdx === 0 ? -w : w);
          ctx.strokeStyle = m.mortar;
          ctx.beginPath();
          ctx.moveTo(edgeX, rowY + 0.5);
          ctx.lineTo(x, rowY + d + 0.5);
          ctx.stroke();
          for (let i = 3 + ((row + offset) % 2) * 4; i < w; i += 7) {
            const jitter = ((row * 17 + i * 3 + floor) % 3);
            const bx = faceIdx === 0 ? edgeX + i : edgeX - i;
            const by = rowY + Math.floor(i * d / w);
            ctx.fillStyle = m.mortar;
            ctx.fillRect(bx, by, 1, 4);
            ctx.fillStyle = row % 3 === 1 ? m.top : m.side;
            ctx.fillRect(bx + 1, by + 1, 2 + jitter, 1);
          }
        }
        ctx.restore();
      });
      poly([[x, y], [x + w, y + d], [x, y + 2 * d], [x - w, y + d]], m.top);
      poly([[x, y + 1], [x + w - 2, y + d], [x, y + 2 * d - 1], [x - w + 3, y + d]], m.side);
      poly([[x, y + 2], [x + w - 4, y + d], [x + 3, y + 2 * d - 2], [x + 8, y + d + 1]], m.dark);
    };
    const lamp = (x: number, y: number): void => {
      ctx.globalAlpha = 0.24;
      poly([[x - 8, y], [x, y - 8], [x + 8, y], [x + 7, y + 5], [x, y + 7], [x - 7, y + 5]], m.accent);
      ctx.globalAlpha = 1;
      ctx.fillStyle = m.mortar;
      ctx.fillRect(x - 3, y + 2, 6, 4);
      poly([[x - 2, y + 2], [x - 3, y - 1], [x - 1, y - 3], [x + 1, y - 6], [x + 3, y - 2], [x + 2, y + 2]], m.accent);
      ctx.fillStyle = m.glow;
      ctx.fillRect(x, y - 2, 2, 3);
    };

    if (kind === 'retaining') {
      block(32, 45, 16, 8, 9);
    } else if (kind === 'rubble') {
      block(32, 47, 14, 7, 9);
      block(27, 43, 9, 4, 10, 1);
      block(39, 51, 5, 2, 5, 1);
    } else if (kind === 'bastion') {
      block(32, 41, 23, 10, 9);
      block(32, 14, 19, 8, 39, 1);
      block(32, 11, 21, 9, 6);
      if (floor === 2) {
        block(23, 8, 5, 2, 6);
        block(41, 8, 5, 2, 6, 1);
      } else if (floor === 1) {
        poly([[32, 7], [37, 15], [32, 18], [26, 14]], m.accent);
      } else {
        poly([[23, 16], [31, 1], [37, 9], [37, 23]], m.top);
      }
      ctx.fillStyle = m.mortar;
      ctx.fillRect(21, 34, 4, 12);
      ctx.fillRect(40, 34, 3, 11);
      ctx.fillStyle = m.accent;
      ctx.fillRect(22, 39, 1, 5);
      ctx.fillRect(41, 39, 1, 4);
    } else if (kind === 'pillar') {
      block(32, 50, 13, 6, 8);
      block(32, 27, 8, 4, 28, 1);
      block(32, 24, 11, 5, 5);
      if (floor === 0) block(32, 19, 7, 3, 5, 1);
      if (floor === 3) poly([[30, 27], [31, 12], [37, 21], [36, 28]], m.top);
      lamp(27, 47);
    } else {
      block(19, 49, 10, 5, 6);
      block(47, 48, 10, 5, 6);
      block(19, 25, 7, 4, 26);
      block(47, 24, 7, 4, 26, 1);
      poly([[12, 31], [12, 24], [18, 24], [18, 18], [23, 18], [23, 14], [42, 14], [42, 18], [48, 18], [48, 22], [54, 22], [54, 31], [44, 31], [44, 27], [39, 27], [39, 23], [28, 23], [28, 27], [23, 27], [23, 32]], m.side);
      poly([[12, 24], [17, 21], [22, 21], [22, 16], [27, 13], [42, 13], [49, 17], [54, 22], [48, 22], [41, 17], [26, 17], [23, 20], [18, 20], [18, 24]], m.top);
      if (floor === 2) {
        ctx.fillStyle = m.glow;
        ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('23', 33, 21);
      }
      lamp(15, 39);
      lamp(43, 39);
    }
    scene.textures.addCanvas(key, canvas);
  }));
}
