"""Clean, dimensioned AVEL face. Re-typeset only the photographed wording;
original manufacturer/partner wordmarks are cropped from the catalogue photo.
The six blank LED apertures match the separate, live model lenses exactly.
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

def build_avel_silkscreen(photo, destination, scale=4):
    s = scale
    im = Image.new('RGB', (352*s, 800*s), '#eeeee7')
    draw = ImageDraw.Draw(im)
    blue, paper = '#242575', '#eeeee7'
    def box(xy, radius=0, fill=None, width=1.4):
        draw.rounded_rectangle(tuple(round(n*s) for n in xy), radius=radius*s, fill=fill, outline=blue, width=max(1, round(width*s)))
    def text(value, xy, size, bold=False, fill=blue, anchor='mm', maxw=None):
        f = ImageFont.truetype(BOLD if bold else FONT, round(size*s))
        if maxw:
            while draw.textlength(value, font=f) > maxw*s:
                size -= .15; f = ImageFont.truetype(BOLD if bold else FONT, max(1, round(size*s)))
        draw.text((xy[0]*s, xy[1]*s), value, font=f, fill=fill, anchor=anchor, stroke_width=0)
    box((8, 8, 344, 792), 5, width=2.5)
    box((17, 20, 165, 72), 4, width=1.8)
    box((185, 20, 331, 72), 0, fill=blue, width=1.8)
    # Original partner and AVEL wordmarks from the 249 x 354 catalogue image.
    # The old y=12 crop selected only the top frame, not the logos at y=20..33.
    # Rectify their small perspective slope and recolour the photographic mask;
    # no substitute wordmark or claim of manufacturer-supplied vector artwork.
    for quad, area in [
        ((137, 19, 137, 31, 179, 33, 179, 21), (25, 30, 157, 62)),
        ((194, 20, 194, 33, 234, 34, 234, 21), (192, 29, 324, 65)),
    ]:
        size = ((area[2]-area[0])*s, (area[3]-area[1])*s)
        logo = photo.transform(size, Image.Transform.QUAD, quad, Image.Resampling.BICUBIC)
        # Blue print is substantially darker than the off-white stock. A soft
        # threshold removes JPEG/paper noise without inventing letter strokes.
        mask = logo.convert('L').point(lambda n: 255 if n < 135 else 0)
        mask = mask.filter(ImageFilter.GaussianBlur(radius=max(.35, s*.16)))
        clean = Image.new('RGB', size, paper)
        clean.paste(Image.new('RGB', size, blue), (0, 0), mask)
        im.paste(clean, (area[0]*s, area[1]*s))
    text('411', (39, 113), 24)
    box((80, 91, 270, 135), 5, width=1.6)
    text('RNPD0-023', (175, 113), 24, maxw=178)
    text('01', (306, 113), 24)
    text('RELÉ de NÍVEL', (176, 190), 25, maxw=280)
    text('Controlo de Poço e Depósito', (176, 237), 21, maxw=316)
    # Geometry: label 33 x 75.3 mm, y=1.85..77.15; LED x=-11.5 mm.
    led_x = (-11.5 + 16.5) / 33 * 352
    led_ys = [(77.15-y)/75.3*800 for y in [44.8,40,30.1,24.9,14.8,10]]
    for title, y, lamps in [('DEPÓSITO', 289, led_ys[:2]), ('POÇO', 448, led_ys[2:4])]:
        box((46, y, 306, y+33), 3, fill=blue)
        text(title, (176, y+16.5), 24, True, paper, maxw=245)
        for value, cy in zip(['Água', 'Falta de Água'], lamps):
            box((21, cy-24, 331, cy+24), 8, width=1.7)
            text(value, (195, cy), 24, maxw=248)
    for value, cy in zip(['Ligado (1-3)', 'Tensão (2-10)'], led_ys[4:]):
        box((21, cy-24, 331, cy+24), 8, width=1.7)
        text(value, (195, cy), 24, maxw=247)
    # Keep lenses visually independent: this neutral print has no baked green,
    # red or yellow light, glow, shadows, photography distortion or extra text.
    for cy in led_ys:
        draw.ellipse(((led_x-12)*s,(cy-12)*s,(led_x+12)*s,(cy+12)*s), fill=paper)
    draw.rounded_rectangle((83*s,744*s,269*s,778*s), radius=5*s, fill='#a6d8e4')
    text('230 V~', (176, 760), 24, True)
    im.save(destination, optimize=True)
    return {'width': im.width, 'height': im.height, 'wording': '411 RNPD0-023 01; RELÉ de NÍVEL; Controlo de Poço e Depósito; DEPÓSITO / POÇO; Água / Falta de Água; Ligado (1-3); Tensão (2-10); 230 V~', 'ledCentersPx': [[round(led_x*s,3),round(y*s,3)] for y in led_ys]}
