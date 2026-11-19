"""Offline: python3 scripts/build-atv320-hmi-labels.py
Serigrafia do HMI do ATV320U04M2C (fotografia eibabo fornecida pelo utilizador):
legendas Ref/Mon/Conf, Value/Unit, CAN Run/CAN Err, ESC e o autocolante QR de
fábrica. Texto branco sobre transparente — planos físicos no GLB, não no LCD.
O QR codifica apenas a referência comercial pública; não inventa URL, número
de série nem marcação de certificação.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import qrcode

out = Path('public/models/industriais')
out.mkdir(parents=True, exist_ok=True)
fontfile = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
INK = '#e8e8e0'  # serigrafia branca suave sobre a tampa negra

def legend(file: str, text: str, w_mm: float, h_mm: float) -> None:
    scale = 40  # px/mm
    w, h = int(w_mm * scale), int(h_mm * scale)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    font = ImageFont.truetype(fontfile, int(h * 0.82))
    box = draw.textbbox((0, 0), text, font=font)
    draw.text(((w - (box[2] - box[0])) / 2 - box[0], (h - (box[3] - box[1])) / 2 - box[1]), text, font=font, fill=INK)
    im.save(out / file, optimize=True)

legend('atv320-legend-ref.png', 'Ref', 6, 2.6)
legend('atv320-legend-mon.png', 'Mon', 6, 2.6)
legend('atv320-legend-conf.png', 'Conf', 6, 2.6)
legend('atv320-legend-value.png', 'Value', 7, 2.6)
legend('atv320-legend-unit.png', 'Unit', 7, 2.6)
legend('atv320-legend-can-run.png', 'CAN Run', 9, 2.4)
legend('atv320-legend-can-err.png', 'CAN Err', 9, 2.4)
legend('atv320-legend-esc.png', 'ESC', 5.5, 2.6)

# Autocolante QR de fábrica: referência comercial em texto + QR da referência.
size = 600
im = Image.new('RGB', (size, size), '#f4f4ee')
draw = ImageDraw.Draw(im)
font = ImageFont.truetype(fontfile, 44)
draw.text((30, 22), 'ATV320U04M2C', font=font, fill='#1a1a16')
qr = qrcode.QRCode(border=1, box_size=16)
qr.add_data('ATV320U04M2C')
qr.make(fit=True)
code = qr.make_image(fill_color='#1a1a16', back_color='#f4f4ee').convert('RGB')
code = code.resize((470, 470))
im.paste(code, (65, 100))
im.save(out / 'atv320-qr-sticker.png', optimize=True)
print('ATV320 HMI: 8 legendas + autocolante QR prontos')
