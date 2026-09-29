import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import Logo, { LogoMark } from '../ui/Brand'
import { IconCube, IconSchematic, IconLadder, IconPlay, IconFile, IconProjects } from '../ui/icons'

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
    <div className="dx-viewport-wrap dx-frame" ref={ref}>
      <span className="dx-tick tl" />
      <span className="dx-tick tr" />
      <span className="dx-tick bl" />
      <span className="dx-tick br" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingInline: 2 }}>
        <span className="dx-anno dx-anno-on-deep" style={{ flex: 1 }}>Fig.01 — Painel 3D · calha DIN 35 mm</span>
        <span className="dx-mono" style={{ color: '#5f7089', fontSize: 10 }}>ESC 1:1 · MM</span>
      </div>
      <div className="dx-viewport">
        <div className="dx-viewport-bar">
          <LogoMark size={18} />
          <span className="dx-path">/projetos/quadro-motor-01.dcs</span>
          <div className="dx-tabs">
            <span>Esquema</span>
            <span>Ladder</span>
            <span className="on">Painel 3D</span>
            <span>Monitor</span>
          </div>
        </div>
        <div className="dx-viewport-stage">
          {visible ? (
            <Suspense fallback={<div className="dc-showcase-fallback">A carregar modelos 3D…</div>}>
              <LandingShowcase compact />
            </Suspense>
          ) : (
            <div className="dc-showcase-fallback">Painel 3D</div>
          )}
        </div>
        <div className="dx-viewport-foot">
          <b>Simulação ativa</b>
          <span>Fonte 24 V → PLC LOGO! → Contator KM1</span>
          <span className="dx-mono">3 EQUIP · 4 LIGAÇÕES · SNAP 1 MM</span>
        </div>
      </div>
    </div>
  )
}

/** Anatomia da interface — maquete técnica do editor (barra + biblioteca + esquema + propriedades). */
function EditorAnatomy() {
  return (
    <div className="dx-appframe dx-frame">
      <span className="dx-tick tl" style={{ color: '#3b4a5c' }} />
      <span className="dx-tick tr" style={{ color: '#3b4a5c' }} />
      <span className="dx-tick bl" style={{ color: '#3b4a5c' }} />
      <span className="dx-tick br" style={{ color: '#3b4a5c' }} />
      <div className="dx-appframe-bar">
        <span className="on" />
        <span />
        <span />
        <b />
        <i />
        <i />
        <i />
      </div>
      <div className="dx-appframe-body">
        <div className="dx-appframe-rail" aria-hidden>
          <b className="on" />
          <b />
          <b />
          <b />
          <b />
          <b />
          <b />
        </div>
        <div className="dx-appframe-view" aria-hidden>
          <svg viewBox="0 0 460 300" preserveAspectRatio="xMidYMid meet">
            <defs>
              <pattern id="dx-dot" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill="#26313e" />
              </pattern>
            </defs>
            <rect width="460" height="300" fill="url(#dx-dot)" />
            {/* barramento + rede ladder simplificada */}
            <g fill="none" stroke="#42556e" strokeWidth="1.6">
              <path d="M60 40v222" strokeWidth="2.4" />
              <path d="M60 70h120m0 0v0" />
              <path d="M60 150h240" />
              <path d="M60 230h120" />
            </g>
            {/* contatos */}
            <g fill="none" stroke="#8fa2bc" strokeWidth="1.6">
              <path d="M92 62v16M106 62v16M92 70h6m8 0h6" />
              <path d="M144 142v16M158 142v16M144 150h6m8 0h6" />
              <path d="M196 142v16M210 142v16M196 150h6m8 0h6" />
            </g>
            {/* bobina energizada */}
            <g fill="none" stroke="#f5a524" strokeWidth="2">
              <circle cx="286" cy="150" r="11" />
              <path d="M60 150h215" strokeDasharray="4 3" opacity=".85" />
            </g>
            <g fill="none" stroke="#42556e" strokeWidth="1.6">
              <circle cx="222" cy="70" r="11" />
              <circle cx="222" cy="230" r="11" />
            </g>
            {/* etiquetas */}
            <g fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#5f7089" letterSpacing="1">
              <text x="90" y="52">E0.0</text>
              <text x="280" y="132">Q0.1</text>
              <text x="60" y="272" fill="#3f4f63">NW 1 — MARCHA</text>
              <text x="60" y="285" fill="#3f4f63">SCAN 4 MS</text>
            </g>
            {/* cursor de seleção */}
            <rect x="138" y="136" width="26" height="28" fill="none" stroke="#2457e6" strokeWidth="1.4" strokeDasharray="4 3" />
          </svg>
        </div>
        <div className="dx-appframe-props" aria-hidden>
          <b style={{ width: '60%' }} />
          <span />
          <span />
          <span />
          <b style={{ width: '45%' }} />
          <span />
          <span />
        </div>
      </div>
      <div className="dx-appframe-foot">
        <span>Selecionar</span>
        <span>·</span>
        <span>Snap 1 mm</span>
        <span>·</span>
        <span>Malha 20 px</span>
        <u style={{ marginLeft: 'auto' }}>Zoom 100%</u>
      </div>
    </div>
  )
}

/* ================================================================ página */

export default function Landing({ onRegister, onLogin }: { onRegister: () => void; onLogin: () => void }) {
  const [menu, setMenu] = useState(false)
  const [cat, setCat] = useState('Todos')
  useReveal()
  const links = [
    ['#produto', 'Produto'],
    ['#editor', 'Editor'],
    ['#biblioteca', 'Biblioteca'],
    ['#fluxo', 'Como funciona'],
    ['#para-quem', 'Para quem'],
    ['#faq', 'FAQ'],
  ]
  const visibleLib = LIBRARY.filter((c) => cat === 'Todos' || c.c === cat)

  return (
    <div className="dx dx-landing">
      <nav className="dx-nav">
        <div className="dx-wrap dx-nav-in">
          <Logo size={30} />
          <div className="dx-nav-links">
            {links.map(([href, label]) => (
              <a key={href} href={href}>
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
            <button className="dx-burger" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
              <i />
              <i />
              <i />
            </button>
          </div>
        </div>
        <div className={'dx-mobile-menu' + (menu ? ' open' : '')} onClick={() => setMenu(false)}>
          {links.map(([href, label]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
          <div style={{ display: 'flex', gap: 10, paddingTop: 14 }}>
            <button className="dx-btn dx-btn-secondary" style={{ flex: 1 }} onClick={onLogin}>
              Entrar
            </button>
            <button className="dx-btn dx-btn-primary" style={{ flex: 1 }} onClick={onRegister}>
              Começar
            </button>
          </div>
        </div>
      </nav>

      {/* ------------------------------------------------------------- HERO */}
      <header className="dx-hero">
        <div className="dx-wrap">
          <div className="dx-hero-copy">
            <div className="dx-hero-logo">
              <Logo size={40} tone="dark" />
            </div>
            <span className="dx-over">
              <i />
              Crie · configure · valide — antes da obra
            </span>
            <h1>
              Desenhe quadros elétricos
              <br />
              <em>em 3D.</em>
            </h1>
            <p>Crie e configure os seus quadros elétricos num ambiente 3D profissional — esquema, lógica de comando e simulação no mesmo projeto.</p>
            <div className="dx-hero-actions">
              <button className="dx-btn dx-btn-primary dx-btn-lg" onClick={onRegister}>
                Começar gratuitamente <span className="dx-arr" aria-hidden>→</span>
              </button>
              <a className="dx-btn dx-btn-secondary dx-btn-lg" href="#produto" style={{ textDecoration: 'none' }}>
                Ver como funciona
              </a>
            </div>
            <div className="dx-hero-meta">
              <span>Modelos CAD reais</span>
              <span>Sem instalação</span>
              <span>Projetos partilhados</span>
            </div>
          </div>
          <HeroViewport />
        </div>
      </header>

      <div className="dx-strip" aria-hidden>
        <span>Proteção</span>
        <i />
        <span>Contactores</span>
        <i />
        <span>Relés</span>
        <i />
        <span>Bornes</span>
        <i />
        <span>PLC</span>
        <i />
        <span>Fontes</span>
        <i />
        <span>Sinalização</span>
      </div>

      {/* --------------------------------------------------- PROBLEMA/SOLUÇÃO */}
      <section className="dx-section" id="produto">
        <div className="dx-wrap">
          <div className="dx-head" data-rv>
            <div>
              <span className="dx-over">
                <i />
                O problema
              </span>
              <h2>
                Projetar um quadro ainda se faz
                <br />
                com papel, fita métrica <em>e sorte.</em>
              </h2>
            </div>
            <p>Entre o esquema no CAD, a lista de material numa folha de cálculo e a montagem na bancada, perde-se tempo — e descobrem-se erros tarde demais.</p>
          </div>
          <div className="dx-split">
            <div className="dx-panel dx-panel-problem" data-rv>
              <span className="dx-mono">ANTES</span>
              <h3>Sem DC-SIMU</h3>
              <ul>
                <li>
                  <span>
                    <b>Espaço mal calculado</b> — o material não cabe na calha.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Erros de ligação</b> só detetados com o quadro já montado.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Lógica por validar</b> — o PLC só é testado em obra.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Documentação dispersa</b> por ficheiros e versões.
                  </span>
                </li>
              </ul>
            </div>
            <div className="dx-panel dx-panel-solution" data-rv>
              <span className="dx-mono">DEPOIS</span>
              <h3>Com DC-SIMU</h3>
              <ul>
                <li>
                  <span>
                    <b>Quadro em 3D à escala</b> com modelos CAD do fabricante.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Verificação de ligações</b> enquanto desenha o esquema.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Simulação do comando</b> em Ladder e GRAFCET, antes da obra.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Material e datasheets</b> gerados a partir do próprio projeto.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ EDITOR */}
      <section className="dx-section dx-studio" id="editor">
        <div className="dx-wrap">
          <div className="dx-head" data-rv>
            <div>
              <span className="dx-over">
                <i />
                O estúdio completo
              </span>
              <h2>
                Três vistas.
                <br />
                Um único <em>modelo de dados.</em>
              </h2>
            </div>
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
      <section className="dx-section dx-lib" id="biblioteca">
        <div className="dx-wrap">
          <div className="dx-head" data-rv>
            <div>
              <span className="dx-over">
                <i />
                Biblioteca de componentes
              </span>
              <h2>Os equipamentos que encontra num quadro real.</h2>
            </div>
            <p>Pesquise, filtre por categoria e arraste para o quadro. Cada componente traz fabricante, modelo, dimensões e pré-visualização 3D.</p>
          </div>
          <div className="dx-lib-toolbar" data-rv>
            {CATEGORIES.map((c) => (
              <button key={c} className="dx-filter" aria-pressed={cat === c} onClick={() => setCat(c)}>
                {c}
              </button>
            ))}
            <span className="dx-lib-count">{visibleLib.length} ITENS</span>
          </div>
          <div className="dx-lib-grid" data-rv>
            {visibleLib.map((c) => (
              <article className="dx-lib-card" key={c.n}>
                <div className="dx-lib-thumb" aria-hidden>
                  <LibSymbol s={c.s} />
                </div>
                <div className="dx-lib-body">
                  <b>{c.n}</b>
                  <small>{c.m}</small>
                  <div className="dx-lib-tags">
                    <span>{c.c}</span>
                    <span className="acc">3D</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- WORKFLOW */}
      <section className="dx-section" id="fluxo">
        <div className="dx-wrap">
          <div className="dx-head" data-rv>
            <div>
              <span className="dx-over">
                <i />
                Fluxo de trabalho
              </span>
              <h2>
                Do componente ao quadro montado,
                <br />
                em seis passos.
              </h2>
            </div>
            <p>Um percurso direto, pensado para quem projeta todos os dias. Sem configurações demoradas.</p>
          </div>
          <ol className="dx-flow" data-rv>
            {FLOW.map(([t, d], i) => (
              <li key={t}>
                <b>ST-0{i + 1}</b>
                <span>{t}</span>
                <small style={{ display: 'block', marginTop: 6, fontSize: 11, lineHeight: 1.5, color: 'var(--dx-ink-3)', fontWeight: 400 }}>{d}</small>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* -------------------------------------------------------- FEATURES */}
      <section className="dx-section" style={{ background: 'var(--dx-surface-2)', borderBlock: '1px solid var(--dx-line)' }}>
        <div className="dx-wrap">
          <div className="dx-head" data-rv>
            <div>
              <span className="dx-over">
                <i />
                Funcionalidades
              </span>
              <h2>
                Uma ferramenta de engenharia,
                <br />
                não mais um editor genérico.
              </h2>
            </div>
            <p>Tudo o que precisa para desenhar, testar e documentar um quadro elétrico — no mesmo ambiente.</p>
          </div>
          <div className="dx-cards">
            {FEATURES.map((f, i) => (
              <article key={f.t} data-rv style={{ transitionDelay: `${(i % 3) * 70}ms` }}>
                <span aria-hidden>F-0{i + 1}</span>
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
      <section className="dx-section" id="para-quem">
        <div className="dx-wrap">
          <div className="dx-head" data-rv>
            <div>
              <span className="dx-over">
                <i />
                Para quem é
              </span>
              <h2>Feito para quem monta, projeta e mantém quadros.</h2>
            </div>
            <p>Da bancada à sala de projeto, o mesmo ficheiro acompanha todas as fases do trabalho.</p>
          </div>
          <div className="dx-who" data-rv>
            {WHO.map((w, i) => (
              <div key={w.t}>
                <i aria-hidden>{String(i + 1).padStart(2, '0')}</i>
                <span>
                  <b>{w.t}</b>
                  <small>{w.d}</small>
                </span>
                <span className="arr" aria-hidden>→</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 'var(--dx-6)' }} data-rv>
            <div className="dx-stats">
              <div>
                <b>5</b>
                <span>vistas sincronizadas</span>
              </div>
              <div>
                <b>3D</b>
                <span>modelos CAD reais</span>
              </div>
              <div>
                <b>
                  11<em>+</em>
                </b>
                <span>categorias de material</span>
              </div>
              <div>
                <b>PWA</b>
                <span>instalável em qualquer ecrã</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- FAQ */}
      <section className="dx-section dx-faq" id="faq" style={{ background: 'var(--dx-surface-2)', borderTop: '1px solid var(--dx-line)' }}>
        <div className="dx-wrap" style={{ maxWidth: 860 }}>
          <div className="dx-head" data-rv style={{ gridTemplateColumns: '1fr' }}>
            <div>
              <span className="dx-over">
                <i />
                Perguntas frequentes
              </span>
              <h2>Tudo o que precisa de saber para começar.</h2>
            </div>
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
            <span className="dx-over">
              <i />
              Pronto para começar?
            </span>
            <h2>
              O próximo quadro <em>começa aqui.</em>
            </h2>
            <p>Crie a conta e monte o primeiro quadro em 3D em menos de um minuto. Gratuito, sem instalação.</p>
          </div>
          <div className="dx-cta-actions">
            <button className="dx-btn dx-btn-primary dx-btn-lg" onClick={onRegister}>
              Começar gratuitamente <span className="dx-arr" aria-hidden>→</span>
            </button>
            <button className="dx-btn dx-btn-secondary dx-btn-lg" onClick={onLogin}>
              Já tenho conta
            </button>
          </div>
        </div>
      </section>

      <footer className="dx-foot">
        <div className="dx-wrap dx-foot-in">
          <Logo size={26} tone="dark" />
          <span style={{ fontFamily: 'var(--dx-mono)', letterSpacing: '.08em', textTransform: 'uppercase' }}>Quadros 3D · Esquema · Ladder · Simulação</span>
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
