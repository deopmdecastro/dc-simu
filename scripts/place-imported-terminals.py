"""Posiciona os bornes dos CAD importados que o detetor de cavidades não associa.

python scripts/place-imported-terminals.py

Lê `src/data/imported-component-models.json` (dimensões) e acrescenta/atualiza em
`src/data/imported-component-terminals.json` os bornes medidos em vistas
ortográficas com grelha de 5 mm (`scripts/imported-terminal-audit.html` e a
auditoria de raios de `audit-imported-terminals.ts`). Coordenadas em mm no
referencial do GLB convertido: x centrado, y desde a base, z desde a traseira
(frente = +z). As entradas com `measured: false` são posições no sítio físico
correto mas cuja identificação elétrica vem da documentação, não da gravação
no CAD — ver `docs/COMPONENTES-IMPORTADOS-ACABAMENTO.md`.
Os 20 encaixes calibrados por `calibrate-imported-terminals.py` não são tocados.
"""
import json
import pathlib

# (rótulo, face, x, y, z, diâmetro, profundidade); o tipo de contacto vem de CONTACTS (por omissão: socket)
PLACEMENTS = {
    # Siemens 3RU1116-1AB0: pinos de encaixe no contactor (topo, três à esquerda);
    # 95/96/97/98 na fila do meio da frente; 2T1/4T2/6T3 na fila de baixo.
    'thermalRelaySiemens3ru1116': [
        ('1L1', 'top', -15.3, 74.9, 9.0, 2.0, 2.0),
        ('3L2', 'top', -6.6, 74.9, 9.0, 2.0, 2.0),
        ('5L3', 'top', 1.5, 74.9, 9.0, 2.0, 2.0),
        ('95', 'front', -17.4, 25.6, 67.0, 6.5, 12.7),
        ('96', 'front', -8.7, 25.6, 67.0, 6.5, 12.7),
        ('97', 'front', 0.0, 25.6, 67.0, 6.5, 12.7),
        ('98', 'front', 8.7, 25.6, 67.0, 6.5, 12.7),
        ('2T1', 'front', -16.5, 12.3, 47.1, 6.5, 9.3),
        ('4T2', 'front', -4.3, 12.3, 47.1, 6.5, 9.3),
        ('6T3', 'front', 7.8, 12.3, 47.1, 6.5, 9.3),
    ],
    # Schneider XA2ED33: dois blocos de contactos na traseira, parafusos em cima/baixo.
    'selectorSchneiderXa2ed33': [
        ('13', 'back', -9.4, 30.0, 0.0, 5.0, 4.6),
        ('14', 'back', -9.4, 10.0, 0.0, 5.0, 3.0),
        ('23', 'back', 9.6, 30.0, 0.0, 5.0, 3.0),
        ('24', 'back', 9.6, 10.0, 0.0, 5.0, 3.0),
    ],
    # WEG CWBC65: fila traseira do topo (1/3/5 + A1); a saída inferior não está
    # desenhada no CAD — fica por baixo das mesmas colunas.
    'contactorWegCwbc65': [
        ('1L1', 'top', -15.7, 159.4, 45.0, 6.6, 9.0),
        ('3L2', 'top', -5.5, 159.4, 45.0, 6.6, 8.3),
        ('5L3', 'top', 4.7, 159.4, 45.0, 6.6, 8.3),
        ('A1', 'top', 14.5, 159.4, 45.0, 6.4, 8.1),
        ('2T1', 'bottom', -15.7, 0.0, 45.0, 6.6, 3.0),
        ('4T2', 'bottom', -5.5, 0.0, 45.0, 6.6, 3.0),
        ('6T3', 'bottom', 4.7, 0.0, 45.0, 6.6, 3.0),
        ('A2', 'bottom', 14.5, 0.0, 45.0, 6.4, 3.0),
    ],
    # WEG SPW12: três entradas inferiores medidas (Ø 11,3 mm).
    'surgeProtectorWegSpw12': [
        ('+', 'bottom', -18.0, 0.0, 50.0, 11.3, 18.7),
        ('-', 'bottom', 0.0, 0.0, 50.0, 11.3, 18.7),
        ('PE', 'bottom', 18.0, 0.0, 50.0, 11.3, 18.7),
    ],
    # Siemens 3TK2840: quatro filas de três parafusos (22,5 mm); entradas no topo e na base.
    'safetyRelaySiemens3tk2840': [
        ('A1', 'top', -7.0, 98.6, 42.0, 5.9, 12.6),
        ('Y11', 'top', 0.0, 98.6, 42.0, 5.9, 12.6),
        ('Y12', 'top', 7.0, 98.6, 42.0, 5.9, 12.6),
        ('Y21', 'top', -7.0, 89.6, 70.0, 5.9, 12.6),
        ('Y22', 'top', 0.0, 89.6, 70.0, 5.9, 12.6),
        ('Y20', 'top', 7.0, 89.6, 70.0, 5.9, 12.6),
        ('Y33', 'bottom', -7.0, 10.4, 70.0, 5.9, 12.6),
        ('Y34', 'bottom', 0.0, 10.4, 70.0, 5.9, 12.6),
        ('14', 'bottom', 7.0, 10.4, 70.0, 5.9, 12.6),
        ('24', 'bottom', -7.0, 1.4, 42.0, 5.9, 12.6),
        ('A2', 'bottom', 0.0, 1.4, 42.0, 5.9, 12.6),
    ],
    # Schneider GV2ME: 1/3/5 em cima e 2/4/6 em baixo (Ø 13 mm, parafusos na frente).
    'motorBreakerSchneiderGv2me': [
        ('1', 'top', -14.6, 89.2, 38.5, 12.9, 6.2),
        ('3', 'top', 0.0, 89.2, 38.5, 12.9, 6.2),
        ('5', 'top', 14.6, 89.2, 38.5, 12.9, 6.2),
        ('2', 'bottom', -14.6, 0.0, 38.5, 11.0, 11.0),
        ('4', 'bottom', 0.0, 0.0, 38.5, 11.0, 11.0),
        ('6', 'bottom', 14.6, 0.0, 38.5, 11.0, 11.0),
    ],
    # Telemecanique XUKT1KSML2: os três fios saem da ponta do cabo (lado esquerdo).
    'photoSensorXukt1ksml2': [
        ('V+', 'left', -16.9, 4.5, 14.6, 1.5, 1.0),
        ('0V', 'left', -16.9, 2.5, 12.6, 1.5, 1.0),
        ('OUT', 'left', -16.9, 4.5, 10.6, 1.5, 1.0),
    ],
    # EAO 61: elemento de comutação na traseira — fila central de três lâminas.
    'keyActuatorEao61': [
        ('11', 'back', 0.0, 22.5, 0.0, 2.0, 1.5),
        ('12', 'back', 7.6, 22.5, 0.0, 2.0, 1.5),
        ('14', 'back', -7.6, 22.5, 0.0, 2.0, 1.5),
    ],
    # Torre SB2-3011: quatro fios pela base (comum + uma cor por fio).
    'towerLightSb23011': [
        ('R', 'bottom', -12.0, 0.0, 35.5, 2.0, 1.0),
        ('Y', 'bottom', -4.0, 0.0, 35.5, 2.0, 1.0),
        ('G', 'bottom', 4.0, 0.0, 35.5, 2.0, 1.0),
        ('COM', 'bottom', 12.0, 0.0, 35.5, 2.0, 1.0),
    ],
}


# Contactos sem cavidade (ver `RealTerminalSpot.contact`): pinos, lâminas, pontas de fio e faces sem borne desenhado.
CONTACTS = {
    'thermalRelaySiemens3ru1116': {'1L1': 'pin', '3L2': 'pin', '5L3': 'pin'},
    'keyActuatorEao61': {'11': 'pin', '12': 'pin', '14': 'pin'},
    'photoSensorXukt1ksml2': {'V+': 'lead', '0V': 'lead', 'OUT': 'lead'},
    'towerLightSb23011': {'R': 'lead', 'Y': 'lead', 'G': 'lead', 'COM': 'lead'},
    'contactorWegCwbc65': {'2T1': 'surface', '4T2': 'surface', '6T3': 'surface', 'A2': 'surface'},
    'motorBreakerSchneiderGv2me': {'2': 'surface', '4': 'surface', '6': 'surface'},
}


def main():
    root = pathlib.Path(__file__).resolve().parent.parent
    models = {row['type']: row for row in json.loads((root / 'src/data/imported-component-models.json').read_text(encoding='utf-8'))}
    target = root / 'src/data/imported-component-terminals.json'
    data = json.loads(target.read_text(encoding='utf-8'))
    for identifier, rows in PLACEMENTS.items():
        size = models[identifier]['physicalSizeMm']
        width, height, depth = size['width'], size['height'], size['depth']
        spots = []
        for label, face, x, y, z, diameter, hole in rows:
            clamp = lambda value: round(min(1.0, max(0.0, value)), 6)
            spot = dict(label=label, face=face, x=clamp((x + width / 2) / width), y=clamp(1 - y / height), z=clamp(z / depth), diameterMm=diameter, holeDepthMm=hole)
            contact = CONTACTS.get(identifier, {}).get(label)
            if contact:
                spot['contact'] = contact
            spots.append(spot)
        data[identifier] = spots
    target.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
    print('bornes posicionados:', ', '.join(f'{key} ({len(rows)})' for key, rows in PLACEMENTS.items()))


if __name__ == '__main__':
    main()
