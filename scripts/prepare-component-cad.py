"""Extrai apenas CAD neutro/referências dos ZIP fornecidos, sem executar o conteúdo.

python scripts/prepare-component-cad.py <pasta-zip> <pasta-local-de-trabalho>
Os ZIP originais são preservados. A conversão para GLB é um passo separado.
"""
import hashlib
import json
import pathlib
import sys
import zipfile

SOURCES = {
    '194514205': 'fuseHolderSchneiderDf103nv',
    '194514331': 'fuseHolderSchneiderDf101v',
    '194514351': 'fuseHolderSchneiderDf81n',
    '194515169': 'keyActuatorEao61',
    '3ru1116': 'thermalRelaySiemens3ru1116',
    'cfc225p': 'residualBreakerHagerCfc225p',
    'chave-fim': 'limitSwitchLongRoller',
    'comutador': 'selectorSchneiderXa2ed33',
    'contactor-cwbc65': 'contactorWegCwbc65',
    'protector-contra-sobretensiones-surge-protectors-weg-spw02': 'surgeProtectorWegSpw02',
    'protector-contra-sobretensiones-surge-protectors-weg-spw12': 'surgeProtectorWegSpw12',
    'safetyrelay': 'safetyRelaySiemens3tk2840',
    'schneidereletric': 'motorBreakerSchneiderGv2me',
    'start-button': 'buttonStart22',
    'stop-button': 'buttonStop22',
    'torre-de': 'towerLightSb23011',
    'xukt1': 'photoSensorXukt1ksml2',
}


def prepare(source, output):
    source, output = pathlib.Path(source).resolve(), pathlib.Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    records = []
    for prefix, identifier in SOURCES.items():
        archives = list(source.glob(prefix + '*.zip'))
        if len(archives) != 1:
            raise ValueError(f'{prefix}: esperado exatamente um ZIP; encontrados {len(archives)}')
        archive = archives[0]
        target = output / identifier
        target.mkdir(exist_ok=True)
        with zipfile.ZipFile(archive) as zipped:
            entries = [i for i in zipped.infolist() if not i.is_dir()]
            if any(i.file_size > 150_000_000 for i in entries):
                raise ValueError('Ficheiro descomprimido demasiado grande')
            steps = [i for i in entries if pathlib.PurePosixPath(i.filename).suffix.lower() in ('.step', '.stp') and 'mirror' not in i.filename.lower()]
            if len(steps) > 1:
                raise ValueError(f'{identifier}: seleção STEP ambígua')
            record = {'type': identifier, 'archive': archive.name, 'archiveSha256': hashlib.sha256(archive.read_bytes()).hexdigest()}
            if steps:
                data = zipped.read(steps[0])
                (target / 'source.step').write_bytes(data)
                record.update(member=steps[0].filename, sourceSha256=hashlib.sha256(data).hexdigest(), format='STEP')
            else:
                # Mantém a estrutura para resolver as peças de conjuntos Inventor.
                for entry in entries:
                    if pathlib.PurePosixPath(entry.filename).suffix.lower() not in ('.ipt', '.iam', '.sldprt'):
                        continue
                    path = (target / entry.filename).resolve()
                    if not path.is_relative_to(target.resolve()):
                        raise ValueError('Caminho ZIP fora da pasta de trabalho')
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(zipped.read(entry))
                record.update(format='NATIVE_CAD', status='requires-neutral-export')
            previews = [i for i in entries if pathlib.PurePosixPath(i.filename).suffix.lower() in ('.jpg', '.png')]
            if previews:
                preview = max(previews, key=lambda i: i.file_size)
                suffix = pathlib.PurePosixPath(preview.filename).suffix.lower()
                (target / ('reference' + suffix)).write_bytes(zipped.read(preview))
            records.append(record)
            print(identifier, record['format'], flush=True)
    (output / 'sources.json').write_text(json.dumps(records, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    prepare(*sys.argv[1:])
