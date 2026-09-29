import { Suspense, lazy, useEffect, useRef, useState, type CSSProperties } from 'react'
import Logo, { LogoMark } from '../ui/Brand'
import { IconCube, IconSchematic, IconLadder, IconPlay, IconFile, IconProjects, IconArrowRight } from '../ui/icons'

/** Viewport 3D real do produto — carregado só quando entra em vista (performance). */
const LandingShowcase = lazy(() => import('../three/LandingShowcase'))

/* ============================================================ conteúdo */

type Sym = 'breaker' | 'contactor' | 'relay' | 'estop' | 'terminals' | 'plc' | 'psu' | 'lamp'

const LIBRARY: { s: Sym; n: string; m: string; c: string }[] = [
  { s: 'breaker', n: 'Disjuntor modular 2P', m: 'Curva C · 6–32 A', c: 'Proteção' },
  { s: 'contactor', n: 'Contator WEG CWC09', m: '9 A · 3NA+1NF · 24 V DC', c: 'Contactores' },
  { s: 'relay', n: 'Relé auxiliar Phoenix', m: '4 contactos · 24 V DC', c: 'Relés' },
  { s: 'estop', n: 'Botão de emergência', m: 'Metaltex P20 · ⌀22 mm', c: 'Comando' },
  { s: 'terminals', n: 'Bornes e barras', m: 'Fase · Neutro · PE', c: 'Ligações' },
  { s: 'plc', n: 'PLC LOGO! 12/24 RC', m: 'Siemens · 8E/4S', c: 'Controladores' },
  { s: 'psu', n: 'Fonte DRAN120-24A', m: 'Proauto · 24 V · 5 A', c: 'Fontes' },
  { s: 'lamp', n: 'Sinalizador LED ⌀22', m: '24 V · verde / vermelho', c: 'Sinalização' },
]

const CATEGORIES = ['Todos', 'Proteção', 'Contactores', 'Relés', 'Comando', 'Controladores', 'Fontes', 'Ligações', 'Sinalização']

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
  { i: IconProjects, t: 'Projetos partilhados', p: 'Convide editores e mantenha o mesmo projeto acessível a toda a equipa, em qualquer ecrã.' },
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
  ['#faq', 'FAQ'],
]

/** Estilo inline com o índice de escalonamento usado pelas animações CSS. */
const stagger = (i: number) => ({ ['--i' as string]: i }) as CSSProperties

/* ====================================================== símbolos técnicos */

/** Vistas frontais em traço (estilo blueprint) dos equipamentos da biblioteca. */
function LibSymbol({ s, size = 56 }: { s: Sym; size?: number }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const soft = { fill: 'currentColor', fillOpacity: 0.14, stroke: 'none' }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      {s === 'breaker' && (
        <g {...common}>
          <rect x="17" y="6" width="14" height="36" rx="1.5" />
          <path d="M17 12h14M17 36h14" />
          <rect x="21" y="17" width="6" height="14" rx="1" {...soft} />
          <rect x="21" y="17" width="6" height="14" rx="1" />
          <path d="M24 10v4M24 34v4" />
        </g>
      )}
      {s === 'contactor' && (
        <g {...common}>
          <rect x="10" y="10" width="28" height="28" rx="2" />
          <rect x="14" y="14" width="20" height="7" rx="1" {...soft} />
          <rect x="14" y="14" width="20" height="7" rx="1" />
          <path d="M15 30h4M22 30h4M29 30h4M15 34h4M22 34h4M29 34h4" />
          <path d="M14 6v4M34 6v4" />
          <path d="M10 42h28" strokeDasharray="3 3" />
        </g>
      )}
      {s === 'relay' && (
        <g {...common}>
          <rect x="14" y="12" width="20" height="26" rx="1.5" />
          <circle cx="24" cy="21" r="4.5" {...soft} />
          <circle cx="24" cy="21" r="4.5" />
          <path d="M19 31h2.5M23 31h2.5M27 31h2.5" />
          <path d="M17 8v4M31 8v4" />
        </g>
      )}
      {s === 'estop' && (
        <g {...common}>
          <circle cx="24" cy="22" r="9" />
          <circle cx="24" cy="22" r="13" strokeDasharray="2.5 3" />
          <path d="M14 38h20" {...common} />
          <path d="M17 38v-5M31 38v-5" />
          <rect x="18" y="14" width="12" height="5" rx="2.5" {...soft} />
        </g>
      )}
      {s === 'terminals' && (
        <g {...common}>
          <rect x="8" y="18" width="9" height="14" rx="1" />
          <rect x="19.5" y="18" width="9" height="14" rx="1" {...soft} />
          <rect x="19.5" y="18" width="9" height="14" rx="1" />
          <rect x="31" y="18" width="9" height="14" rx="1" />
          <path d="M6 12h36" strokeDasharray="3 3" />
          <path d="M12.5 24v3M24 24v3M35.5 24v3" />
        </g>
      )}
      {s === 'plc' && (
        <g {...common}>
          <rect x="7" y="10" width="34" height="24" rx="2" />
          <rect x="12" y="15" width="13" height="8" rx="1" {...soft} />
          <rect x="12" y="15" width="13" height="8" rx="1" />
          <path d="M30 16h6M30 20h6M12 28h24" />
          <path d="M12 34v4M20 34v4M28 34v4M36 34v4" />
        </g>
      )}
      {s === 'psu' && (
        <g {...common}>
          <rect x="11" y="8" width="26" height="30" rx="2" />
          <path d="M16 15h16M16 19h16M16 23h16" />
          <circle cx="24" cy="30" r="2.5" {...soft} />
          <circle cx="24" cy="30" r="2.5" />
          <path d="M18 42h12" strokeDasharray="3 3" />
        </g>
      )}
      {s === 'lamp' && (
        <g {...common}>
          <circle cx="24" cy="20" r="7" {...soft} />
          <circle cx="24" cy="20" r="7" />
          <path d="M20 13.5a7 7 0 0 1 8 0" />
          <path d="M19 31h10v5a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2z" />
          <path d="M24 4v4M33 8l-2 3M39 20h-4M15 8l2 3" strokeDasharray="2.5 3" />
        </g>
      )}
    </svg>
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
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
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
  return (
    <div className="dx-window" ref={ref}>
      <div className="dx-window-bar">
        <LogoMark size={18} />
        <span className="dx-window-path">/projetos/quadro-motor-01.dcs</span>
        <div className="dx-window-tabs">
          <span>Esquema</span>
          <span>Ladder</span>
          <span className="on">Painel 3D</span>
          <span>Monitor</span>
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
              <LandingShowcase compact />
            </div>
          </Suspense>
        ) : (
          <div className="dx-stage-skeleton" aria-hidden />
        )}
      </div>
      <div className="dx-window-foot">
        <b>
          <i aria-hidden /> Simulação ativa
        </b>
        <span>Fonte 24 V → LOGO! → KM1</span>
        <span className="end">3 equipamentos · 4 ligações</span>
      </div>
    </div>
  )
}

/** Anatomia da interface — maquete do editor (barra + biblioteca + esquema + propriedades). */
function EditorAnatomy() {
  return (
    <div className="dx-window dx-anatomy">
      <div className="dx-window-bar">
        <span className="dx-window-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <div className="dx-window-tabs">
          <span className="on">Esquema</span>
          <span>Ladder</span>
          <span>Painel 3D</span>
        </div>
      </div>
      <div className="dx-anatomy-body">
        <div className="dx-anatomy-rail" aria-hidden>
          <b className="on" />
          <b />
          <b />
          <b />
          <b />
          <b />
        </div>
        <div className="dx-anatomy-view" aria-hidden>
          <svg viewBox="0 0 460 300" preserveAspectRatio="xMidYMid meet">
            <defs>
              <pattern id="dx-dot" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill="#d3dbe5" />
              </pattern>
            </defs>
            <rect width="460" height="300" fill="url(#dx-dot)" />
            {/* barramento + rede ladder simplificada */}
            <g fill="none" stroke="#94a3b8" strokeWidth="1.6">
              <path d="M60 40v222" strokeWidth="2.4" />
              <path d="M60 70h120" />
              <path d="M60 150h240" />
              <path d="M60 230h120" />
            </g>
            {/* contactos */}
            <g fill="none" stroke="#3d4b5e" strokeWidth="1.6">
              <path d="M92 62v16M106 62v16M92 70h6m8 0h6" />
              <path d="M144 142v16M158 142v16M144 150h6m8 0h6" />
              <path d="M196 142v16M210 142v16M196 150h6m8 0h6" />
            </g>
            {/* bobina energizada */}
            <g fill="#eef4ff" stroke="#2655e5" strokeWidth="2">
              <circle className="dx-coil" cx="286" cy="150" r="11" />
            </g>
            <path d="M60 150h215" stroke="#2655e5" strokeWidth="2" fill="none" />
            <path className="dx-flow" d="M60 150h215" stroke="#ffffff" strokeOpacity=".9" strokeWidth="2" strokeLinecap="round" fill="none" />
            <g fill="none" stroke="#94a3b8" strokeWidth="1.6">
              <circle cx="222" cy="70" r="11" />
              <circle cx="222" cy="230" r="11" />
            </g>
            {/* etiquetas */}
            <g fontFamily="Inter, sans-serif" fontSize="10" fontWeight="600" fill="#64748b">
              <text x="90" y="52">E0.0</text>
              <text x="280" y="132">Q0.1</text>
              <text x="60" y="272">NW 1 — Marcha</text>
              <text x="60" y="286" fontWeight="500" fill="#8b98a9">Scan 4 ms</text>
            </g>
            {/* seleção */}
            <rect x="138" y="136" width="26" height="28" rx="2" fill="#2655e5" fillOpacity=".08" stroke="#2655e5" strokeWidth="1.4" strokeDasharray="4 3" />
          </svg>
        </div>
        <div className="dx-anatomy-props" aria-hidden>
          <b style={{ width: '60%' }} />
          <span />
          <span />
          <span />
          <b style={{ width: '45%' }} />
          <span />
          <span />
        </div>
      </div>
      <div className="dx-window-foot">
        <span>Selecionar</span>
        <span>Snap 1 mm</span>
        <span>Malha 20 px</span>
        <span className="end">Zoom 100%</span>
      </div>
    </div>
  )
}

/* ================================================================ página */

export default function Landing({ onRegister, onLogin }: { onRegister: () => void; onLogin: () => void }) {
  const [menu, setMenu] = useState(false)
  const [cat, setCat] = useState('Todos')
  const [swapped, setSwapped] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [active, setActive] = useState('')
  useReveal()

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
    LINKS.forEach(([href]) => {
      const el = document.getElementById(href.slice(1))
      if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [])

  // Esc fecha o menu móvel
  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu])

  const links = LINKS
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
            <button className="dx-btn dx-btn-primary dx-btn-sm" onClick={onRegister}>
              Começar <span className="dx-long">gratuitamente</span>
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
              <button className="dx-btn dx-btn-primary" onClick={onRegister}>
                Começar
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ------------------------------------------------------------- HERO */}
      <header className="dx-hero">
        <div className="dx-wrap dx-hero-in">
          <div className="dx-hero-copy">
            <span className="dx-over">Crie · configure · valide — antes da obra</span>
            <h1>
              Desenhe quadros elétricos <em>em 3D.</em>
            </h1>
            <p>Monte o quadro em 3D com modelos CAD reais, desenhe o esquema, programe a lógica e simule o comando — tudo no mesmo projeto.</p>
            <div className="dx-hero-actions">
              <button className="dx-btn dx-btn-primary dx-btn-lg" onClick={onRegister}>
                Começar gratuitamente
                <IconArrowRight size={16} className="dx-arrow" />
              </button>
              <a className="dx-btn dx-btn-secondary dx-btn-lg" href="#produto">
                Ver como funciona
              </a>
            </div>
            <ul className="dx-hero-meta">
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
          <span>Contactores</span>
          <span>Relés</span>
          <span>Bornes</span>
          <span>PLC</span>
          <span>Fontes</span>
          <span>Sinalização</span>
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
            <span className="dx-over">O estúdio completo</span>
            <h2>Esquema, Ladder e painel 3D sobre o mesmo modelo.</h2>
            <p>O esquema elétrico, a lógica Ladder e o painel 3D leem e escrevem o mesmo ficheiro — o que edita num sítio aparece instantaneamente nos outros.</p>
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
                  <p>Esquema ↔ Painel 3D ↔ Ladder: os bornes, cabos e referências são os mesmos em todas as vistas.</p>
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
            <span className="dx-over">Biblioteca de componentes</span>
            <h2>Os equipamentos que encontra num quadro real.</h2>
            <p>Pesquise, filtre por categoria e arraste para o quadro. Cada componente traz fabricante, modelo, dimensões e pré-visualização 3D.</p>
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
              <article className="dx-lib-card" key={cat + c.n} style={stagger(i)}>
                <div className="dx-lib-thumb" aria-hidden>
                  <LibSymbol s={c.s} />
                  <span className="dx-lib-3d">3D</span>
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
            <p>Crie a conta e monte o primeiro quadro em 3D em menos de um minuto. Gratuito, sem instalação.</p>
          </div>
          <div className="dx-cta-actions">
            <button className="dx-btn dx-btn-white dx-btn-lg" onClick={onRegister}>
              Começar gratuitamente
              <IconArrowRight size={16} className="dx-arrow" />
            </button>
            <button className="dx-btn dx-btn-outline-white dx-btn-lg" onClick={onLogin}>
              Já tenho conta
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
