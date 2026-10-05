#!/usr/bin/env python3
"""
Desenha o mapa de bornes de cada componente (vista de frente e vista de cima),
comparando ANTES e DEPOIS da correção da convenção de altura.

Cada ponto é um borne na posição normalizada que o Painel 3D usa:
  vista de frente: x → direita, y → cima (1 = topo)
  vista de cima:   x → direita, z → cima (1 = frente)
Os bornes que ficaram na face errada (frente/trás onde deviam estar em cima/baixo)
aparecem a vermelho no painel "antes" e a verde no painel "depois".

Uso: python3 scripts/draw-terminal-map.py scripts/terminal-positions.json out.png
"""
import json
import sys

from PIL import Image, ImageDraw, ImageFont

CELL = 132          # lado do painel de cada vista
GAP = 18
PAD = 14
ROW_LABEL = 30

FACES = {
    'top': (34, 139, 34),
    'bottom': (30, 90, 190),
    'front': (200, 40, 40),
    'back': (150, 80, 190),
    'left': (200, 130, 20),
    'right': (0, 150, 160),
}


def font(size=11):
    for path in (
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def face_of(p):
    """Face da caixa onde o borne assenta (a coordenada mais encostada à superfície)."""
    cands = [('top', p['y']), ('bottom', 1 - p['y']), ('back', p['z']),
             ('front', 1 - p['z']), ('left', p['x']), ('right', 1 - p['x'])]
    cands.sort(key=lambda c: c[1])
    name, dist = cands[0]
    return (name, dist) if dist <= 0.12 else ('INTERIOR', dist)


def draw_panel(d, ox, oy, title, terminals, key, f_small, f_tiny):
    d.rectangle([ox, oy, ox + CELL, oy + CELL], outline=(200, 205, 212), width=1)
    d.text((ox + 2, oy - 13), title, fill=(70, 78, 90), font=f_small)
    d.line([ox + CELL / 2, oy, ox + CELL / 2, oy + CELL], fill=(235, 238, 242))
    d.line([ox, oy + CELL / 2, ox + CELL, oy + CELL / 2], fill=(235, 238, 242))
    for t in terminals:
        p = t[key]
        if not p:
            continue
        face, dist = face_of(p)
        color = FACES.get(face, (110, 110, 110))
        if key == 'before':
            face, dist = face_of({'x': p['x'], 'y': 1 - p['y'], 'z': p['z']})
            color = FACES.get(face, (110, 110, 110))
        if title.startswith('cima'):
            u, v = p['x'], 1 - p['z']
        else:
            u, v = p['x'], 1 - p['y']
        px = ox + u * CELL
        py = oy + v * CELL
        r = 4
        d.ellipse([px - r, py - r, px + r, py + r], fill=color, outline=(255, 255, 255))
        d.text((px + 5, py - 12), t['label'], fill=(45, 50, 58), font=f_tiny)


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'scripts/terminal-positions.json'
    dst = sys.argv[2] if len(sys.argv) > 2 else 'scripts/terminal-map.png'
    data = json.load(open(src))

    f_title = font(15)
    f_name = font(12)
    f_small = font(10)
    f_tiny = font(9)
    f_legend = font(11)

    row_h = ROW_LABEL + CELL + GAP + 14
    panels_w = PAD * 2 + 2 * CELL + 2 * GAP + 34
    width = panels_w
    height = PAD * 2 + 46 + row_h * len(data) + 60

    img = Image.new('RGB', (width, height), (255, 255, 255))
    d = ImageDraw.Draw(img)

    d.text((PAD, PAD), 'Bornes dos componentes · vista de frente e de cima (normalizado 0..1)', fill=(20, 24, 30), font=f_title)
    d.text((PAD, PAD + 20), 'Cada ponto é um borne. Cor = face onde assenta. Antes: y invertido (topo↔base).', fill=(95, 102, 112), font=f_legend)

    y = PAD + 46
    for type_name, comp in data.items():
        d.rectangle([PAD, y, width - PAD, y + row_h - 12], fill=(249, 250, 252), outline=(228, 231, 236))
        d.text((PAD + 8, y + 4), f"{comp['name']}  ·  {type_name}  ·  {comp['size']['width']:.1f} × {comp['size']['height']:.1f} × {comp['size']['depth']:.1f} mm", fill=(25, 30, 38), font=f_name)
        d.text((PAD + 8, y + 20), f"{len(comp['terminals'])} bornes · montagem {comp['placement']}", fill=(120, 126, 136), font=f_small)

        bx = PAD + 8
        by = y + ROW_LABEL
        d.text((bx, by - 12), 'ANTES', fill=(190, 60, 60), font=f_small)
        draw_panel(d, bx + 34, by, 'frente (x/y)', comp['terminals'], 'before', f_small, f_tiny)
        draw_panel(d, bx + 34 + CELL + GAP, by, 'cima (x/z)', comp['terminals'], 'before', f_small, f_tiny)

        bx = PAD + 8 + 2 * (CELL + GAP) + 34 + 30
        d.text((bx, by - 12), 'DEPOIS', fill=(30, 120, 60), font=f_small)
        draw_panel(d, bx + 34, by, 'frente (x/y)', comp['terminals'], 'after', f_small, f_tiny)
        draw_panel(d, bx + 34 + CELL + GAP, by, 'cima (x/z)', comp['terminals'], 'after', f_small, f_tiny)

        y += row_h

    # legenda
    lx = PAD
    ly = height - 40
    d.text((lx, ly - 15), 'Face onde o borne assenta:', fill=(25, 30, 38), font=f_legend)
    for name, color in FACES.items():
        d.rectangle([lx, ly, lx + 12, ly + 12], fill=color)
        d.text((lx + 17, ly), name, fill=(60, 66, 76), font=f_legend)
        lx += 17 + d.textlength(name, font=f_legend) + 16
    d.rectangle([lx, ly, lx + 12, ly + 12], fill=(110, 110, 110))
    d.text((lx + 17, ly), 'interior do corpo', fill=(60, 66, 76), font=f_legend)

    img.save(dst)
    print(f'{dst} · {width}×{height}px · {len(data)} componentes')


if __name__ == '__main__':
    main()
