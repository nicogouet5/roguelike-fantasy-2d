"""Build the Bodoque/Hoja-Abisal boss from the existing authored boss pixels.
Requires Pillow. Run from the repository root. No external assets or API needed.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
out = ROOT / 'src/assets/boss'
out.mkdir(parents=True, exist_ok=True)
sheet = Image.open(ROOT / 'src/assets/codex/combat-frames.png').convert('RGBA')
sprite = sheet.crop((288, 0, 384, 96))
# Crimson dorsal sail, hide and tail; retain metal, bone and original shading.
for y in range(96):
    for x in range(96):
        r, g, b, a = sprite.getpixel((x, y))
        if a and g > r * 1.18 and g > 35 and b > r * 1.1:
            v = max(g, b)
            sprite.putpixel((x, y), (min(220, int(v * 1.35)), int(v * .24), int(v * .30), a))
d = ImageDraw.Draw(sprite)
outline = '#251821'
red = '#b32d3e'
light = '#db4651'
shade = '#762035'
# Ears extend upward while keeping the original planted-foot atlas anchor.
d.polygon([(35,35),(31,26),(30,11),(32,5),(36,6),(39,15),(40,32)], fill=outline)
d.polygon([(34,31),(33,23),(33,9),(35,9),(37,17),(38,32)], fill=red)
d.line([(34,12),(35,24)], fill='#ef7071', width=1)
d.polygon([(43,32),(43,15),(46,3),(50,2),(52,7),(50,22),(48,34)], fill=outline)
d.polygon([(45,30),(46,16),(48,5),(50,5),(49,19),(47,32)], fill=light)
d.line([(48,9),(47,22)], fill=shade, width=1)
# Broad felt rabbit head and long horizontal muzzle, facing left like the boss.
d.polygon([(30,29),(34,25),(43,24),(50,27),(53,33),(53,42),(48,47),(35,47),(27,42),(26,34)], fill=outline)
d.polygon([(31,30),(36,27),(44,27),(49,30),(50,36),(48,42),(40,44),(31,41),(28,36)], fill=red)
d.rectangle((34,28,43,30), fill=light)
# Bodoque's oversized, close-set puppet eyes and weary upper lids.
d.rectangle((29,30,36,37), fill='#f5edd9')
d.rectangle((38,29,45,36), fill='#f5edd9')
d.rectangle((29,30,36,31), fill=shade)
d.rectangle((38,29,45,30), fill=shade)
d.rectangle((30,33,32,36), fill='#171923')
d.rectangle((39,32,41,35), fill='#171923')
d.polygon([(25,36),(28,34),(37,36),(43,38),(47,38),(47,42),(42,45),(30,44),(25,41)], fill=outline)
d.polygon([(26,37),(29,36),(37,38),(45,39),(45,42),(40,43),(30,42),(26,40)], fill=light)
d.line([(28,41),(36,42),(42,41)], fill=shade, width=1)
d.point((28,37), fill='#f4817c')
# Collar links the rabbit head to the existing armored dinosaur torso.
d.polygon([(41,45),(47,43),(52,46),(48,50),(42,49)], fill='#252f40')
d.line([(42,46),(47,45),(50,46)], fill='#a6a18c', width=1)
sprite.save(out / 'bodoque-hoja-abisal.png')
sprite.resize((768,768), Image.Resampling.NEAREST).save(out / 'bodoque-hoja-abisal-preview.png')
print(out / 'bodoque-hoja-abisal.png')
