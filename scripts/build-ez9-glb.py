#!/usr/bin/env python3
"""
Gera os GLB dos disjuntores Schneider Easy9 (EZ9) de 1, 2 e 3 polos a partir dos
STEP do fabricante (EZ3331 · EZ3332 · «1P3 EASY9»).

    pip install cadquery trimesh numpy
    python3 scripts/build-ez9-glb.py <pasta-com-EZ9-1-EZ9-2-EZ9-3> public/models/protecao

Convenção do GLB (a mesma do Steck SD C25): metros, de pé (topo = +Y), frente
(manípulo e parafusos) = +Z, traseira (patim da calha) em z = 0, sem rotação nem espelho.

Normalizações feitas aqui, para que 1P, 2P e 3P sejam coerentes entre si:
  · o STEP do 1P traz o patim da calha DIN puxado 1,9 mm para fora; recolhe-se à posição
    dos STEP de 2P/3P (assim os três assentam igual na calha);
  · o STEP do 1P traz a alavanca na horizontal; os de 2P/3P na posição DESLIGADA
    (ponta para baixo). O 1P é rodado para a mesma pose OFF à volta do cubo da alavanca;
  · o manípulo (alavanca + barra de ligação 2P/3P) vai em malhas `dcsimu_handle_*`,
    que o Painel 3D roda inteiras à volta do cubo (OFF = pose do CAD, ON = ponta para cima).

No fim imprime a medição (cubo, caixas, bornes) usada em src/three/modelPaths.ts e
src/electrical/realInterfaces.ts.
"""
import json
import math
import sys
from pathlib import Path

import cadquery as cq
import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial

# (pasta, ficheiro STEP, polos, ficheiro de saída)
VARIANTS = [
    ("EZ9-1", "EZ3331.STEP", 1, "schneider-ez9-1p.glb"),
    ("EZ9-2", "EZ3332.STEP", 2, "schneider-ez9-2p.glb"),
    ("EZ9-3", "DISJUNTOR 1P3 EASY9.STEP", 3, "schneider-ez9-3p.glb"),
]

# Assinatura (volume em mm³) de cada tipo de sólido do STEP
VOL_BODY, VOL_HANDLE, VOL_CLIP, VOL_SCREW = 75318.4, 1300.8, 1066.9, 69.5


def role_of(solid):
    vol = solid.Volume()
    for role, ref in (("body", VOL_BODY), ("handle", VOL_HANDLE), ("clip", VOL_CLIP), ("screw", VOL_SCREW)):
        if abs(vol - ref) < 1.0:
            return role
    return "bridge"  # barra de ligação dos manípulos (947,9 em 2P · 1427,3 em 3P)


MATERIALS = {
    "body": PBRMaterial(name="ez9_plastico_branco", baseColorFactor=[236, 236, 232, 255], metallicFactor=0.0, roughnessFactor=0.55),
    "handle": PBRMaterial(name="ez9_manipulo_preto", baseColorFactor=[22, 22, 24, 255], metallicFactor=0.0, roughnessFactor=0.38),
    "bridge": PBRMaterial(name="ez9_manipulo_preto", baseColorFactor=[22, 22, 24, 255], metallicFactor=0.0, roughnessFactor=0.38),
    "clip": PBRMaterial(name="ez9_patim_cinza", baseColorFactor=[120, 124, 128, 255], metallicFactor=0.1, roughnessFactor=0.5),
    "screw": PBRMaterial(name="ez9_parafuso_aco", baseColorFactor=[196, 198, 200, 255], metallicFactor=0.9, roughnessFactor=0.32),
}


def mesh_of(solid, tol=0.06):
    verts, tris = solid.tessellate(tol, 0.25)
    v = np.array([[p.x, p.y, p.z] for p in verts], dtype=float)
    return v, np.array(tris, dtype=np.int64)


def rotate_x(v, cy, cz, deg):
    """Rotação à volta de um eixo paralelo a X (por y=cy, z=cz) — mesma convenção do three.js."""
    a = math.radians(deg)
    y, z = v[:, 1] - cy, v[:, 2] - cz
    out = v.copy()
    out[:, 1] = cy + y * math.cos(a) - z * math.sin(a)
    out[:, 2] = cz + y * math.sin(a) + z * math.cos(a)
    return out


def load(variant):
    folder, step, poles, _ = variant
    root = Path(SRC) / folder / step
    shape = cq.importers.importStep(str(root))
    parts = []
    for solid in shape.solids().vals():
        v, t = mesh_of(solid)
        parts.append({"role": role_of(solid), "v": v, "t": t})
    return poles, parts


def bounds(parts, roles=None):
    pts = np.concatenate([p["v"] for p in parts if roles is None or p["role"] in roles])
    return pts.min(axis=0), pts.max(axis=0)


def measure_off_angle(parts, body_front_z, body_bottom):
    """Ângulo (°) da alavanca em relação a +Z, medido no STEP do 2P (pose desligada)."""
    h = [p for p in parts if p["role"] == "handle"][0]
    v = h["v"] - np.array([0, body_bottom, body_front_z])
    hub = np.array([32.5, -8.8])  # (y, z) cubo medido na secção YZ
    arm = v[v[:, 2] > -2.0][:, 1:]
    d = arm.mean(axis=0) - hub
    return math.degrees(math.atan2(-d[0], d[1]))


def main():
    out_dir = Path(OUT)
    out_dir.mkdir(parents=True, exist_ok=True)
    report = {}

    # 1) pose OFF da alavanca (do STEP de 2 polos)
    poles2, parts2 = load(VARIANTS[1])
    body2 = [p for p in parts2 if p["role"] == "body"][0]["v"]
    theta = measure_off_angle(parts2, body2[:, 2].max(), body2[:, 1].min())
    print(f"alavanca desligada: {theta:.1f}° abaixo da horizontal")

    for variant in VARIANTS:
        poles, parts = load(variant)
        bodies = [p for p in parts if p["role"] == "body"]
        bmin, bmax = bounds(bodies)
        back_z, front_z, bottom_y = bmin[2], bmax[2], bmin[1]

        # referencial: base do corpo em y=0, traseira em z=0, mm
        for p in parts:
            p["v"] = p["v"] - np.array([0.0, bottom_y, back_z])
        depth_body = front_z - back_z
        hub_y, hub_z = 32.5, depth_body - 8.8  # cubo da alavanca (medido, relativo à frente do corpo)

        # 2) patim da calha na posição recolhida (-2,5 mm abaixo do corpo)
        clips = [p for p in parts if p["role"] == "clip"]
        cmin = min(p["v"][:, 1].min() for p in clips)
        if abs(cmin - (-2.5)) > 0.05:
            for p in clips:
                p["v"][:, 1] += (-2.5 - cmin)
            print(f"{variant[3]}: patim recolhido {(-2.5 - cmin):+.2f} mm")

        # 3) alavanca do 1P: da horizontal para a pose OFF dos 2P/3P
        for p in parts:
            if p["role"] == "handle":
                ymid = (p["v"][:, 1].min() + p["v"][:, 1].max()) / 2
                if abs(ymid - 32.5) < 0.2 and p["v"][:, 2].max() > depth_body + 5.0:  # ainda na horizontal (1P)
                    p["v"] = rotate_x(p["v"], hub_y, hub_z, theta)

        # 4) origem em x: caixa envolvente total encostada a 0
        allv = np.concatenate([p["v"] for p in parts])
        xmin = allv[:, 0].min()
        for p in parts:
            p["v"][:, 0] -= xmin

        # 5) montar a cena (metros)
        scene = trimesh.Scene()
        counters = {}
        for p in parts:
            role = p["role"]
            counters[role] = counters.get(role, 0) + 1
            idx = counters[role]
            if role == "handle":
                name = f"dcsimu_handle_{idx}"
            elif role == "bridge":
                name = "dcsimu_handle_bridge"
            else:
                name = f"ez9_{ {'body': 'corpo', 'clip': 'patim', 'screw': 'parafuso'}[role] }_{idx}"
            mesh = trimesh.Trimesh(vertices=p["v"] * 0.001, faces=p["t"], process=False)
            mesh.visual = trimesh.visual.TextureVisuals(material=MATERIALS[role])
            scene.add_geometry(mesh, node_name=name, geom_name=name)
        glb = scene.export(file_type="glb")
        (out_dir / variant[3]).write_bytes(glb)

        # 6) medições para o código
        tot_min, tot_max = bounds(parts)
        size = tot_max - tot_min
        handles = [p for p in parts if p["role"] in ("handle", "bridge")]
        hmin, hmax = bounds(handles)
        screws = [p for p in parts if p["role"] == "screw"]
        pole_x = sorted({round(float((p["v"][:, 0].min() + p["v"][:, 0].max()) / 2), 2) for p in screws})
        W, H, D = float(size[0]), float(size[1]), float(size[2])
        report[variant[3]] = {
            "poles": poles,
            "size_mm": {"width": round(W, 2), "height": round(H, 2), "depth": round(D, 2)},
            "pole_centre_x_mm": pole_x,
            "handle_box_mm": {"ymin": round(float(hmin[1]), 2), "ymax": round(float(hmax[1]), 2),
                              "zmin": round(float(hmin[2]), 2), "zmax": round(float(hmax[2]), 2)},
            "hinge_mm": {"y": hub_y, "z": round(hub_z, 2)},
            "hinge_fraction": {"y": round((hub_y - float(hmin[1])) / float(hmax[1] - hmin[1]), 3),
                               "z": round((hub_z - float(hmin[2])) / float(hmax[2] - hmin[2]), 3)},
            "bbox_min_mm": [round(float(x), 2) for x in tot_min],
            "glb_bytes": len(glb),
        }
    report["off_angle_deg"] = round(theta, 1)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    SRC, OUT = sys.argv[1], sys.argv[2]
    main()
