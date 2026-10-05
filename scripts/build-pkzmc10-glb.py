#!/usr/bin/env python3
"""
Gera o GLB do disjuntor-motor Moeller/Eaton PKZM C-10 a partir do STEP do fabricante.

    pip install cadquery trimesh numpy
    python3 scripts/build-pkzmc10-glb.py <pasta-com-o-STEP> public/models/protecao

Convenção do GLB (a mesma do Steck SD C25 e dos Easy9): metros, de pé (topo = +Y, bornes
1/L1·3/L2·5/L3), frente (botão rotativo verde e TEST) = +Z, traseira/patim da calha em z = 0,
sem rotação nem espelho no MODEL_SPECS.

O botão rotativo vai em malhas `dcsimu_handle_*`, que o Painel 3D roda à volta do eixo do
botão (eixo paralelo a Z): OFF = pose do CAD (manípulo deitado, «O»), ON = -90° («I»).

No fim imprime as medições usadas em src/three/modelPaths.ts e src/electrical/realInterfaces.ts.
"""
import json
import sys
from pathlib import Path

import cadquery as cq
import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial

STEP_NAME = "PKZMC-10 - Moeller.STEP"
OUT_NAME = "eaton-pkzmc-10.glb"

MATERIALS = {
    "shell": PBRMaterial(name="pkzm_corpo_preto", baseColorFactor=[38, 38, 40, 255], metallicFactor=0.0, roughnessFactor=0.55),
    "front": PBRMaterial(name="pkzm_frente_branca", baseColorFactor=[238, 238, 234, 255], metallicFactor=0.0, roughnessFactor=0.5),
    "knob": PBRMaterial(name="pkzm_botao_verde", baseColorFactor=[46, 122, 46, 255], metallicFactor=0.0, roughnessFactor=0.4),
    "collar": PBRMaterial(name="pkzm_aro_preto", baseColorFactor=[26, 26, 28, 255], metallicFactor=0.0, roughnessFactor=0.4),
    "test": PBRMaterial(name="pkzm_botao_test", baseColorFactor=[70, 74, 80, 255], metallicFactor=0.1, roughnessFactor=0.45),
    "terminal": PBRMaterial(name="pkzm_borne_aco", baseColorFactor=[168, 170, 174, 255], metallicFactor=0.85, roughnessFactor=0.38),
    "screw": PBRMaterial(name="pkzm_parafuso_aco", baseColorFactor=[198, 200, 202, 255], metallicFactor=0.9, roughnessFactor=0.3),
    "clip": PBRMaterial(name="pkzm_patim_cinza", baseColorFactor=[122, 126, 130, 255], metallicFactor=0.2, roughnessFactor=0.5),
    "marking": PBRMaterial(name="pkzm_serigrafia", baseColorFactor=[24, 24, 26, 255], metallicFactor=0.0, roughnessFactor=0.6),
}


def role_of(solid):
    """Classifica cada sólido do STEP por volume e posição (medidos no ficheiro do fabricante)."""
    bb = solid.BoundingBox()
    vol = solid.Volume()
    if vol < 1.0:
        return "marking"
    if vol > 20000:
        return "shell"           # caixa preta traseira
    if vol > 5000:
        return "front"           # frente branca
    if abs(vol - 771.7) < 5 and bb.zmin > 60:
        return "knob"            # botão rotativo verde
    if abs(vol - 315.3) < 5 and bb.zmin > 60:
        return "collar"          # aro quadrado do botão (roda com ele)
    if abs(vol - 129.1) < 5:
        return "test"            # botão TEST
    if abs(vol - 215.0) < 2:
        return "terminal"        # blocos de ligação 1/3/5 e 2/4/6
    if abs(vol - 61.1) < 2 or abs(vol - 20.6) < 2:
        return "screw"
    if bb.zmax < 10:
        return "clip"            # patim/mola da calha DIN
    return "shell"


def mesh_of(solid, tol=0.05):
    verts, tris = solid.tessellate(tol, 0.25)
    return np.array([[p.x, p.y, p.z] for p in verts], dtype=float), np.array(tris, dtype=np.int64)


def main(src, out):
    shape = cq.importers.importStep(str(Path(src) / STEP_NAME))
    parts = []
    for solid in shape.solids().vals():
        v, t = mesh_of(solid)
        parts.append({"role": role_of(solid), "v": v, "t": t})

    allv = np.concatenate([p["v"] for p in parts])
    origin = np.array([allv[:, 0].min(), allv[:, 1].min(), allv[:, 2].min()])
    for p in parts:
        p["v"] = p["v"] - origin
    allv = np.concatenate([p["v"] for p in parts])
    size = allv.max(axis=0)

    scene = trimesh.Scene()
    counters = {}
    for p in parts:
        role = p["role"]
        counters[role] = counters.get(role, 0) + 1
        idx = counters[role]
        if role == "knob":
            name = "dcsimu_handle_1"
        elif role == "collar":
            name = "dcsimu_handle_2"
        else:
            name = f"pkzm_{role}_{idx}"
        mesh = trimesh.Trimesh(vertices=p["v"] * 0.001, faces=p["t"], process=False)
        mesh.visual = trimesh.visual.TextureVisuals(material=MATERIALS[role])
        scene.add_geometry(mesh, node_name=name, geom_name=name)
    glb = scene.export(file_type="glb")
    Path(out).mkdir(parents=True, exist_ok=True)
    (Path(out) / OUT_NAME).write_bytes(glb)

    # Medições para o código
    hinge = np.array([2.6, -4.6, 0.0]) - origin  # eixo do botão, medido nas faces cilíndricas
    term = [p for p in parts if p["role"] == "terminal"]
    tops = sorted([p for p in term if p["v"][:, 1].mean() > size[1] / 2], key=lambda p: p["v"][:, 0].mean())
    bots = sorted([p for p in term if p["v"][:, 1].mean() <= size[1] / 2], key=lambda p: p["v"][:, 0].mean())

    def frac(p):
        return {
            "x": round(float((p["v"][:, 0].min() + p["v"][:, 0].max()) / 2 / size[0]), 3),
            "y_top": round(float(size[1] - p["v"][:, 1].max()) / float(size[1]), 3),
            "y_bottom": round(float(p["v"][:, 1].min()) / float(size[1]), 3),
            "z": round(float((p["v"][:, 2].min() + p["v"][:, 2].max()) / 2 / size[2]), 3),
            "width_mm": round(float(p["v"][:, 0].max() - p["v"][:, 0].min()), 2),
        }

    report = {
        "size_mm": {"width": round(float(size[0]), 2), "height": round(float(size[1]), 2), "depth": round(float(size[2]), 2)},
        "hinge_mm": {"x": round(float(hinge[0]), 2), "y": round(float(hinge[1]), 2)},
        "hinge_fraction": {"x": round(float(hinge[0] / size[0]), 3), "y": round(float(hinge[1] / size[1]), 3)},
        "terminals_top": [frac(p) for p in tops],
        "terminals_bottom": [frac(p) for p in bots],
        "roles": {k: v for k, v in sorted(counters.items())},
        "glb_bytes": len(glb),
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
