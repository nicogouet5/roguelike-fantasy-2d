"""Extract the Bodoque boss sprite from the supplied reference JPEG.

Usage: python3 scripts/create-bodoque-boss.py path/to/reference.jpeg
Requires Pillow. The reference stays outside the repository.
"""
from argparse import ArgumentParser
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

parser = ArgumentParser(description=__doc__)
parser.add_argument('reference', type=Path)
args = parser.parse_args()
reference = Image.open(args.reference).convert('RGBA')

# Hand-traced silhouette on a 550×410 overlay of the reference. Retain the
# floppy ears, sail, striped shirt, microphone and claws, but no scenery.
outline = [
    (45, 267), (52, 257), (68, 250), (83, 245), (101, 245), (125, 251),
    (149, 253), (171, 249), (174, 226), (176, 209), (181, 193), (177, 180),
    (182, 163), (190, 151), (193, 139), (205, 133), (215, 119), (227, 111),
    (239, 111), (239, 91), (246, 65), (256, 46), (270, 30), (286, 22),
    (303, 20), (316, 23), (331, 36), (343, 58), (349, 73), (358, 73),
    (364, 49), (374, 29), (383, 21), (394, 20), (411, 26), (424, 39),
    (434, 54), (441, 71), (442, 82), (436, 90), (428, 90), (416, 84),
    (406, 71), (397, 55), (386, 41), (378, 51), (370, 75), (380, 81),
    (391, 79), (398, 84), (402, 94), (400, 105), (417, 117), (431, 124),
    (443, 130), (447, 140), (446, 150), (440, 161), (429, 166), (410, 164),
    (392, 159), (376, 155), (369, 169), (361, 175), (365, 191), (364, 209),
    (370, 223), (387, 214), (389, 203), (396, 201), (393, 195), (394, 187),
    (400, 181), (408, 181), (414, 186), (415, 194), (412, 202), (417, 207),
    (417, 225), (412, 235), (409, 237), (408, 249), (400, 249), (398, 239),
    (384, 245), (368, 247), (355, 242), (350, 252), (360, 275), (363, 295),
    (359, 308), (349, 318), (337, 328), (325, 338), (330, 347), (341, 354),
    (358, 359), (372, 361), (379, 372), (374, 382), (362, 380), (355, 384),
    (345, 382), (337, 386), (325, 380), (312, 377), (305, 370), (302, 357),
    (296, 347), (291, 337), (292, 325), (301, 314), (307, 301), (289, 302), (270, 307),
    (248, 317), (231, 328), (224, 340), (229, 357), (236, 367), (245, 373),
    (253, 386), (250, 397), (240, 398), (228, 393), (215, 397), (205, 392),
    (195, 400), (187, 394), (185, 383), (190, 368), (197, 353), (198, 335),
    (197, 322), (201, 308), (195, 299), (173, 302), (147, 298), (124, 287),
    (103, 274), (83, 265), (63, 263),
]
mask = Image.new('L', reference.size)
draw = ImageDraw.Draw(mask)
def scaled(points):
    return [(round(x * reference.width / 550), round(y * reference.height / 410)) for x, y in points]

draw.polygon(scaled(outline), fill=255)
# Narrow strip of sky between the ear, brow and sail.
draw.polygon(scaled([(322, 76), (334, 74), (326, 51), (316, 38),
                     (308, 37), (302, 49), (292, 78), (280, 103),
                     (267, 120), (275, 126), (292, 133), (302, 140),
                     (303, 113), (311, 91)]), fill=0)
reference.putalpha(mask)
subject = reference.crop(mask.getbbox())
subject.thumbnail((84, 76), Image.Resampling.LANCZOS)
# Clip faint matte pixels before adding the dark one-pixel silhouette.
subject.putalpha(subject.getchannel('A').point(lambda value: 255 if value >= 145 else 0))
sprite = Image.new('RGBA', (96, 96))
sprite.paste(subject, ((96 - subject.width) // 2, 80 - subject.height))
ink = Image.new('RGBA', sprite.size, '#241320')
ink.putalpha(sprite.getchannel('A').filter(ImageFilter.MaxFilter(3)))
ink.alpha_composite(sprite)
out = Path(__file__).resolve().parents[1] / 'src/assets/boss'
ink.save(out / 'bodoque-hoja-abisal.png')
ink.resize((768, 768), Image.Resampling.NEAREST).save(out / 'bodoque-hoja-abisal-preview.png')
