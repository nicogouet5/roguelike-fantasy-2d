"""Bakes generated square textures into 64x32 isometric diamond tiles (4 variants each)."""
import sys
import numpy as np
from PIL import Image, ImageEnhance

SRC = 'src/assets/scenarios/source'
OUT = 'src/assets/scenarios'
N = 64  # square sample grid per tile

def seamless(img):
    a = np.asarray(img.convert('RGB'), dtype=float)
    n = a.shape[0]
    shifted = np.roll(np.roll(a, n // 2, 0), n // 2, 1)
    t = 1 - np.abs(np.linspace(-1, 1, n))
    w = np.outer(t, t)[..., None]
    return Image.fromarray(np.clip(a * w + shifted * (1 - w), 0, 255).astype('uint8'))

def window(img, x0, y0, size):
    return img.resize((N, N), Image.LANCZOS, box=(x0, y0, x0 + size, y0 + size))

def diamond(sq):
    px = np.asarray(sq.convert('RGB'))
    out = np.zeros((32, 64, 4), dtype='uint8')
    for y in range(32):
        for x in range(64):
            sx = (x + 0.5 - 32) / 32
            sy = (y + 0.5 - 16) / 16
            if abs(sx) + abs(sy) > 1:
                continue
            a = (sx + sy) / 2 + 0.5
            b = (sy - sx) / 2 + 0.5
            out[y, x, :3] = px[min(int(b * N), N - 1), min(int(a * N), N - 1)]
            out[y, x, 3] = 255
    return Image.fromarray(out, 'RGBA')

def quantize(tile, colors=40):
    rgb = tile.convert('RGB').quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    rgb.putalpha(tile.split()[3])
    return rgb

def bake(style, surface, key, src_name, crops, aligned=None, tweak=1.0):
    img = Image.open(f'{SRC}/{src_name}.png').convert('RGB')
    tiles = []
    for v in range(4):
        if aligned:
            x0, y0, size = aligned
            sq = window(img, x0, y0, size)  # periodic crop: joints already line up
        else:
            x0, y0, size = crops[v]
            sq = window(seamless(img.crop((x0, y0, x0 + size, y0 + size))), 0, 0, size)
        if v == 1: sq = sq.transpose(Image.FLIP_LEFT_RIGHT)
        if v == 2: sq = sq.transpose(Image.FLIP_TOP_BOTTOM)
        if v == 3: sq = sq.transpose(Image.ROTATE_180)
        if tweak != 1.0 or v:
            sq = ImageEnhance.Brightness(sq).enhance(tweak * (1.0 + 0.04 * (v - 1.5)))
        tiles.append(quantize(diamond(sq)))
    for v, t in enumerate(tiles):
        t.save(f'{OUT}/scn_{style}_{key}_{v}.png')
    return tiles

all_tiles = []
# Slab: two joint periods (period ~40.67px, joints centred at 38.5) keep neighbouring tiles aligned.
all_tiles += bake('cloister', 'slab', 'slab', 'cloister_slab', None, aligned=(38.5, 38.5, 81.33))
all_tiles += bake('cloister', 'path', 'path', 'cloister_path', [(0, 0, 140), (60, 0, 140), (0, 60, 140), (60, 60, 140)])
all_tiles += bake('cloister', 'water', 'void', 'cloister_water', [(0, 0, 120), (80, 0, 120), (0, 80, 120), (80, 80, 120)])
all_tiles += bake('cloister', 'rock', 'rock', 'cloister_rock', [(0, 0, 120), (80, 0, 120), (0, 80, 120), (80, 80, 120)])

# Preview: each surface laid as a 5x5 isometric patch so seams are visible.
def patch(tiles):
    W, H = 64 * 6, 32 * 6 + 32
    img = Image.new('RGBA', (W, H), (12, 14, 20, 255))
    import random
    r = random.Random(3)
    for gy in range(6):
        for gx in range(6):
            t = tiles[r.randrange(4)]
            img.alpha_composite(t, ((gx - gy) * 32 + W // 2 - 32, (gx + gy) * 16))
    return img
sheet = Image.new('RGBA', (64 * 6 * 4 + 30, 32 * 6 + 32), (12, 14, 20, 255))
for i in range(4):
    sheet.alpha_composite(patch(all_tiles[i * 4:(i + 1) * 4]), (i * (64 * 6 + 10), 0))
sheet = sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST)
sheet.save(sys.argv[1])
print('baked', len(all_tiles), 'tiles')
