"""Offline: python3 scripts/build-xb2-numbers.py
Impressos dos bornes das botoeiras KEOLEA KL-XB2: o número de cada borne fica
gravado na face traseira do bloco de contactos, ao lado do poço (referências
IMG_5855 / IMG_5857). São dígitos tipográficos — não há logótipo nem
certificação inventada — e vão em PNG transparente para o mesmo pipeline dos
restantes impressos locais (PRINTS em src/three/industrialFinish.ts).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

out = Path('public/models/industriais')
out.mkdir(parents=True, exist_ok=True)
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 96)

for label in ('1', '2', '3', '4'):
    im = Image.new('RGBA', (120, 120), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    box = draw.textbbox((0, 0), label, font=font)
    draw.text(((120 - box[2] + box[0]) / 2, (120 - box[3] + box[1]) / 2 - 2), label, font=font, fill=(214, 218, 210, 255))
    im.save(out / f'xb2-terminal-{label}.png', optimize=True)
    print('xb2-terminal-%s.png' % label)
