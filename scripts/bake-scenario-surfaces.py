"""Bake isometric stone textures directly from the four scenario paintings.

Usage: python3 scripts/bake-scenario-surfaces.py /path/to/Escenario
Requires Pillow. Output frames: 0–15 floor, 16–31 coloured route.
"""
from pathlib import Path
from argparse import ArgumentParser
import math
import random
from PIL import Image, ImageEnhance, ImageOps

parser = ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
args = parser.parse_args()
out = Path(__file__).resolve().parents[1] / 'src/assets/scenario-surfaces'
out.mkdir(parents=True, exist_ok=True)

# Sampling centres are on the walkable stone in the 480×270 reference views.
# Exclude silhouettes, architecture and baked lighting near the boundaries.
refs = {
    'cloister': ('Claustro_Mineral', [(172, 118), (215, 103), (265, 90), (311, 105), (151, 140), (220, 128), (282, 120), (339, 126), (177, 156), (234, 155), (293, 146), (320, 156), (212, 177), (254, 181), (266, 201), (358, 139)], (1.12, 1.21, 1.01), (1.27, 1.07, .73)),
    'bridge': ('Puente_Quebrado', [(174, 103), (219, 98), (270, 92), (322, 91), (142, 124), (199, 122), (261, 114), (320, 111), (158, 151), (221, 149), (273, 137), (338, 127), (111, 150), (156, 176), (202, 166), (373, 109)], (1.09, 1.06, 1.23), (1.16, .98, 1.10)),
    'fortress': ('Arena_Isometrica', [(212, 116), (252, 111), (296, 117), (338, 130), (163, 139), (215, 141), (270, 136), (326, 153), (143, 168), (190, 172), (235, 164), (280, 169), (201, 198), (244, 199), (296, 197), (376, 153)], (1.06, 1.15, 1.21), (1.35, 1.02, .91)),
    'ossuary': ('Osario_Hundido', [(174, 96), (223, 97), (275, 96), (313, 100), (143, 120), (192, 125), (250, 120), (329, 122), (131, 149), (182, 151), (234, 148), (304, 151), (155, 177), (208, 182), (263, 188), (309, 178)], (1.17, 1.05, 1.18), (1.32, 1.02, 1.02)),
}

for style, (file, samples, multiplier, accent) in refs.items():
    source = Image.open(args.source / f'Falla_23_{file}_Mockup.png').convert('RGB')
    # Resize once before sampling to preserve the original clusters of pixels.
    source = ImageOps.autocontrast(source.resize((960, 540), Image.Resampling.LANCZOS), cutoff=1)
    source = ImageEnhance.Brightness(source).enhance(1.08)
    sheet = Image.new('RGBA', (64 * 8, 32 * 4))
    for variant, (cx, cy) in enumerate(samples):
        rng = random.Random(731 + variant)
        span = rng.uniform(.88, 1.13)
        for route in range(2):
            tile = Image.new('RGBA', (64, 32))
            px = tile.load()
            for y in range(32):
                for x in range(64):
                    sx = (x + .5 - 32) / 32
                    sy = (y + .5 - 16) / 16
                    if abs(sx) + abs(sy) > 1:
                        continue
                    rgb = source.getpixel((round(cx * 2 + sx * 45 * span), round(cy * 2 + sy * 24 * span)))
                    # Feather the cropped edges towards the common stone tone so
                    # diamonds read as a continuous surface, not isolated stamps.
                    feather = max(0., min(1., (1 - abs(sx) - abs(sy)) * 10))
                    mix = .48 + .52 * feather
                    tone = (49, 58, 74)
                    grade = .95 + .09 * math.sin(variant * 1.51)
                    graded = [round((b * mix + base * (1 - mix)) * m * grade * (accent[i] if route else 1))
                              for i, (b, base, m) in enumerate(zip(rgb, tone, multiplier))]
                    px[x, y] = (*[min(255, c) for c in graded], 255)
            frame = variant + route * 16
            sheet.paste(tile, ((frame % 8) * 64, (frame // 8) * 32))
    sheet.save(out / f'{style}.png', optimize=True)
