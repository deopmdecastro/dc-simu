import { useEffect, useMemo, useState } from 'react'
import { FACES, type Face } from '../../catalog/terminalProfiles'
import { IconCube, IconCursor, IconPlus } from '../../ui/icons'
import { canCapture, captureImage } from './capture'
import { useEditorStore } from './editorStore'
import { faceCounts } from './terminalOps'

/** Miniaturas reais do modelo, uma por face (renderizadas pelo viewport). Recalculadas quando a geometria muda. */
export function useFaceThumbs(): Partial<Record<Face, string>> {
  const parts = useEditorStore((s) => s.def.parts)
  const materials = useEditorStore((s) => s.def.materials)
  const assets = useEditorStore((s) => s.def.assets)
  const glbRevision = useEditorStore((s) => s.glbRevision)
  const [thumbs, setThumbs] = useState<Partial<Record<Face, string>>>({})

  useEffect(() => {
    let live = true
    let timer = 0
    let tries = 0
    const run = () => {
      if (!live) return
      if (!canCapture()) { // o motor 3D carrega em diferido: tentar de novo
        if (tries++ < 30) timer = window.setTimeout(run, 300)
        return
      }
      const next: Partial<Record<Face, string>> = {}
      for (const [face] of FACES) {
        const url = captureImage({ view: face, width: 132, height: 100, format: 'jpeg', quality: 0.8 })
        if (url) next[face] = url
      }
      if (live) setThumbs(next)
    }
    timer = window.setTimeout(run, 350)
    return () => { live = false; window.clearTimeout(timer) }
  }, [parts, materials, assets, glbRevision])

  return thumbs
}

/** Escolhe uma face: enquadra-a, fixa a saída dos novos bornes nessa face e fica em modo «Adicionar». */
export function chooseFace(face: Face) {
  const state = useEditorStore.getState()
  if (state.faceLock === face) { state.set({ faceLock: null }); return }
  state.set({ faceLock: face })
  state.cameraTo(face)
  if (!state.placing) state.setRibbon('terminal')
}

/** «Bornes por vista»: miniaturas das 6 faces (com contagem de bornes) + ferramentas Mover / Adicionar. */
export default function FaceChooser() {
  const terminals = useEditorStore((s) => s.def.terminals)
  const faceLock = useEditorStore((s) => s.faceLock)
  const placing = useEditorStore((s) => s.placing)
  const placingSpec = useEditorStore((s) => s.placingSpec)
  const set = useEditorStore((s) => s.set)
  const thumbs = useFaceThumbs()
  const counts = useMemo(() => faceCounts(terminals), [terminals])
  const total = terminals.length

  return <div className="ce-faces">
    <div className="ce-faces-head"><strong>Bornes por vista</strong><span className="ce-faces-total">{total} {total === 1 ? 'borne' : 'bornes'}</span></div>
    <p className="ce-hint">Escolha a face do componente e clique no modelo para colocar os bornes sobre a superfície real.</p>
    <div className="ce-faces-grid" role="group" aria-label="Escolher face">
      {FACES.map(([face, label]) => <button key={face} className={`ce-facecard${faceLock === face ? ' is-on' : ''}`} aria-pressed={faceLock === face} onClick={() => chooseFace(face)}
        title={`Ver ${label.toLowerCase()} e fixar a saída dos novos bornes nessa face`}>
        <span className="ce-facecard-img">
          {thumbs[face] ? <img src={thumbs[face]} alt="" draggable={false} /> : <IconCube size={22} />}
          {counts[face] > 0 && <b className="ce-facecard-count">{counts[face]}</b>}
        </span>
        <span className="ce-facecard-label">{label}</span>
      </button>)}
    </div>
    <div className="ce-faces-tools">
      <div className="dc-seg" role="group" aria-label="Ferramenta de bornes">
        <button className={`dc-tool-btn ${!placing ? 'dc-tool-active' : ''}`} aria-pressed={!placing} onClick={() => useEditorStore.getState().setRibbon('select')} title="Selecionar e mover bornes (Esc)"><IconCursor size={13} /><span>Mover</span></button>
        <button className={`dc-tool-btn ${placing ? 'dc-tool-active' : ''}`} aria-pressed={placing} onClick={() => useEditorStore.getState().setRibbon('terminal')} title="Clicar no modelo para colocar bornes"><IconPlus size={13} /><span>{placing && placingSpec ? `Colocar ${placingSpec.label}` : 'Adicionar'}</span></button>
      </div>
      {faceLock && <button className="dc-tool-btn" onClick={() => set({ faceLock: null })} title="Voltar à normal da superfície clicada">Face livre</button>}
    </div>
  </div>
}
