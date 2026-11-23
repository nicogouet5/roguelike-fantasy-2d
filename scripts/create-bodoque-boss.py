"""Spinosaurus first, Bodoque's felt palette and expression second.
Run from any directory with Pillow installed. Preserves the original boss anchor.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
out = ROOT / 'src/assets/boss'
out.mkdir(parents=True, exist_ok=True)
sheet = Image.open(ROOT / 'src/assets/codex/combat-frames.png').convert('RGBA')
sprite = sheet.crop((288, 0, 384, 96))
# Preserve the original detailed light/shadow structure, armor and bone spines.
# Warm red replaces turquoise skin rather than drawing a rabbit over the body.
for y in range(96):
    for x in range(96):
        r, g, b, a = sprite.getpixel((x, y))
        if a and g > r * 1.18 and g > 25 and b > r * 1.1:
            v = max(g, b)
            sprite.putpixel((x, y), (min(218, int(v * 1.45)), int(v * .33), int(v * .39), a))

# Author the head on its own alpha mask, with the same shaded pixel density as
# the source. Long crocodilian snout, low skull, thick dinosaur neck: no ears.
head = Image.new('RGBA', (96, 96))
d = ImageDraw.Draw(head)
d.polygon([(24,36),(28,34),(31,31),(37,29),(42,30),(46,34),
           (47,40),(45,44),(43,48),(38,48),(34,44),(27,44),
           (22,42),(21,39)], fill='#a13443')
mask = head.getchannel('A')
for y in range(29, 49):
    for x in range(20, 48):
        if mask.getpixel((x, y)):
            # Fixed, reproducible clustered felt/scales; top/front catches light.
            noise = ((x // 2 * 17 + y // 2 * 31) % 11) - 5
            light = max(0, 1 - abs(y - 35) / 15)
            neck_shadow = max(0, (x - 40) * 4 + (y - 41) * 2)
            head.putpixel((x, y), (int(126 + light * 65 + noise * 2 - neck_shadow),
                                   int(32 + light * 17 + noise),
                                   int(44 + light * 19 + noise), 255))
d = ImageDraw.Draw(head)
# Contour broken into short steps rather than a flat vector outline.
d.line([(24,36),(28,34),(31,31),(37,29),(42,30)], fill='#642936', width=1)
d.line([(22,42),(27,44),(34,44),(38,48),(43,48)], fill='#462533', width=1)
# Two low fleshy ridges echo Bodoque's shape language but remain cranial crests.
d.polygon([(33,31),(34,27),(36,27),(38,30)], fill='#9b3444')
d.line([(34,28),(35,29)], fill='#d35a60')
d.polygon([(39,30),(41,26),(43,28),(43,32)], fill='#8b303f')
d.point((41,27), fill='#cd555b')
# Puppet-like cream eyes wrap around the dinosaur skull in three-quarter view.
d.polygon([(30,32),(33,31),(36,32),(36,36),(33,38),(30,36)], fill='#522733')
d.polygon([(31,33),(33,32),(35,33),(35,36),(32,37),(31,35)], fill='#e7ddc4')
d.rectangle((31,34,32,36), fill='#232532')
d.polygon([(38,31),(40,30),(42,32),(42,35),(39,36),(38,34)], fill='#e7ddc4')
d.rectangle((38,33,39,35), fill='#232532')
# Heavy, asymmetric eyelids: recognizably sardonic instead of cartoon surprise.
d.line([(30,32),(33,32),(35,33)], fill='#953140', width=1)
d.line([(38,31),(40,31),(42,32)], fill='#91303e', width=1)
# Rounded Bodoque muzzle stretched into a proper spinosaur jaw.
d.line([(23,37),(27,36),(30,37)], fill='#db6468', width=1)
d.rectangle((23,38,24,38), fill='#592633')
d.line([(22,40),(27,41),(32,41),(37,40),(40,39)], fill='#4c2330', width=1)
d.line([(26,42),(31,43),(35,42)], fill='#c8565f', width=1)
# Small teeth, not a rabbit's incisors, and a shaded red throat into the armor.
for x, y in [(27,41),(32,41),(37,40)]:
    d.point((x,y), fill='#bfb6a1')
d.line([(42,41),(43,44),(41,46)], fill='#73303c', width=2)
d.point((36,38), fill='#cc5c65')
d.point((44,37), fill='#d16a6a')
sprite.alpha_composite(head)
sprite.save(out / 'bodoque-hoja-abisal.png')
sprite.resize((768,768), Image.Resampling.NEAREST).save(out / 'bodoque-hoja-abisal-preview.png')
print(out / 'bodoque-hoja-abisal.png')
