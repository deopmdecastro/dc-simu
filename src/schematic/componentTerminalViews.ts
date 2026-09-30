import type {
  ComponentTerminalViewPosition,
  ComponentTerminalViewPositions,
  ComponentViewOrientation,
  ElectricalComponent,
  Terminal,
} from '../types'
import {
  componentOrientationOf,
  componentTerminalViewKey,
  isOriginalComponentOrientation,
  orientationRadians,
} from '../three/componentOrientation'
import { logoTerminalLocal } from './logoTerminalGeometry'
import { proautoTerminalLocal } from './proautoTerminalGeometry'
import { wegTerminalLocal } from './wegTerminalGeometry'
import { terminal3DPositionOf } from '../three/terminal3D'
import { getComponentModelSpec } from '../three/modelPaths'
import { CAPTURE_FRAME_PADDING } from '../three/captureFrame'
import * as THREE from 'three'

type Point3 = { x: number; y: number; z: number }

/** Posição frontal calibrada (ou a posição normalizada do template). */
export function baseTerminalLocal(component: ElectricalComponent, terminal: Terminal): { x: number; y: number } {
  return component.type === 'contactorWegCWC09'
    ? wegTerminalLocal(component, terminal)
    : component.type === 'powerSupplyProauto24A'
      ? proautoTerminalLocal(component, terminal)
      : logoTerminalLocal(component, terminal)
}

/** Mesma convenção do Painel 3D e da captura ortográfica (Euler XYZ do three.js:
 * Z, depois Y, depois X aplicados ao vetor). A versão anterior aplicava X→Y→Z,
 * o que desalinhava os bornes em vistas com mais de um eixo (ex.: isométrica). */
function rotate(point: Point3, orientation?: Partial<ComponentViewOrientation> | null): Point3 {
  const [rx, ry, rz] = orientationRadians(orientation)
  const v = new THREE.Vector3(point.x, point.y, point.z).applyEuler(new THREE.Euler(rx, ry, rz, 'XYZ'))
  return { x: v.x, y: v.y, z: v.z }
}

function projectedGeometry(component: ElectricalComponent, orientation: ComponentViewOrientation) {
  const width = Math.max(1, component.w)
  const height = Math.max(1, component.h)
  // Sem metadados de malha por borne, a profundidade física é estimada. A
  // sugestão serve como ponto de partida e pode sempre ser corrigida à mão.
  // Profundidade real do CAD quando existe ficha física (mesma escala que o
  // footprint do esquema); caso contrário, estimativa conservadora.
  const physical = getComponentModelSpec(component.type)?.physicalSizeMm
  const depth = physical
    ? Math.max(4, physical.depth * ((width / physical.width + height / physical.height) / 2))
    : Math.max(8, Math.min(width, height) * 0.42)
  const corners: Point3[] = []
  for (const x of [-width / 2, width / 2]) for (const y of [-height / 2, height / 2]) for (const z of [-depth / 2, depth / 2]) corners.push(rotate({ x, y, z }, orientation))
  const minX = Math.min(...corners.map((point) => point.x))
  const maxX = Math.max(...corners.map((point) => point.x))
  const minY = Math.min(...corners.map((point) => point.y))
  const maxY = Math.max(...corners.map((point) => point.y))
  const projectedW = Math.max(1, maxX - minX)
  const projectedH = Math.max(1, maxY - minY)
  const visualW = Math.max(width, projectedW)
  const visualH = Math.max(height, projectedH)
  return {
    width,
    height,
    depth,
    minX,
    maxY,
    projectedW,
    projectedH,
    x: (width - visualW) / 2,
    y: (height - visualH) / 2,
    w: visualW,
    h: visualH,
  }
}

/**
 * Retângulo exato onde a captura ortográfica orientada é desenhada.
 *
 * Os bornes são projetados em torno do centro do footprint, à escala natural da
 * projeção; a captura acrescenta `CAPTURE_FRAME_PADDING` à volta do modelo.
 * Desenhar a imagem neste retângulo (e não numa união de caixas estimadas)
 * faz os bornes acompanharem o corpo em qualquer rotação.
 */
export function orientedImageFrame(component: ElectricalComponent, orientation = componentOrientationOf(component)) {
  if (isOriginalComponentOrientation(orientation)) return { x: 0, y: 0, w: component.w, h: component.h }
  const geometry = projectedGeometry(component, orientation)
  const w = geometry.projectedW * CAPTURE_FRAME_PADDING
  const h = geometry.projectedH * CAPTURE_FRAME_PADDING
  return { x: (component.w - w) / 2, y: (component.h - h) / 2, w, h }
}

/** Limites previstos da projeção, centrados sem deslocar a posição elétrica. */
export function projectedComponentBounds(component: ElectricalComponent, orientation = componentOrientationOf(component)) {
  if (isOriginalComponentOrientation(orientation)) return { x: 0, y: 0, w: component.w, h: component.h }
  const geometry = projectedGeometry(component, orientation)
  return { x: geometry.x, y: geometry.y, w: geometry.w, h: geometry.h }
}

/** Sugestão ortográfica: projeta o ponto frontal do borne com os mesmos três
 * eixos usados no modelo. Não pretende substituir a calibração manual. */
export function projectedTerminalLocal(
  component: ElectricalComponent,
  terminal: Terminal,
  orientation = componentOrientationOf(component),
): { x: number; y: number } {
  const base = baseTerminalLocal(component, terminal)
  if (isOriginalComponentOrientation(orientation) && !terminal.position3D) return base
  const geometry = projectedGeometry(component, orientation)
  const defined3D = terminal.position3D ? terminal3DPositionOf(terminal) : null
  const point = rotate(defined3D ? {
    x: (defined3D.x - 0.5) * geometry.width,
    y: (defined3D.y - 0.5) * geometry.height,
    z: (defined3D.z - 0.5) * geometry.depth,
  } : {
    x: base.x - geometry.width / 2,
    y: geometry.height / 2 - base.y,
    z: geometry.depth / 2,
  }, orientation)
  const leftPad = (geometry.w - geometry.projectedW) / 2
  const topPad = (geometry.h - geometry.projectedH) / 2
  return {
    x: geometry.x + leftPad + point.x - geometry.minX,
    y: geometry.y + topPad + geometry.maxY - point.y,
  }
}

function automaticProjectedPositions(component: ElectricalComponent, orientation: ComponentViewOrientation) {
  const projected = component.terminals.map((terminal) => ({ terminal, point: projectedTerminalLocal(component, terminal, orientation) }))
  if (isOriginalComponentOrientation(orientation)) return new Map(projected.map(({ terminal, point }) => [terminal.id, point]))

  // Numa vista lateral vários bornes do mesmo plano podem ter exatamente a
  // mesma projeção ortográfica. Um pequeno leque visual mantém todos
  // selecionáveis sem fingir que a sugestão substitui a calibração manual.
  const result = new Map<string, { x: number; y: number }>()
  const consumed = new Set<string>()
  const threshold = Math.max(3, Math.min(component.w, component.h) * 0.025)
  for (const item of projected) {
    if (consumed.has(item.terminal.id)) continue
    const cluster = projected.filter((candidate) => !consumed.has(candidate.terminal.id)
      && Math.hypot(candidate.point.x - item.point.x, candidate.point.y - item.point.y) <= threshold)
    cluster.forEach((candidate) => consumed.add(candidate.terminal.id))
    const spacing = Math.max(8, Math.min(14, component.w * 0.045))
    cluster.forEach((candidate, index) => result.set(candidate.terminal.id, {
      x: candidate.point.x + (index - (cluster.length - 1) / 2) * spacing,
      y: candidate.point.y,
    }))
  }
  return result
}

export function componentTerminalLocal(
  component: ElectricalComponent,
  terminal: Terminal,
  orientation = componentOrientationOf(component),
  viewPositions: ComponentTerminalViewPositions | undefined = component.terminalViewPositions,
): { x: number; y: number } {
  const positions = viewPositions?.[componentTerminalViewKey(orientation)]
  const terminalIndex = component.terminals.findIndex((item) => item.id === terminal.id)
  const manual = positions?.[terminal.id]
    ?? positions?.[`index:${terminalIndex}`]
    ?? positions?.[`label:${terminal.label}`]
  if (manual && Number.isFinite(manual.x) && Number.isFinite(manual.y)) {
    return { x: manual.x * component.w, y: manual.y * component.h }
  }
  return automaticProjectedPositions(component, orientation).get(terminal.id)
    ?? projectedTerminalLocal(component, terminal, orientation)
}

export function automaticTerminalViewPositions(
  component: ElectricalComponent,
  orientation: ComponentViewOrientation,
): Record<string, ComponentTerminalViewPosition> {
  const projected = automaticProjectedPositions(component, orientation)
  return Object.fromEntries(component.terminals.map((terminal) => {
    const point = projected.get(terminal.id) ?? projectedTerminalLocal(component, terminal, orientation)
    return [terminal.id, { x: point.x / component.w, y: point.y / component.h }]
  }))
}
