"""Normaliza os 20 encaixes revistos, sem alterar os restantes bornes funcionais.

python scripts/calibrate-imported-terminals.py <pasta-dos-relatorios-de-raios>
Requer os relatórios de audit-imported-terminals.ts e os GLB já convertidos.
As associações de rótulos abaixo são explícitas, não inferidas pelo detetor.
"""
import json
import pathlib
import sys

ASSIGNMENTS = [
    ('fuseHolderSchneiderDf101v', ['1'], ['2']),
    ('fuseHolderSchneiderDf103nv', ['1', '3', '5', 'N1'], ['2', '4', '6', 'N2']),
    ('fuseHolderSchneiderDf81n', ['1', 'N1'], ['2', 'N2']),
    ('residualBreakerHagerCfc225p', ['1', 'N1'], ['2', 'N2']),
    ('surgeProtectorWegSpw02', ['L'], ['PE']),
]


def calibrate(folder):
    root = pathlib.Path(__file__).resolve().parent.parent
    models = {row['type']: row for row in json.loads((root / 'src/data/imported-component-models.json').read_text(encoding='utf-8'))}
    result = {}
    for identifier, top, bottom in ASSIGNMENTS:
        report = json.loads((pathlib.Path(folder) / (identifier + '-holes.json')).read_text(encoding='utf-8'))
        size = models[identifier]['physicalSizeMm']
        width, height, depth = size['width'], size['height'], size['depth']
        spots = []
        for face, labels in [('top', top), ('bottom', bottom)]:
            holes = report[face]
            # DF: a outra fila inferior é o patim da calha, não a ligação.
            if identifier.startswith('fuseHolder'):
                holes = [hole for hole in holes if 19 < hole['position'][2] < 23]
            if identifier == 'residualBreakerHagerCfc225p':
                holes = [hole for hole in holes if hole['diameterMm'] > 8]
            holes = sorted(holes, key=lambda hole: hole['position'][0])
            if len(holes) != len(labels):
                raise ValueError(f'{identifier}/{face}: encaixes ambíguos; rever o CAD antes de gerar')
            for label, hole in zip(labels, holes):
                x, y, z = hole['position']
                spots.append(dict(label=label, face=face, x=round((x + width / 2) / width, 6), y=round(1 - y / height, 6), z=round(z / depth, 6), diameterMm=round(hole['diameterMm'], 3), holeDepthMm=round(hole['depthMm'], 3)))
        result[identifier] = spots
    (root / 'src/data/imported-component-terminals.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    calibrate(sys.argv[1])
