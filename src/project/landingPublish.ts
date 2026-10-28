/**
 * Projeto publicado na landing page.
 *
 * Apenas um projeto de cada vez. O administrador escolhe qualquer projeto
 * (próprio ou de outro utilizador). Se nada estiver publicado, a landing
 * usa o projeto nativo «Partida direta».
 */

import {
  NATIVE_PARTIDA_ID,
  NATIVE_PARTIDA_NAME,
  buildNativeLadder,
  buildNativeGrafcet,
  nativePartidaDiretaContent,
  NATIVE_DEMO_NAMES,
  nativeDemoTable,
} from './nativeProjects'
import type { LadderRung } from '../types'
import type { GrafcetProgram } from '../grafcet/engine'

export type LandingPublishedMeta = {
  projectId: string
  name: string
  owner: string
  revision: number
  updatedAt: string
  /** true quando é o conteúdo nativo embutido (fallback ou publicação do nativo). */
  isNative: boolean
}

export type LandingPublishedPayload = LandingPublishedMeta & {
  content: Record<string, unknown>
}

export type LandingDemoSlice = {
  meta: LandingPublishedMeta
  ladder: LadderRung[]
  grafcet: GrafcetProgram
  names: Record<string, string>
  demoTable: (plcRunning: boolean, motorOn: boolean) => Record<string, boolean>
}

/** Extrai Ladder + GRAFCET + nomes a partir do content JSON do projeto. */
export function sliceLandingDemo(payload: LandingPublishedPayload): LandingDemoSlice {
  const content = payload.content ?? {}
  const ladderRaw = (content as { ladder?: { rungs?: LadderRung[] } }).ladder?.rungs
  const ladder = Array.isArray(ladderRaw) && ladderRaw.length ? ladderRaw : buildNativeLadder()
  const grafcetRaw = (content as { grafcet?: GrafcetProgram }).grafcet
  const grafcet =
    grafcetRaw && Array.isArray(grafcetRaw.steps) && grafcetRaw.steps.length
      ? grafcetRaw
      : buildNativeGrafcet()

  const tags = (content as { tags?: Array<{ address?: string; name?: string }> }).tags
  const names: Record<string, string> = { ...NATIVE_DEMO_NAMES }
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      if (tag?.address && tag?.name) names[tag.address] = tag.name
    }
  }

  return {
    meta: {
      projectId: payload.projectId,
      name: payload.name,
      owner: payload.owner,
      revision: payload.revision,
      updatedAt: payload.updatedAt,
      isNative: payload.isNative,
    },
    ladder,
    grafcet,
    names,
    demoTable: nativeDemoTable,
  }
}

/** Fallback offline / sem publicação: projeto nativo. */
export function nativeLandingPayload(): LandingPublishedPayload {
  return {
    projectId: NATIVE_PARTIDA_ID,
    name: NATIVE_PARTIDA_NAME,
    owner: 'admin@dcsimu.local',
    revision: 0,
    updatedAt: new Date().toISOString(),
    isNative: true,
    content: nativePartidaDiretaContent(),
  }
}

export { NATIVE_PARTIDA_ID, NATIVE_PARTIDA_NAME }
