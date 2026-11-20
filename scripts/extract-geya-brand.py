"""Extract the original GEYA vector artwork from the local manufacturer manual."""
from pathlib import Path
import hashlib
import pymupdf

source = Path('public/datasheets/industrial/geya-grt8-m.pdf')
page = pymupdf.open(source)[0]
paths = []
for drawing in page.get_drawings():
    rect, fill = drawing['rect'], drawing['fill']
    if not (fill and max(fill) < .3 and rect.x0 >= 54 and rect.x1 <= 159 and rect.y0 >= 30 and rect.y1 <= 52):
        continue
    commands, end = [], None
    for item in drawing['items']:
        if item[0] not in ('l', 'c'):
            raise ValueError('Unexpected artwork primitive: ' + item[0])
        start = item[1]
        if start != end:
            commands.append(f'M{start.x:.5f},{start.y:.5f}')
        if item[0] == 'l':
            end = item[2]
            commands.append(f'L{end.x:.5f},{end.y:.5f}')
        else:
            a, b, end = item[2:]
            commands.append(f'C{a.x:.5f},{a.y:.5f} {b.x:.5f},{b.y:.5f} {end.x:.5f},{end.y:.5f}')
    if drawing['closePath']:
        commands.append('Z')
    paths.append('<path d="' + ' '.join(commands) + '"/>')
assert len(paths) == 7, 'Manufacturer artwork changed; inspect the manual again'
Path('public/brands/geya.svg').write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="54 30 105 22" fill="#262626" fill-rule="evenodd">\n'
    + '<!-- Original GEYA artwork, GRT8-M manual page 1; PDF SHA256 ' + hashlib.sha256(source.read_bytes()).hexdigest() + ' -->\n'
    + '\n'.join(paths) + '\n</svg>\n', encoding='utf-8')
