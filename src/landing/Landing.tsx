import { Suspense, lazy, useEffect, useRef, useState, type CSSProperties } from 'react'
import Logo, { LogoMark } from '../ui/Brand'
import LandingPricing, { PLAN_INTENT_KEY, landingPlans, usePublicPricing } from './LandingPricing'
import { InteractiveComponentThumb } from '../three/componentThumbnails'
import { hasComponent3DModel } from '../three/modelPaths'
import type { ComponentType } from '../types'
import {
  NATIVE_PARTIDA_NAME,
  buildNativeLadder,
  NATIVE_DEMO_NAMES,
  nativeDemoTable,
} from '../project/nativeProjects'
import { sliceLandingDemo, nativeLandingPayload, type LandingDemoSlice } from '../project/landingPublish'
import { accountApi } from '../auth/accountApi'
import type { LadderRung } from '../types'
import type { GrafcetProgram } from '../grafcet/engine'
import { IconCube, IconSchematic, IconLadder, IconPlay, IconFile, IconProjects, IconArrowRight, IconChevronDown, IconZoomIn, IconZoomOut, IconUndo, IconRedo } from '../ui/icons'

/** Viewport 3D real do produto — carregado só quando entra em vista (performance). */
const LandingShowcase = lazy(() => import('../three/LandingShowcase'))
const LandingGrafcetDemo = lazy(() => import('./LandingGrafcetDemo'))

/* ============================================================ conteúdo */

type LandingLibraryItem = { type: ComponentType; n: string; m: string; c: string }

/**
 * A vitrine pública é deliberadamente limitada aos equipamentos que já têm
 * um GLB real integrado. O filtro final impede que um tipo sem CAD reapareça
 * por engano se a tabela for alterada no futuro.
 */
const LIBRARY: LandingLibraryItem[] = ([
  { type: 'breaker1p', n: 'Disjuntor modular 1P', m: 'Curva C · 16 A', c: 'Proteção' },
  { type: 'breaker2p', n: 'Disjuntor modular 2P', m: 'Curva C · 16 A', c: 'Proteção' },
  { type: 'breakerSteckSdC25', n: 'Disjuntor Steck SD C25', m: '1P · 25 A · curva C', c: 'Proteção' },
  { type: 'motorBreakerPkzmC10', n: 'Disjuntor-motor Eaton PKZM C-10', m: '3P · 6,3-10 A · botão rotativo', c: 'Proteção' },
  { type: 'phoenixEcb3000760', n: 'Phoenix Contact EC 1', m: '12 V DC · 1 A · 3000760', c: 'Proteção' },
  { type: 'dualPushButtonNpb22D11', n: 'Botoeira NHD NPB22-D11', m: 'START/STOP · 1NA + 1NF', c: 'Comando' },
  { type: 'emergencyButton', n: 'Emergência Metaltex P20AKR', m: 'Cogumelo · rearme por giro · 1NF', c: 'Comando' },
  { type: 'emergencyButtonKeyP20ACR', n: 'Emergência Metaltex P20ACR', m: 'Rearme por chave · 1NF', c: 'Comando' },
  { type: 'contactorWegCWC09', n: 'Contator WEG CWC09', m: '9 A · 3NA + 1NA', c: 'Contactores' },
  { type: 'safetyRelay', n: 'Guardmaster MSR127TP', m: 'Allen-Bradley · relé de segurança', c: 'Relés' },
  { type: 'plcSiemensLogo1224RC', n: 'Siemens LOGO! 12/24RC', m: '8 entradas · 4 saídas a relé', c: 'Controladores' },
  { type: 'plcLsXbmDn32s', n: 'LS Electric XBM-DN32S', m: '16DI · 16DO transistor NPN', c: 'Controladores' },
  { type: 'siemensTsAdapterIeBasic', n: 'SIMATIC TS Adapter IE Basic', m: 'Siemens · TeleService Ethernet', c: 'Controladores' },
  { type: 'terminalPhoenixPti6', n: 'Borne Phoenix Contact PTI 6', m: 'Push-in · 6 mm² · 41 A', c: 'Bornes' },
  { type: 'terminalPE', n: 'Borne de terra PE', m: 'Verde/amarelo · calha DIN', c: 'Bornes' },
  { type: 'powerSupplyProauto24A', n: 'Fonte Proauto DRAN120-24A', m: '24 V DC · 5 A · 120 W', c: 'Fontes' },
  { type: 'pilotLightAd22', n: 'Sinaleiro LED AD22-22DS', m: '24 V AC/DC · 22 mm · cor configurável', c: 'Sinalização' },
  { type: 'motor3ph', n: 'Motor SEW DRN80MK4/B3', m: 'Trifásico · 0,55 kW · 1435 rpm', c: 'Motores' },
] satisfies LandingLibraryItem[]).filter((item) => hasComponent3DModel(item.type))

const CATEGORIES = ['Todos', 'Proteção', 'Comando', 'Contactores', 'Relés', 'Controladores', 'Bornes', 'Fontes', 'Sinalização', 'Motores']

const FLOW: [string, string][] = [
  ['Escolher componente', 'Pesquise por nome, fabricante ou categoria.'],
  ['Adicionar ao quadro', 'Clique ou arraste — encaixa na calha DIN, sem medir.'],
  ['Posicionar em 3D', 'Mova, rode e alinhe com snap de 1 mm.'],
  ['Configurar', 'Referência, etiqueta e propriedades elétricas.'],
  ['Ligar componentes', 'Cabos entre bornes, cores IEC, continuidade verificada.'],
  ['Exportar', 'BOM, etiquetas e esquema prontos para a produção.'],
]

const FEATURES = [
  { i: IconCube, t: 'Quadro em 3D real', p: 'Modelos CAD dos fabricantes montados em calha DIN, com cabos, bornes e dimensões corretas.' },
  { i: IconSchematic, t: 'Esquema elétrico ligado', p: 'Desenhe o circuito, ligue bornes e veja os erros de ligação detetados enquanto trabalha.' },
  { i: IconLadder, t: 'Ladder + GRAFCET', p: 'Programe a lógica de comando e acompanhe o scan do PLC network a network, em tempo real.' },
  { i: IconPlay, t: 'Simulação de comandos', p: 'Contactores, relés, proteções e motores reagem como no quadro real — antes de comprar material.' },
  { i: IconFile, t: 'Documentação automática', p: 'BOM, etiquetas normalizadas e datasheets dos equipamentos gerados a partir do próprio projeto.' },
  { i: IconProjects, t: 'Projetos locais', p: 'Guarde no navegador e partilhe a edição entre as duas contas autorizadas neste dispositivo.' },
]

const WHO = [
  { t: 'Eletricistas', d: 'Montar e validar o quadro antes de chegar à obra.' },
  { t: 'Projetistas', d: 'Esquema, disposição e documentação no mesmo ficheiro.' },
  { t: 'Engenheiros e formadores', d: 'Ensinar comandos elétricos com simulação real, sem risco.' },
  { t: 'Fabricantes de quadros', d: 'Antecipar espaço, calhas e material necessário — sem refazer.' },
  { t: 'Integradores de automação', d: 'Testar lógica Ladder e GRAFCET sem hardware.' },
  { t: 'Empresas industriais', d: 'Manter o histórico e a documentação dos quadros instalados.' },
]

const FAQ = [
  { q: 'Preciso de instalar alguma coisa?', a: 'Não. O DC-SIMU corre no navegador e pode ser instalado como aplicação (PWA) no computador ou telemóvel.' },
  { q: 'Os modelos 3D são reais?', a: 'Sim. Usamos modelos CAD dos fabricantes para os equipamentos disponíveis, com dimensões reais em calha DIN.' },
  { q: 'Posso trabalhar em equipa?', a: 'Sim. O proprietário convida editores, que passam a ver o projeto na sua área de trabalho.' },
  { q: 'Que circuitos posso simular?', a: 'Comandos elétricos industriais: proteções, contactores, relés, fontes, motores e PLC, com lógica Ladder e GRAFCET.' },
]

const LINKS: [string, string][] = [
  ['#produto', 'Produto'],
  ['#editor', 'Editor'],
  ['#biblioteca', 'Biblioteca'],
  ['#fluxo', 'Como funciona'],
  ['#para-quem', 'Para quem'],
  ['#precos', 'Preços'],
  ['#faq', 'FAQ'],
]

/** Estilo inline com o índice de escalonamento usado pelas animações CSS. */
const stagger = (i: number) => ({ ['--i' as string]: i }) as CSSProperties

/* ====================================================== símbolos técnicos */

/** Só descarrega/renderiza o GLB quando o respetivo cartão se aproxima do viewport. */
function LandingGlbThumb({ type }: { type: ComponentType }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (!('IntersectionObserver' in window)) return setVisible(true)
    const io = new IntersectionObserver((entries) => {
      setVisible(entries[0]?.isIntersecting ?? false)
    }, { rootMargin: '100px' })
    io.observe(node)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className="dx-lib-model-slot">
      {visible ? <InteractiveComponentThumb type={type} size={148} /> : <div className="dc-real-glb-loading" aria-hidden />}
    </div>
  )
}

/** Revela elementos [data-rv] à medida que entram no viewport. */
function useReveal() {
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-rv]'))
    els.forEach((el) => el.classList.add('dx-rv'))
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('dx-rv-in')
            io.unobserve(e.target)
          }
        }),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
}

/** Carrega a cena WebGL apenas quando o viewport fica visível. */
function HeroViewport() {
  const projectTitle = NATIVE_PARTIDA_NAME
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [plcRunning, setPlcRunning] = useState(true)
  const [motorOn, setMotorOn] = useState(true)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (!('IntersectionObserver' in window)) return setVisible(true)
    const io = new IntersectionObserver(
      (e) => {
        if (e[0]?.isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [])
  const runPlc = () => setPlcRunning(true)
  const stopPlc = () => { setPlcRunning(false); setMotorOn(false) }
  const startMotor = () => { if (plcRunning) setMotorOn(true) }
  const stopMotor = () => setMotorOn(false)
  return (
    <div className="dx-window" ref={ref}>
      <div className="dx-window-bar">
        <LogoMark size={18} />
        <span className="dx-window-path">{'/projetos/' + projectTitle}</span>
        <div className="dx-window-tabs">
          <span>Esquema</span>
          <span>Ladder</span>
          <span>GRAFCET</span>
          <span className="on">Visualização 3D</span>
        </div>
      </div>
      <div className="dx-window-stage">
        {visible ? (
          <Suspense
            fallback={
              <div className="dx-stage-skeleton" role="status">
                <span className="dx-spin" aria-hidden />
                A carregar modelos 3D…
              </div>
            }
          >
            <div className="dx-stage-in">
              <LandingShowcase
                compact
                plcRunning={plcRunning}
                motorOn={motorOn}
                onRunPlc={runPlc}
                onStopPlc={stopPlc}
                onStartMotor={startMotor}
                onStopMotor={stopMotor}
              />
            </div>
          </Suspense>
        ) : (
          <div className="dx-stage-skeleton" aria-hidden />
        )}
      </div>
      <div className={`dx-window-foot${plcRunning ? ' is-running' : ' is-stopped'}`}>
        <b>
          <i aria-hidden /> {plcRunning ? (motorOn ? 'Motor em marcha' : 'PLC em RUN') : 'PLC em STOP'}
        </b>
        <span>{projectTitle} · publicado na landing · Ladder · GRAFCET · 3D</span>
        <span className="end">9 equipamentos reais · disjuntor + PKZM</span>
      </div>
    </div>
  )
}

const NetworkDiagram = lazy(() => import('../ladder/NetworkDiagram'))

/** Pré-visualização funcional — conteúdo = projeto publicado pelo admin (fallback nativo). */
function EditorAnatomy() {
  const [demo, setDemo] = useState<LandingDemoSlice>(() => sliceLandingDemo(nativeLandingPayload()))
  const [plcRunning, setPlcRunning] = useState(false)
  const [motorOn, setMotorOn] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [view, setView] = useState<'ladder' | 'grafcet' | 'panel3d'>('ladder')
  const powered = plcRunning && motorOn
  const stoppedIndication = plcRunning && !motorOn
  const demoTable = demo.demoTable(plcRunning, motorOn)
  const DEMO_RUNGS = demo.ladder
  const DEMO_NAMES = demo.names
  const projectTitle = demo.meta.name || NATIVE_PARTIDA_NAME

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const payload = await accountApi<import('../project/landingPublish').LandingPublishedPayload>('/landing/published')
        if (!cancelled && payload?.content) setDemo(sliceLandingDemo(payload))
      } catch {
        /* mantém nativo */
      }
    })()
    return () => { cancelled = true }
  }, [])
  const networksRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(1)
  useEffect(() => {
    const el = networksRef.current
    if (!el) return
    const update = () => setFit(Math.max(0.5, Math.min(1, (el.clientWidth - 16) / 470)))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [view])

  const runPlc = () => setPlcRunning(true)
  const stopPlc = () => {
    setPlcRunning(false)
    setMotorOn(false)
  }
  const startMotor = () => {
    if (plcRunning) setMotorOn(true)
  }
  const stopMotor = () => setMotorOn(false)
  const changeZoom = (step: number) => setZoom((current) => Math.max(75, Math.min(150, current + step)))

  return (
    <div className="dx-window dx-ladder-demo">
      <div className="dx-window-bar">
        <LogoMark size={18} />
        <span className="dx-window-path">{'/projetos/' + projectTitle}</span>
        <div className="dx-window-tabs is-switcher" role="tablist" aria-label="Vista da demonstração">
          <button type="button" role="tab" aria-selected={view === 'ladder'} className={view === 'ladder' ? 'on' : ''} onClick={() => setView('ladder')}>Ladder</button>
          <button type="button" role="tab" aria-selected={view === 'grafcet'} className={view === 'grafcet' ? 'on' : ''} onClick={() => setView('grafcet')}>GRAFCET</button>
          <button type="button" role="tab" aria-selected={view === 'panel3d'} className={view === 'panel3d' ? 'on' : ''} onClick={() => setView('panel3d')}>Visualização 3D</button>
        </div>
      </div>

      {view === 'ladder' ? <div className="dx-ladder-demo-body ladder-workspace">
        <aside className="ladder-project-pane" aria-label="Árvore do projeto Ladder">
          <div className="ladder-pane-heading"><span>Árvore do projeto</span><span>×</span></div>
          <div className="ladder-project-tree">
            <div className="tree-row tree-depth-0 tree-folder"><IconChevronDown size={11} /><IconProjects size={12} className="tree-glyph" /><span className="tree-label">CLP Siemens LOGO!</span></div>
            <div className="tree-row tree-depth-1 tree-folder"><IconChevronDown size={11} /><IconLadder size={12} className="tree-glyph tree-glyph-block" /><span className="tree-label">Blocos do programa</span></div>
            <div className="tree-row tree-depth-2 tree-selected"><IconFile size={12} className="tree-glyph tree-glyph-block" /><span className="tree-label">OB1</span><small>principal</small></div>
            <div className="tree-row tree-depth-2"><IconFile size={12} className="tree-glyph tree-glyph-block" /><span className="tree-label">FC1</span><small>motor</small></div>
            <div className="tree-row tree-depth-1"><IconFile size={12} className="tree-glyph tree-glyph-data" /><span className="tree-label">Tabela de tags</span></div>
          </div>
        </aside>

        <main className="ladder-main-pane">
          <div className="ladder-project-tabs">
            <span className="ladder-project-tab is-active"><IconLadder size={12} /> OB1 <span>×</span></span>
            <span className="ladder-project-tab">FC1 <span>×</span></span>
          </div>
          <div className="ladder-editor-toolbar" aria-label="Controlos da demonstração Ladder">
            <button type="button" className="ladder-toolbar-button dx-history-control" disabled title="Desfazer"><IconUndo size={12} /></button>
            <button type="button" className="ladder-toolbar-button dx-history-control" disabled title="Refazer"><IconRedo size={12} /></button>
            <i className="ladder-toolbar-separator dx-history-control" />
            <button type="button" className="ladder-toolbar-button" onClick={() => changeZoom(-25)} disabled={zoom <= 75} aria-label="Diminuir zoom"><IconZoomOut size={12} /></button>
            <span className="ladder-zoom-label" aria-live="polite">{zoom}%</span>
            <button type="button" className="ladder-toolbar-button" onClick={() => changeZoom(25)} disabled={zoom >= 150} aria-label="Aumentar zoom"><IconZoomIn size={12} /></button>
            <i className="ladder-toolbar-separator" />
            <button type="button" className="ladder-primary-button" onClick={runPlc} disabled={plcRunning}><IconPlay size={11} /> RUN</button>
            <button type="button" className="ladder-stop-button" onClick={stopPlc} disabled={!plcRunning}><span aria-hidden>■</span> STOP</button>
          </div>
          <div className="ladder-program-summary" aria-live="polite">
            <div className={`ladder-metric ${plcRunning ? 'is-run' : 'is-stop'}`}><span>Estado</span><strong>{plcRunning ? 'RUN' : 'STOP'}</strong></div>
            <div className="ladder-metric"><span>Networks</span><strong>03</strong></div>
            <div className="ladder-metric"><span>Scan</span><strong>{plcRunning ? '4 ms' : '—'}</strong></div>
            <div className="ladder-live-bus"><span>PLC</span><strong>{plcRunning ? 'LOGO! ativo' : 'CPU parada'}</strong></div>
          </div>
          <div className="dx-ladder-operator" aria-label="Comandos do motor">
            <div>
              <span>Comando de campo</span>
              <strong>{powered ? 'KM1 ligado · selo ativo' : plcRunning ? 'Pronto para arrancar' : 'Execute o PLC primeiro'}</strong>
            </div>
            <button type="button" className="dx-operator-start" onClick={startMotor} disabled={!plcRunning || motorOn}><i aria-hidden /> START <small>I0.1</small></button>
            <button type="button" className="dx-operator-stop" onClick={stopMotor} disabled={!motorOn}><i aria-hidden /> STOP <small>I0.0</small></button>
          </div>
          <div className="ladder-networks grid-lines" ref={networksRef}>
            <div className="dx-ladder-demo-scale" style={{ zoom: fit * zoom / 100 }}>
              {DEMO_RUNGS.map((rung, index) => {
                const live = index === 2 ? stoppedIndication : powered
                return (
                  <div key={rung.id} className={`ladder-rung-card${live ? ' is-powered' : ''}`}>
                    <div className="ladder-rung-header">
                      <span className="ladder-collapse-btn"><IconChevronDown size={11} /></span>
                      <span className={`ladder-network-no${live ? ' is-on' : ''}`}>Network {index + 1}:</span>
                      <span className="ladder-network-title">{rung.name}</span>
                      <span className={`ladder-rung-live${live ? ' is-on' : ''}`}><i />RLO = {live ? '1' : '0'}</span>
                    </div>
                    <div className="ladder-network-comment">{rung.comment}</div>
                    <div className="ladder-rung-body">
                      <div className="lnet-scroll">
                        <Suspense fallback={<div style={{ height: 150 }} />}>
                          <NetworkDiagram rung={rung} readonly minWidth={460} preview={{ online: plcRunning, powered: live, table: demoTable, names: DEMO_NAMES }} />
                        </Suspense>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </main>

        <aside className="ladder-element-pane" aria-label="Paleta de elementos Ladder">
          <div className="ladder-pane-heading"><span>Elementos</span><span>⌄</span></div>
          <div className="ladder-tools-heading">INSTRUÇÕES</div>
          <div className="dx-ladder-elements" aria-hidden="true">
            <span>—| |—<small>Contato NA</small></span>
            <span>—|/|—<small>Contato NF</small></span>
            <span>—( )—<small>Bobina</small></span>
            <span>[ TON ]<small>Temporizador</small></span>
          </div>
        </aside>
      </div> : view === 'grafcet' ? (
      <Suspense fallback={<div className="dx-stage-skeleton" role="status">A carregar GRAFCET…</div>}>
        <LandingGrafcetDemo
          plcRunning={plcRunning}
          motorOn={motorOn}
          onRunPlc={runPlc}
          onStopPlc={stopPlc}
          onStartMotor={startMotor}
          onStopMotor={stopMotor}
          program={demo.grafcet}
          projectName={projectTitle}
        />
      </Suspense>
      ) : <div className="dx-ladder-panel3d" role="tabpanel" aria-label="Partida direta na Visualização 3D">
        <Suspense fallback={<div className="dx-stage-skeleton" role="status">A carregar componentes reais…</div>}>
          <LandingShowcase
            compact
            plcRunning={plcRunning}
            motorOn={motorOn}
            onRunPlc={runPlc}
            onStopPlc={stopPlc}
            onStartMotor={startMotor}
            onStopMotor={stopMotor}
          />
        </Suspense>
      </div>}
      <div className={`dx-window-foot${plcRunning ? ' is-running' : ' is-stopped'}`} aria-live="polite">
        <b><i aria-hidden /> PLC em {plcRunning ? 'RUN' : 'STOP'}</b>
        <span>{powered
          ? (view === 'panel3d' ? 'Q0·QM1·KM1 · M1 em marcha · H1 verde' : view === 'grafcet' ? 'Etapa X1 ativa · KM1 e H1' : 'Q0.0/KM1 e Q0.1/H1 energizados')
          : stoppedIndication
            ? (view === 'panel3d' ? 'KM1 desligado · M1 parado · H2 vermelho' : view === 'grafcet' ? 'Etapa X0 · H2 parado' : 'Q0.2/H2 energizado · motor parado')
            : 'Saídas desenergizadas · proteções prontas'}</span>
        <span className="end">{view === 'grafcet' ? 'IEC 60848' : 'IEC 61131-3'} · {plcRunning ? 'scan 4 ms' : 'CPU parada'}</span>
      </div>
    </div>
  )
}
/* ================================================================ página */

export default function Landing({ onAccess, onLogin }: { onAccess: () => void; onLogin: () => void }) {
  const [menu, setMenu] = useState(false)
  const [cat, setCat] = useState('Todos')
  const [swapped, setSwapped] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [active, setActive] = useState('')
  useReveal()
  const { pricing } = usePublicPricing()
  const showPricing = landingPlans(pricing).length > 0

  // navegação: sombra/borda depois de sair do topo
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8)
      if (window.scrollY < 240) setActive('')
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // scrollspy: destaca a secção que ocupa o meio do ecrã
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id)
        }),
      { rootMargin: '-45% 0px -50% 0px' },
    )
    LINKS.filter(([href]) => href !== '#precos' || showPricing).forEach(([href]) => {
      const el = document.getElementById(href.slice(1))
      if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [showPricing])

  // Esc fecha o menu móvel
  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu])

  const links = LINKS.filter(([href]) => href !== '#precos' || showPricing)
  const pickCat = (c: string) => {
    if (c === cat) return
    setCat(c)
    setSwapped(true)
  }
  const visibleLib = LIBRARY.filter((c) => cat === 'Todos' || c.c === cat)

  return (
    <div className="dx dx-landing">
      <nav className={'dx-nav' + (scrolled ? ' is-scrolled' : '')}>
        <div className="dx-wrap dx-nav-in">
          <Logo size={32} />
          <div className="dx-nav-links">
            {links.map(([href, label]) => (
              <a key={href} href={href} aria-current={active === href.slice(1) ? 'true' : undefined}>
                {label}
              </a>
            ))}
          </div>
          <div className="dx-nav-cta">
            <button className="dx-btn dx-btn-ghost dx-btn-sm" onClick={onLogin}>
              Entrar
            </button>
            <button className="dx-btn dx-btn-primary dx-btn-sm" onClick={onAccess}>
              Abrir <span className="dx-long">simulador</span>
            </button>
            <button className="dx-burger" aria-label={menu ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menu} onClick={() => setMenu(!menu)}>
              <i />
              <i />
              <i />
            </button>
          </div>
        </div>
        <div className={'dx-mobile-menu' + (menu ? ' open' : '')} onClick={() => setMenu(false)}>
          <div className="dx-mobile-inner">
            {links.map(([href, label], i) => (
              <a key={href} href={href} style={stagger(i)}>
                {label}
              </a>
            ))}
            <div className="dx-mobile-cta">
              <button className="dx-btn dx-btn-secondary" onClick={onLogin}>
                Entrar
              </button>
              <button className="dx-btn dx-btn-primary" onClick={onAccess}>
                Abrir simulador
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ------------------------------------------------------------- HERO */}
      <header className="dx-lhero">
        <div className="dx-wrap dx-lhero-in">
          <div className="dx-lhero-copy">
            <span className="dx-over">Crie · configure · valide — antes da obra</span>
            <h1>
              Desenhe quadros elétricos <em>em 3D.</em>
            </h1>
            <p>Monte o quadro em 3D com modelos CAD reais, desenhe o esquema, programe a lógica e simule o comando — tudo no mesmo projeto.</p>
            <div className="dx-lhero-actions">
              <button className="dx-btn dx-btn-primary dx-btn-lg" onClick={onAccess}>
                Entrar no simulador
                <IconArrowRight size={16} className="dx-arrow" />
              </button>
              <a className="dx-btn dx-btn-secondary dx-btn-lg" href="#produto">
                Ver como funciona
              </a>
            </div>
            <ul className="dx-lhero-meta">
              <li>Modelos CAD reais</li>
              <li>Sem instalação</li>
              <li>Projetos partilhados</li>
            </ul>
          </div>
          <HeroViewport />
        </div>
      </header>

      <div className="dx-strip" aria-hidden>
        <div className="dx-wrap">
          <span className="lbl">Na biblioteca</span>
          <span>Proteção</span>
          <span>Comando</span>
          <span>Contactores</span>
          <span>Relés de segurança</span>
          <span>Bornes</span>
          <span>Controladores</span>
          <span>Fontes</span>
          <span>Sinalização</span>
          <span>Motores</span>
        </div>
      </div>

      {/* --------------------------------------------------- PROBLEMA/SOLUÇÃO */}
      <section className="dx-section" id="produto">
        <div className="dx-wrap">
          <div className="dx-head" data-rv>
            <span className="dx-over">O problema</span>
            <h2>Os problemas de um quadro costumam aparecer tarde demais.</h2>
            <p>O esquema vive num CAD, a lista de material numa folha de cálculo e a montagem só acontece na bancada. Cada passagem entre ferramentas é uma oportunidade de erro.</p>
          </div>
          <div className="dx-compare">
            <div className="dx-compare-col is-before" data-rv>
              <span className="dx-compare-tag">Antes</span>
              <h3>Sem DC-SIMU</h3>
              <ul>
                <li style={stagger(0)}>
                  <b>Espaço mal calculado</b> — o material não cabe na calha.
                </li>
                <li style={stagger(1)}>
                  <b>Erros de ligação</b> só detetados com o quadro já montado.
                </li>
                <li style={stagger(2)}>
                  <b>Lógica por validar</b> — o PLC só é testado em obra.
                </li>
                <li style={stagger(3)}>
                  <b>Documentação dispersa</b> por ficheiros e versões.
                </li>
              </ul>
            </div>
            <div className="dx-compare-col is-after" data-rv>
              <span className="dx-compare-tag">Depois</span>
              <h3>Com DC-SIMU</h3>
              <ul>
                <li style={stagger(0)}>
                  <b>Quadro em 3D à escala</b> com modelos CAD do fabricante.
                </li>
                <li style={stagger(1)}>
                  <b>Verificação de ligações</b> enquanto desenha o esquema.
                </li>
                <li style={stagger(2)}>
                  <b>Simulação do comando</b> em Ladder e GRAFCET, antes da obra.
                </li>
                <li style={stagger(3)}>
                  <b>Material e datasheets</b> gerados a partir do próprio projeto.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ EDITOR */}
      <section className="dx-section dx-section-alt" id="editor">
        <div className="dx-wrap">
          <div className="dx-head" data-rv>
            <span className="dx-over">Demonstração Ladder interativa</span>
            <h2>Execute uma partida direta sem sair desta página.</h2>
            <p>Clique em RUN e START, depois alterne entre Ladder e a Visualização 3D: o LOGO! Siemens, a botoeira START/STOP, KM1, o motor SEW, H1 verde de marcha e H2 vermelho de motor parado partilham o mesmo estado. Use STOP para desligar o motor.</p>
          </div>
          <div className="dx-studio-grid">
            <div data-rv>
              <EditorAnatomy />
            </div>
            <ul className="dx-studio-side" data-rv>
              <li>
                <span className="idx">01</span>
                <div>
                  <h3>Sincronização total</h3>
                  <p>Esquema ↔ Visualização 3D ↔ Ladder: os bornes, cabos e referências são os mesmos em todas as vistas.</p>
                </div>
              </li>
              <li>
                <span className="idx">02</span>
                <div>
                  <h3>Diagnóstico em tempo real</h3>
                  <p>Erros de ligação, fases em falta e conflitos de endereços assinalados enquanto trabalha.</p>
                </div>
              </li>
              <li>
                <span className="idx">03</span>
                <div>
                  <h3>Medição e cenários</h3>
                  <p>Sonda de continuidade, injeção de falhas e cenários de arranque prontos a executar.</p>
                </div>
              </li>
              <li>
                <span className="idx">04</span>
                <div>
                  <h3>Exportação para produção</h3>
                  <p>Lista de material em CSV, etiquetas de bornes e esquema final — sem transcrever nada.</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- BIBLIOTECA */}
      <section className="dx-section" id="biblioteca">
        <div className="dx-wrap">
          <div className="dx-head" data-rv>
            <span className="dx-over">Biblioteca com CAD validado</span>
            <h2>Apenas equipamentos que já têm modelo GLB real.</h2>
            <p>Explore os {LIBRARY.length} componentes atualmente integrados. Cada modelo começa estático: arraste na horizontal e na vertical para o observar em todos os ângulos, usando o mesmo GLB do Esquema e da Visualização 3D.</p>
          </div>
          <div className="dx-lib-toolbar" data-rv>
            <div className="dx-lib-filters">
              {CATEGORIES.map((c) => (
                <button key={c} className="dx-filter" aria-pressed={cat === c} onClick={() => pickCat(c)}>
                  {c}
                </button>
              ))}
            </div>
            <span className="dx-lib-count" aria-live="polite">
              {visibleLib.length} {visibleLib.length === 1 ? 'item' : 'itens'}
            </span>
          </div>
          <div className={'dx-lib-grid' + (swapped ? ' is-swap' : '')} data-rv>
            {visibleLib.map((c, i) => (
              <article className="dx-lib-card" key={cat + c.type} style={stagger(i)}>
                <div className="dx-lib-thumb">
                  <LandingGlbThumb type={c.type} />
                  <span className="dx-lib-3d">(3D)</span>
                  <span className="dx-lib-rotate-hint" aria-hidden="true">↕ ↔ Arraste para girar</span>
                </div>
                <div className="dx-lib-body">
                  <b>{c.n}</b>
                  <small>{c.m}</small>
                  <span className="dx-lib-cat">{c.c}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- WORKFLOW */}
      <section className="dx-section dx-section-alt" id="fluxo">
        <div className="dx-wrap">
          <div className="dx-head" data-rv>
            <span className="dx-over">Fluxo de trabalho</span>
            <h2>Do componente ao quadro montado, em seis passos.</h2>
            <p>Um percurso direto, pensado para quem projeta todos os dias. Sem configurações demoradas.</p>
          </div>
          <ol className="dx-steps" data-rv>
            {FLOW.map(([t, d], i) => (
              <li key={t} style={stagger(i)}>
                <span className="n">{String(i + 1).padStart(2, '0')}</span>
                <b>{t}</b>
                <small>{d}</small>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* -------------------------------------------------------- FEATURES */}
      <section className="dx-section">
        <div className="dx-wrap">
          <div className="dx-head" data-rv>
            <span className="dx-over">Funcionalidades</span>
            <h2>Feito para a engenharia de quadros elétricos.</h2>
            <p>Tudo o que precisa para desenhar, testar e documentar um quadro elétrico — no mesmo ambiente.</p>
          </div>
          <div className="dx-cards" data-rv>
            {FEATURES.map((f, i) => (
              <article key={f.t} style={stagger(i % 3)}>
                <div className="dx-ic" aria-hidden>
                  <f.i size={20} />
                </div>
                <h3>{f.t}</h3>
                <p>{f.p}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- PARA QUEM */}
      <section className="dx-section dx-section-alt" id="para-quem">
        <div className="dx-wrap">
          <div className="dx-head" data-rv>
            <span className="dx-over">Para quem é</span>
            <h2>Feito para quem monta, projeta e mantém quadros.</h2>
            <p>Da bancada à sala de projeto, o mesmo ficheiro acompanha todas as fases do trabalho.</p>
          </div>
          <div className="dx-who" data-rv>
            {WHO.map((w, i) => (
              <div key={w.t} style={stagger(i % 3)}>
                <b>{w.t}</b>
                <p>{w.d}</p>
              </div>
            ))}
          </div>
          <div className="dx-stats" data-rv>
            <div>
              <b>5</b>
              <span>vistas sincronizadas</span>
            </div>
            <div>
              <b>3D</b>
              <span>modelos CAD reais</span>
            </div>
            <div>
              <b>11+</b>
              <span>categorias de material</span>
            </div>
            <div>
              <b>PWA</b>
              <span>instalável em qualquer ecrã</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- PREÇOS */}
      <LandingPricing pricing={pricing} onChoose={(plan, period) => {
        try { sessionStorage.setItem(PLAN_INTENT_KEY, JSON.stringify({ plan: plan.id, period })) } catch { /* armazenamento indisponível */ }
        if (plan.id === 'free') onAccess(); else onLogin()
      }} />

      {/* -------------------------------------------------------------- FAQ */}
      <section className="dx-section dx-faq" id="faq">
        <div className="dx-wrap dx-wrap-narrow">
          <div className="dx-head" data-rv>
            <span className="dx-over">Perguntas frequentes</span>
            <h2>Antes de começar.</h2>
          </div>
          <div data-rv>
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- CTA */}
      <section className="dx-cta">
        <div className="dx-wrap dx-cta-in">
          <div>
            <h2>O próximo quadro começa aqui.</h2>
            <p>Entre com uma conta autorizada e monte o seu quadro em 3D. Funciona sem servidor e sem instalação.</p>
          </div>
          <div className="dx-cta-actions">
            <button className="dx-btn dx-btn-white dx-btn-lg" onClick={onAccess}>
              Entrar no simulador
              <IconArrowRight size={16} className="dx-arrow" />
            </button>
            <button className="dx-btn dx-btn-outline-white dx-btn-lg" onClick={onLogin}>
              Entrar
            </button>
          </div>
        </div>
      </section>

      <footer className="dx-foot">
        <div className="dx-wrap dx-foot-in">
          <div className="dx-foot-brand">
            <Logo size={28} />
            <span>Quadros 3D · Esquema · Ladder · Simulação</span>
          </div>
          <nav aria-label="Rodapé">
            {links.map(([href, label]) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
          </nav>
          <small>© {new Date().getFullYear()} DC-SIMU</small>
        </div>
      </footer>
    </div>
  )
}
