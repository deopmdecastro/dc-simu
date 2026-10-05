#!/usr/bin/env python3
"""
Gera o GLB do disjuntor tripolar WEG MDW-C10-3 a partir do STEP do fabricante
(`disjuntor-tripolar-weg-mdw-c10-1.snapshot.2.zip`, ficheiro «disjuntor weg - mdw c10.stp»).

    pip install cadquery trimesh numpy
    python3 scripts/build-weg-mdw-glb.py <pasta-com-o-stp> public/models/protecao

Convenção do GLB (a mesma do Steck SD C25, dos Easy9 e do PKZM): metros, de pé
(topo = +Y, bornes 1/3/5), frente (manípulo) = +Z, traseira/patim da calha em z = 0,
sem rotação nem espelho no MODEL_SPECS.

O STEP vem num referencial próprio — altura em X (o topo, com os bornes 1/3/5, é +X),
profundidade em Y (frente = +Y) e largura em Z — e traz **um único sólido** com o
manípulo na posição LIGADA. Aqui:
  · separam-se os triângulos que saem da frente da caixa (y > 29 mm): são o manípulo,
    que fica numa malha `dcsimu_handle_1` (o resto é o corpo, `weg_corpo_1`);
  · o manípulo é rodado para a posição DESLIGADA à volta da charneira medida, para que
    valha a convenção do projeto (OFF = pose do GLB, ON = `throwDeg` graus para cima);
  · os eixos são permutados para a convenção do projeto e a peça é encostada à origem.

No fim imprime as medições usadas em `src/three/modelPaths.ts`, `src/electrical/factory.ts`
e `src/electrical/realInterfaces.ts`.
"""
import json
import math
import sys
from pathlib import Path

import cadquery as cq
import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial

STEP_NAME = "disjuntor weg - mdw c10.stp"
OUT_NAME = "weg-mdw-c10-3p.glb"

# Plano frontal da caixa medido no STEP (a tampa frontal acaba em y = 28,8 mm).
FRONT_Y = 28.8
# Charneira do manípulo: no eixo do pescoço e 11 mm atrás da frente da caixa.
HINGE_BEHIND_MM = 11.0
# Curso adotado entre «0-OFF» e «I-ON» (o CAD vem na posição ligada, 21,4° acima da normal).
# 30° é o curso típico de um manípulo modular e mantém o manípulo dentro da ranhura da frente.
THROW_DEG = 30.0

MATERIALS = {
    "body": PBRMaterial(name="weg_corpo_cinza", baseColorFactor=[226, 228, 226, 255], metallicFactor=0.0, roughnessFactor=0.55),
    "handle": PBRMaterial(name="weg_manipulo_azul", baseColorFactor=[30, 78, 156, 255], metallicFactor=0.0, roughnessFactor=0.42),
}


def rotate_about(points, cx, cy, deg):
    """Roda no plano XY do STEP à volta de (cx, cy). Positivo levanta a ponta do manípulo."""
    a = math.radians(deg)
    x, y = points[:, 0] - cx, points[:, 1] - cy
    out = points.copy()
    out[:, 0] = cx + x * math.cos(a) + y * math.sin(a)
    out[:, 1] = cy - x * math.sin(a) + y * math.cos(a)
    return out


def main(src, out):
    shape = cq.importers.importStep(str(Path(src) / STEP_NAME))
    solids = shape.solids().vals()
    if len(solids) != 1:
        print(f"aviso: {len(solids)} sólidos no STEP (esperado 1)")
    verts, tris = solids[0].tessellate(0.05, 0.25)
    v = np.array([[p.x, p.y, p.z] for p in verts], dtype=float)
    t = np.array(tris, dtype=np.int64)

    # 1) manípulo = o que sai da frente da caixa
    is_handle = v[t].mean(axis=1)[:, 1] > FRONT_Y + 0.2
    groups = {"handle": t[is_handle], "body": t[~is_handle]}

    # 2) charneira e curso, medidos no próprio manípulo
    hv = v[groups["handle"]].reshape(-1, 3)
    neck = hv[hv[:, 1] < FRONT_Y + 1.7]
    hinge_x = float((neck[:, 0].min() + neck[:, 0].max()) / 2)
    hinge_y = FRONT_Y - HINGE_BEHIND_MM
    tip = hv[hv[:, 1] > hv[:, 1].max() - 2.0]
    tip_x, tip_y = float(tip[:, 0].mean()), float(tip[:, 1].mean())
    theta = math.degrees(math.atan2(tip_x - hinge_x, tip_y - hinge_y))
    throw = THROW_DEG
    print(f"manípulo: charneira ({hinge_x:.2f}, {hinge_y:.2f}) · ponta ({tip_x:.2f}, {tip_y:.2f}) · "
          f"ligado {theta:.1f}° acima da normal · curso adotado {throw:.1f}°")

    # 3) o CAD vem LIGADO: baixar o manípulo para a pose desligada (OFF = pose do GLB)
    moved = v.copy()
    handle_ids = np.unique(groups["handle"])
    moved[handle_ids] = rotate_about(v[handle_ids], hinge_x, hinge_y, -throw)

    # 4) eixos do projeto: x = largura (z do STEP), y = altura (x do STEP), z = profundidade (y do STEP)
    app = np.stack([moved[:, 2], moved[:, 0], moved[:, 1]], axis=1)
    app -= app.min(axis=0)
    size = app.max(axis=0)
    hinge_app = np.array([0.0, hinge_x, hinge_y]) - np.stack([moved[:, 2], moved[:, 0], moved[:, 1]]).min(axis=1)

    # 5) cena (metros)
    scene = trimesh.Scene()
    for role, faces in groups.items():
        used = np.unique(faces)
        remap = np.zeros(len(app), dtype=np.int64)
        remap[used] = np.arange(len(used))
        mesh = trimesh.Trimesh(vertices=app[used] * 0.001, faces=remap[faces], process=False)
        mesh.visual = trimesh.visual.TextureVisuals(material=MATERIALS[role])
        name = "dcsimu_handle_1" if role == "handle" else "weg_corpo_1"
        scene.add_geometry(mesh, node_name=name, geom_name=name)
    glb = scene.export(file_type="glb")
    Path(out).mkdir(parents=True, exist_ok=True)
    (Path(out) / OUT_NAME).write_bytes(glb)

    # 6) medições para o código
    hbox = app[np.unique(groups["handle"])]
    poles_mm = [-17.85, 0.0, 17.85]
    report = {
        "size_mm": {"width": round(float(size[0]), 2), "height": round(float(size[1]), 2), "depth": round(float(size[2]), 2)},
        "throw_deg": throw,
        "hinge_mm": {"y": round(float(hinge_app[1]), 2), "z": round(float(hinge_app[2]), 2)},
        "handle_box_mm": {"ymin": round(float(hbox[:, 1].min()), 2), "ymax": round(float(hbox[:, 1].max()), 2),
                          "zmin": round(float(hbox[:, 2].min()), 2), "zmax": round(float(hbox[:, 2].max()), 2)},
        "hinge_fraction": {
            "y": round(float((hinge_app[1] - hbox[:, 1].min()) / (hbox[:, 1].max() - hbox[:, 1].min())), 3),
            "z": round(float((hinge_app[2] - hbox[:, 2].min()) / (hbox[:, 2].max() - hbox[:, 2].min())), 3),
        },
        # bornes: 3 polos a 17,85 mm de passo, furo a y ≈ 6,2 mm do STEP (meio da profundidade)
        "pole_x_fraction": [round((p + size[0] / 2) / float(size[0]), 3) for p in poles_mm],
        "terminal_z_fraction": round(float((6.2 + 36.5) / size[2]), 3),
        "glb_bytes": len(glb),
        "triangles": {"handle": int(len(groups["handle"])), "body": int(len(groups["body"]))},
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
