import { ladderCoverSvg, grafcetCoverSvg, flowCoverSvg } from '../src/dashboard/flowCover'
import { buildProjectPreview, isEmptyPreview } from '../src/dashboard/projectPreview'
import { grafcetExampleContent, grafcetExamples } from '../src/project/grafcetExamples'
import { nativePartidaDiretaContent } from '../src/project/nativeProjects'
let failed = 0
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failed++ }
const rung: any = { id: 'r', name: 'R1', enabled: true, branches: [{ id: 'b', elements: [{ kind: 'contact', id: 'c', address: 'I0.0', contactType: 'NO' }] }], coils: [{ kind: 'coil', id: 'q', address: 'Q0.0', coilType: 'COIL' }] }
const g: any = { steps: [{ id: 'a', name: 'E0', initial: true, action: '', condition: '' }, { id: 'b', name: 'E1', initial: false, action: 'Q1', condition: 'I0.0' }], transitions: [{ id: 't', from: ['a'], to: ['b'], condition: 'I0.0' }] }
check('ladder vazio → sem cover', ladderCoverSvg([]) === null)
check('grafcet vazio → sem cover', grafcetCoverSvg({ steps: [] }) === null)
check('ladder gera SVG com a network', !!ladderCoverSvg([rung])?.includes('NETWORK 1'))
check('grafcet gera SVG com a transição', !!grafcetCoverSvg(g)?.includes('I0.0'))
check('kind ladder usa o ladder', !!flowCoverSvg({ kind: 'ladder', rungs: [rung], grafcet: g })?.includes('LADDER'))
check('kind grafcet usa o grafcet', !!flowCoverSvg({ kind: 'grafcet', rungs: [rung], grafcet: g })?.includes('GRAFCET'))
check('kind all sem 3D e com grafcet → grafcet', !!flowCoverSvg({ kind: 'all', rungs: [], grafcet: g })?.includes('GRAFCET'))
check('escapa texto perigoso', !grafcetCoverSvg({ ...g, transitions: [{ ...g.transitions[0], condition: '<b>&' }] })!.includes('<b>'))
// Capas do dashboard a partir do conteúdo real (exemplos semeados nunca abertos e nativo).
for (const example of grafcetExamples()) {
  const preview = buildProjectPreview(grafcetExampleContent(example))
  check(`exemplo ${example.nativeId}: GRAFCET com o diagrama real como capa`, preview.kind === 'grafcet' && !!preview.flow?.startsWith('data:image/svg+xml') && !isEmptyPreview(preview))
}
const native = nativePartidaDiretaContent() as Record<string, unknown> & { components: unknown[]; wires: unknown[] }
const nativePreview = buildProjectPreview(native)
check('nativo sem cover: esquema real (componentes e cabos do projeto)', nativePreview.components.length === native.components.length && nativePreview.stats?.wires === native.wires.length && !nativePreview.flow)
const photo = 'data:image/jpeg;base64,' + 'A'.repeat(64)
check('cover 3D guardado prevalece sobre o desenho', buildProjectPreview({ ...native, cover: photo }).cover === photo)
check('GRAFCET com cover guardado não gera desenho', !buildProjectPreview({ ...grafcetExampleContent(grafcetExamples()[0]), cover: photo }).flow)
process.exit(failed ? 1 : 0)
