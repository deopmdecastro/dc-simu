import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import Logo from '../ui/Brand'

/** Viewport 3D real do produto — carregado só quando entra em vista (performance). */
const LandingShowcase = lazy(() => import('../three/LandingShowcase'))

const FEATURES = [
  { k: 'VISUALIZAÇÃO', i: '▧', t: 'Quadro em 3D real', p: 'Modelos CAD dos fabricantes montados em calha DIN, com cabos, bornes e dimensões corretas.' },
  { k: 'ESQUEMA', i: '⌁', t: 'Esquema elétrico ligado', p: 'Desenhe o circuito, ligue bornes e veja os erros de ligação detetados enquanto trabalha.' },
  { k: 'LÓGICA', i: '▤', t: 'Ladder + GRAFCET', p: 'Programe a lógica de comando e acompanhe o scan do PLC rede a rede, em tempo real.' },
  { k: 'SIMULAÇÃO', i: '◉', t: 'Simulação de comandos', p: 'Contactores, relés, proteções e motores reagem como no quadro real — antes de comprar material.' },
  { k: 'DOCUMENTAÇÃO', i: '▦', t: 'Lista de material e datasheets', p: 'BOM automática, etiquetas normalizadas e datasheets dos equipamentos usados no projeto.' },
  { k: 'EQUIPA', i: '↗', t: 'Projetos partilhados', p: 'Convide editores e mantenha o mesmo projeto acessível a toda a equipa, em qualquer ecrã.' },
]

const LIBRARY = [
  { i: '▮', n: 'Disjuntor 1P/2P', m: 'Curva C · 1–32 A', c: 'Proteção' },
  { i: '▣', n: 'Contactor CWC07', m: 'WEG · 24 V DC', c: 'Contactores' },
  { i: '◈', n: 'Relé auxiliar', m: '4 contactos · 24 V', c: 'Relés' },
  { i: '⬤', n: 'Botão de emergência', m: 'Metaltex P20AKR', c: 'Comando' },
  { i: '▥', n: 'Bornes e barras', m: 'Fase · Neutro · PE', c: 'Ligações' },
  { i: '▤', n: 'PLC LOGO! 12/24 RC', m: 'Siemens', c: 'Controladores' },
  { i: '⌁', n: 'Fonte DRAN120 24 V', m: 'Proauto · 24 A', c: 'Fontes' },
  { i: '◉', n: 'Sinalizadores', m: 'LED 22 mm', c: 'Sinalização' },
]

const CATEGORIES = ['Todos', 'Proteção', 'Contactores', 'Relés', 'Comando', 'Controladores', 'Fontes', 'Ligações', 'Sinalização']

const FLOW = [
  ['01', 'Escolher componente'],
  ['02', 'Adicionar ao quadro'],
  ['03', 'Posicionar em 3D'],
  ['04', 'Configurar'],
  ['05', 'Ligar componentes'],
  ['06', 'Exportar'],
]

const WHO = [
  { i: '🔧', t: 'Eletricistas', d: 'Montar e validar o quadro antes de chegar à obra.' },
  { i: '📐', t: 'Projetistas', d: 'Esquema, disposição e documentação no mesmo ficheiro.' },
  { i: '🎓', t: 'Engenheiros e formadores', d: 'Ensinar comandos elétricos com simulação real.' },
  { i: '🏭', t: 'Fabricantes de quadros', d: 'Antecipar espaço, calhas e material necessário.' },
  { i: '🤖', t: 'Integradores de automação', d: 'Testar lógica Ladder/GRAFCET sem hardware.' },
  { i: '🏢', t: 'Empresas industriais', d: 'Manter o histórico dos quadros instalados.' },
]

const FAQ = [
  { q: 'Preciso de instalar alguma coisa?', a: 'Não. O DC-SIMU corre no navegador e pode ser instalado como aplicação (PWA) no computador ou telemóvel.' },
  { q: 'Os modelos 3D são reais?', a: 'Sim. Usamos modelos CAD dos fabricantes para os equipamentos disponíveis, com dimensões reais em calha DIN.' },
  { q: 'Posso trabalhar em equipa?', a: 'Sim. O proprietário convida editores, que passam a ver o projeto na sua área de trabalho.' },
  { q: 'Que circuitos posso simular?', a: 'Comandos elétricos industriais: proteções, contactores, relés, fontes, motores e PLC, com lógica Ladder e GRAFCET.' },
]

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
    <div className="dx-viewport" ref={ref}>
      <div className="dx-viewport-bar">
        <Logo size={20} tone="dark" tagline={false} />
        <span className="dx-mono">/ QUADRO · MOTOR-01</span>
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
        <b>● SIMULAÇÃO ATIVA</b>
        <span>Fonte 24 V → PLC LOGO! → Contactor KM1</span>
        <span className="dx-mono">3 equipamentos · 4 ligações · snap 1 mm</span>
      </div>
    </div>
  )
}

export default function Landing({ onRegister, onLogin }: { onRegister: () => void; onLogin: () => void }) {
  const [menu, setMenu] = useState(false)
  const [cat, setCat] = useState('Todos')
  useReveal()
  const links = [
    ['#produto', 'Produto'],
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
        </div>
      </nav>

      {/* ------------------------------------------------------------- HERO */}
      <header className="dx-hero">
        <div className="dx-wrap">
          <div className="dx-hero-copy">
            <span className="dx-over">
              <i />
              ELECTRICAL PANEL STUDIO
            </span>
            <h1>
              Projete quadros elétricos
              <br />
              <em>em 3D.</em>
            </h1>
            <p>Crie, configure e valide os seus quadros elétricos num ambiente 3D profissional — com esquema, lógica de comando e simulação no mesmo projeto.</p>
            <div className="dx-hero-actions">
              <button className="dx-btn dx-btn-primary dx-btn-lg" onClick={onRegister}>
                Começar gratuitamente →
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

      <div className="dx-strip">
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
              <span className="dx-over">O PROBLEMA</span>
              <h2>
                Projetar um quadro ainda se faz
                <br />
                com papel, fita métrica e sorte.
              </h2>
            </div>
            <p>Entre o esquema no CAD, a lista de material numa folha de cálculo e a montagem na bancada, perde-se tempo — e descobrem-se erros tarde demais.</p>
          </div>
          <div className="dx-split">
            <div className="dx-panel dx-panel-problem" data-rv>
              <h3>Sem DC-SIMU</h3>
              <ul>
                <li>
                  <span>
                    <b>Espaço mal calculado</b> — o material não cabe na calha.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Erros de ligação</b> só detetados com o quadro montado.
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
                    <b>Material e datasheets</b> gerados a partir do projeto.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- BIBLIOTECA */}
      <section className="dx-section dx-lib" id="biblioteca">
        <div className="dx-wrap">
          <div className="dx-head" data-rv>
            <div>
              <span className="dx-over">BIBLIOTECA DE COMPONENTES</span>
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
          </div>
          <div className="dx-lib-grid" data-rv>
            {visibleLib.map((c) => (
              <article className="dx-lib-card" key={c.n}>
                <div className="dx-lib-thumb" aria-hidden>
                  {c.i}
                </div>
                <div className="dx-lib-body">
                  <b>{c.n}</b>
                  <small>{c.m}</small>
                  <div className="dx-lib-tags">
                    <span>{c.c}</span>
                    <span>3D</span>
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
              <span className="dx-over">FLUXO DE TRABALHO</span>
              <h2>
                Do componente ao quadro montado,
                <br />
                em seis passos.
              </h2>
            </div>
            <p>Um percurso direto, pensado para quem projeta todos os dias. Sem configurações demoradas.</p>
          </div>
          <ol className="dx-flow" data-rv>
            {FLOW.map(([n, t]) => (
              <li key={n}>
                <b>{n}</b>
                <span>{t}</span>
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
              <span className="dx-over">FUNCIONALIDADES</span>
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
                <div className="dx-ic" aria-hidden>
                  {f.i}
                </div>
                <h3>{f.t}</h3>
                <p>{f.p}</p>
                <span>{f.k}</span>
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
              <span className="dx-over">PARA QUEM É</span>
              <h2>Feito para quem monta, projeta e mantém quadros.</h2>
            </div>
            <p>Da bancada à sala de projeto, o mesmo ficheiro acompanha todas as fases do trabalho.</p>
          </div>
          <div className="dx-who" data-rv>
            {WHO.map((w) => (
              <div key={w.t}>
                <i aria-hidden>{w.i}</i>
                <span>
                  <b>{w.t}</b>
                  <small>{w.d}</small>
                </span>
              </div>
            ))}
          </div>
          <div className="dx-stats" style={{ marginTop: 'var(--dx-5)' }} data-rv>
            <div>
              <b>5</b>
              <span>vistas sincronizadas</span>
            </div>
            <div>
              <b>11</b>
              <span>categorias de material</span>
            </div>
            <div>
              <b>3D</b>
              <span>modelos CAD reais</span>
            </div>
            <div>
              <b>PWA</b>
              <span>instalável em qualquer ecrã</span>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- FAQ */}
      <section className="dx-section dx-faq" id="faq" style={{ background: 'var(--dx-surface-2)', borderTop: '1px solid var(--dx-line)' }}>
        <div className="dx-wrap">
          <div className="dx-head" data-rv>
            <div>
              <span className="dx-over">PERGUNTAS FREQUENTES</span>
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
            <span className="dx-over">PRONTO PARA COMEÇAR?</span>
            <h2>O próximo quadro começa aqui.</h2>
            <p>Crie a conta e monte o primeiro quadro em 3D em menos de um minuto.</p>
          </div>
          <div className="dx-cta-actions">
            <button className="dx-btn dx-btn-on-deep dx-btn-lg" onClick={onRegister}>
              Começar gratuitamente →
            </button>
            <button className="dx-btn dx-btn-secondary dx-btn-lg" style={{ background: 'transparent', borderColor: '#2f4468', color: '#fff' }} onClick={onLogin}>
              Já tenho conta
            </button>
          </div>
        </div>
      </section>

      <footer className="dx-foot">
        <div className="dx-wrap dx-foot-in">
          <Logo size={26} tone="dark" />
          <span>Quadros elétricos em 3D · Esquema · Ladder · Simulação</span>
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
