/**
 * Ladder do projeto nativo «Partida direta» alinhado com o gerador do GRAFCET (`ladder-sync-v1`).
 *
 * O Ladder nativo usava nomes próprios («FC1 [Grafcet]», «OB100 [Complete restart]») que o gerador
 * do GRAFCET não reconhece: o GRAFCET via-o desatualizado e a atualização automática trocava-o pelo
 * método dos bits de etapa, deixando dois OB100 e as saídas do LOGO! sem atuar no quadro 3D.
 * Aqui o Ladder gerado é refeito a partir do GRAFCET do próprio projeto, com as convenções do gerador
 * («Grafcet [FC 1]», «Outputs [FC 2]», «Complete restart [OB 100]»). Só corre se o Main [OB1] tiver
 * apenas networks geradas («GRAFCET ·»): networks do utilizador nunca são tocadas.
 * v2: lê e escreve o programa e as tags efetivos do LOGO! (`plcPrograms`/`plcTags` num projeto já gravado,
 * que a app usa ao abrir); a v1 só escrevia em `ladder`/`tags` e num projeto gravado não tinha efeito.
 * v3: títulos e comentários das networks explicam tags E/S e funcionamento (T1/T2, KM1, H1–H3).
 */
import type { LadderRung } from '../types'
import type { ProjectFile } from '../ladder/projectFiles'
import { validateGrafcet, type GrafcetProgram } from '../grafcet/engine'
import { NATIVE_PARTIDA_ID } from './nativeMotorMeter'
import { buildNativeWordProgram, nativeProgramOf, NATIVE_PLC_ID, withNativeProgram } from './nativeProjects'

export const NATIVE_LADDER_SYNC_FEATURE = 'ladder-sync-v3'

/** Variáveis criadas pelo gerador (registo de etapa, memórias e bits de etapa): são refeitas. */
const GENERATED_NAME = /^(G\d+|Evolucao_G0|Etapa_|Rec_T|Temp_T|Tempo_[DL]_|Mem_|Cont_)/
const GENERATED_COMMENT = /^(Registo de etapa|Evolução do GRAFCET|Bit da etapa|Receptividade T|Temporização|Tempo [DL] de|Valor memorizado|Valor contínuo|Saída do GRAFCET|Entrada usada em)/
const isGeneratedTag = (t: any) => typeof t?.name === 'string' && GENERATED_NAME.test(t.name) && GENERATED_COMMENT.test(t.comment ?? '')
/** Blocos gerados: os nativos antigos, os FC do registo de etapa e um OB100 só com networks geradas. */
const isGeneratedFile = (f: ProjectFile) =>
  ['native-fc-grafcet', 'native-fc-outputs', 'native-ob100'].includes(f.id)
  || (f.folder === 'programBlocks' && !f.exec && /^(Grafcet|Outputs)\s*\[FC\s*\d+\]$/i.test(f.name.trim()))
  || (f.exec === 'obStartup' && /\[OB\s*100\s*\]/i.test(f.name) && (f.rungs ?? []).every((r) => r.name.startsWith('Complete restart ·')))

export function syncNativeLadder<T extends Record<string, any>>(content: T): T {
  if (content.nativeId !== NATIVE_PARTIDA_ID) return content
  const features: string[] = Array.isArray(content.nativeFeatures) ? content.nativeFeatures.filter((v: unknown) => typeof v === 'string') : []
  if (features.includes(NATIVE_LADDER_SYNC_FEATURE)) return content
  const done = (next: Record<string, any>) => ({ ...next, nativeFeatures: [...features, NATIVE_LADDER_SYNC_FEATURE] }) as unknown as T
  const grafcet = content.grafcet as GrafcetProgram | undefined
  const effective = nativeProgramOf(content)
  const main: LadderRung[] = effective.rungs
  const files: ProjectFile[] = Array.isArray(content.projectFiles?.[NATIVE_PLC_ID]) ? content.projectFiles[NATIVE_PLC_ID] : []
  // Networks geradas: título antigo «GRAFCET · …» ou o anotado «Main · CALL …».
  const onlyGenerated = main.length > 0 && main.every((r) => typeof r?.name === 'string' && (/^GRAFCET ·/.test(r.name) || /^Main · CALL/.test(r.name)))
  if (!grafcet?.steps?.length || !onlyGenerated || validateGrafcet(grafcet).some((i) => i.level === 'error')) return done(content)
  const tags = effective.tags.filter((t: any) => !isGeneratedTag(t))
  const program = buildNativeWordProgram(grafcet, tags)
  return done(withNativeProgram({
    ...content,
    projectFiles: { ...(content.projectFiles ?? {}), [NATIVE_PLC_ID]: [...files.filter((f) => !isGeneratedFile(f)), ...program.files] },
  }, { rungs: program.mainRungs, tags: program.tags }))
}
