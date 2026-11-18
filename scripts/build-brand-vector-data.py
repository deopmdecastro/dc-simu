#!/usr/bin/env python3
"""Extract the checked-in manufacturer SVG paths; never replace artwork by text.
The two source files use path geometry and one affine matrix. Clipping is kept
as paths and applied by Canvas2D at draw time. No raster/network dependency.
"""
import hashlib
import json
import re
from pathlib import Path
from xml.etree import ElementTree as ET

root = Path(__file__).resolve().parents[1]
result = {}
for name in ('schneider-electric', 'hager'):
    source = root / 'public' / 'brands' / (name + '.svg')
    data = source.read_bytes()
    svg = ET.fromstring(data)
    clips = {node.attrib['id']: [p.attrib['d'] for p in node if p.tag.endswith('path')]
             for node in svg.iter() if node.tag.endswith('clipPath')}
    paths = []
    def walk(node, matrix=None, fill='#000000', rule='nonzero', clip=None):
        tag = node.tag.rsplit('}', 1)[-1]
        if tag in ('clipPath', 'defs', 'style'):
            return
        if 'transform' in node.attrib:
            assert matrix is None, 'Nested transforms require explicit matrix multiplication'
            match = re.fullmatch(r'matrix\(([^)]+)\)', node.attrib['transform'])
            assert match, node.attrib['transform']
            matrix = list(map(float, re.split(r'[\s,]+', match[1])))
        fill = node.attrib.get('fill', '#0078c3' if node.attrib.get('class') == 'st0' else fill)
        rule = node.attrib.get('fill-rule', rule)
        clip = node.attrib.get('clip-path', clip)
        if tag == 'path':
            paths.append({'d': node.attrib['d'], 'matrix': matrix or [1, 0, 0, 1, 0, 0],
                          'fill': fill, 'rule': rule,
                          'clip': clips.get(clip[5:-1], []) if clip else []})
        for child in node:
            walk(child, matrix, fill, rule, clip)
    walk(svg)
    result[name] = {'source': '/brands/' + name + '.svg', 'sha256': hashlib.sha256(data).hexdigest(),
                    'viewBox': list(map(float, svg.attrib['viewBox'].split())), 'paths': paths}
target = root / 'src/data/brand-vector-paths.json'
target.write_text(json.dumps(result, separators=(',', ':')) + '\n')
print('Wrote', target.relative_to(root), {name: len(item['paths']) for name, item in result.items()})
