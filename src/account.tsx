import { useCallback, useEffect, useRef, useState } from 'react'
import App from './App'
import { useSimStore } from './store/useSimStore'

type User = { id: string; name: string; email: string; role: 'admin' | 'user' }
type Project = { id: string; name: string; revision: number; owner: string; role: 'owner' | 'editor'; updated_at: string }
type Invite = { id: string; project: string; sender: string }
type Open = { id: string; name: string; revision: number }
async function api<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api' + url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Falha no servidor')
  return data as T
}
export default function Account() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [page, setPage] = useState<'landing' | 'login' | 'register' | 'dashboard' | 'editor' | 'admin'>('landing')
  const [projects, setProjects] = useState<Project[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [open, setOpen] = useState<Open | null>(null)
  const openRef = useRef<Open | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [inviteFor, setInviteFor] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    const [p, i] = await Promise.all([api<Project[]>('/projects'), api<Invite[]>('/invitations')]); setProjects(p); setInvites(i)
  }, [])
  useEffect(() => { api<{user:User}>('/me').then(r => { setUser(r.user); setPage('dashboard'); refresh().catch(e => setMessage(e.message)) }).catch(() => {}).finally(() => setReady(true)) }, [refresh])
  const error = (e: unknown) => setMessage(e instanceof Error ? e.message : 'Falha inesperada')
  async function authenticate(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);setMessage('')
    try { const r = await api<{user:User}>(page === 'register' ? '/register' : '/login','POST',form);setUser(r.user);setPage('dashboard');setForm({name:'',email:'',password:''});await refresh() } catch(e) {error(e)} finally {setBusy(false)}
  }
  async function create() {
    const name = prompt('Nome do novo projeto:')?.trim(); if(!name)return
    try { useSimStore.getState().newProject(); const r=await api<Open>('/projects','POST',{name,content:JSON.parse(useSimStore.getState().saveJSON())});await load(r.id) } catch(e){error(e)}
  }
  async function load(id: string) {
    setMessage('')
    try { const r=await api<Open & {content: unknown}>('/projects/'+id);useSimStore.getState().stop();useSimStore.getState().loadJSON(JSON.stringify(r.content));useSimStore.getState().setCurrentProjectName(r.name); const entry={id:r.id,name:r.name,revision:r.revision};openRef.current=entry;setOpen(entry);setPage('editor') }catch(e){error(e)}
  }
  async function save() {
    const entry=openRef.current;if(!entry)return
    try {const r=await api<{revision:number}>('/projects/'+entry.id,'PUT',{revision:entry.revision,content:JSON.parse(useSimStore.getState().saveJSON())});const updated={...entry,revision:r.revision};openRef.current=updated;setOpen(updated);useSimStore.setState({dirty:false});setMessage('Projeto guardado na conta.') }catch(e){error(e)}
  }
  async function leave() {
    if(useSimStore.getState().dirty && !confirm('Existem alterações não guardadas. Voltar aos projetos?'))return
    useSimStore.getState().stop();openRef.current=null;setOpen(null);setPage('dashboard');setMessage('');refresh().catch(error)
  }
  async function invite(id:string) {
    const email=prompt('Email da pessoa convidada (já registada):')?.trim();if(!email)return
    try { await api(`/projects/${id}/invitations`,'POST',{email});setMessage('Convite enviado dentro da aplicação.')}catch(e){error(e)}
  }
  async function reply(id:string,action:'accept'|'reject') {
    try {await api(`/invitations/${id}/${action}`,'POST');await refresh()}catch(e){error(e)}
  }
  async function remove(p:Project) {
    if(!confirm(`Eliminar definitivamente «${p.name}»?`))return
    try {await api('/projects/'+p.id,'DELETE');await refresh()}catch(e){error(e)}
  }
  async function logout() {
    try {await api('/logout','POST');useSimStore.getState().newProject();setUser(null);setOpen(null);openRef.current=null;setProjects([]);setInvites([]);setPage('landing');setMessage('')}catch(e){error(e)}
  }
  useEffect(() => {
    if(page!=='editor')return
    const handle=(e:KeyboardEvent)=>{if(e.ctrlKey && e.key.toLowerCase()==='s'){e.preventDefault();void save()}}
    window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle)
  },[page])
  if(!ready)return <div className="account-shell">A carregar DC-SIMU…</div>
  if(page==='editor' && open)return <><div className="account-bar"><span>{user?.name} · {open.name}</span><span>{message}</span><button onClick={()=>void save()}>Guardar no servidor</button><button onClick={()=>void leave()}>Projetos</button></div><div style={{height:'calc(100vh - 38px)'}}><App onBack={()=>void leave()} onSave={()=>void save()}/></div></>
  return <main className="account-shell">
    <header className="account-header"><b>◈ DC-SIMU</b><nav>{user ? <><span>{user.name}</span>{user.role==='admin'&&<button onClick={()=>setPage('admin')}>Administração</button>}<button onClick={()=>void logout()}>Sair</button></> : <><button onClick={()=>setPage('login')}>Entrar</button><button className="account-primary" onClick={()=>setPage('register')}>Criar conta</button></>}</nav></header>
    {message && <div className="account-alert" role="alert">{message}<button onClick={()=>setMessage('')}>×</button></div>}
    {page==='landing' && <Landing onRegister={()=>setPage('register')} onLogin={()=>setPage('login')}/>}
    {(page==='login'||page==='register')&&<section className="account-card"><span className="account-pill">A SUA ÁREA DE TRABALHO</span><h1>{page==='register'?'Criar conta':'Bem-vindo de volta'}</h1><p>Os seus projetos ficam guardados no servidor.</p><form onSubmit={authenticate}>{page==='register'&&<label>Nome<input required minLength={2} autoComplete="name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>}<label>Email<input required type="email" autoComplete="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Palavra-passe<input required minLength={page==='register'?10:1} type="password" autoComplete={page==='register'?'new-password':'current-password'} value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label><button className="account-primary" disabled={busy}>{busy?'Aguarde…':page==='register'?'Criar conta':'Entrar'}</button></form><p>{page==='register'?'Já tem conta?':'Ainda não tem conta?'} <button onClick={()=>{setMessage('');setPage(page==='register'?'login':'register')}}>{page==='register'?'Entrar':'Registar'}</button></p></section>}
    {page==='admin'&&user?.role==='admin'&&<AdminPanel onBack={()=>setPage('dashboard')}/>}
    {page==='dashboard'&&<section className="account-dashboard"><span className="account-pill">ÁREA DE PROJETOS</span><h1>Os seus projetos<span>.</span></h1><p>Olá, {user?.name}. Continue um projeto ou comece algo novo.</p><button className="account-primary" onClick={()=>void create()}>＋ Novo projeto</button>{invites.length>0&&<div className="account-invites"><h2>Convites pendentes</h2>{invites.map(i=><div key={i.id}><b>{i.project}</b> · convite de {i.sender} <button onClick={()=>void reply(i.id,'accept')}>Aceitar</button><button onClick={()=>void reply(i.id,'reject')}>Recusar</button></div>)}</div>}<div className="account-grid">{projects.map(p=><article key={p.id}><span className="account-pill">{p.role==='owner'?'PROPRIETÁRIO':'EDITOR'}</span><h2>{p.name}</h2><p>Por {p.owner} · {new Date(p.updated_at).toLocaleDateString('pt-PT')}</p><div><button className="account-primary" onClick={()=>void load(p.id)}>Abrir →</button>{p.role==='owner'&&<><button onClick={()=>void invite(p.id)}>Convidar</button><button onClick={()=>setInviteFor(inviteFor===p.id?null:p.id)}>Membros</button><button onClick={()=>void remove(p)}>Eliminar</button></>}</div>{inviteFor===p.id&&<Members id={p.id}/>}</article>)}{!projects.length&&<div className="account-empty">Ainda não há projetos. Crie o primeiro para começar.</div>}</div></section>}
  </main>
}
function Members({id}:{id:string}) {const [members,setMembers]=useState<{name:string;email:string}[]>([]);useEffect(()=>{api<{members:{name:string;email:string}[]}>('/projects/'+id+'/members').then(r=>setMembers(r.members)).catch(()=>{})},[id]);return <small>Editores: {members.length?members.map(m=>`${m.name} (${m.email})`).join(', '):'nenhum'}</small>}

type AdminUser = User & { projects: number }
type AdminProject = { id: string; name: string; owner: string; updated_at: string }
function AdminPanel({onBack}:{onBack:()=>void}) {
  const [users,setUsers]=useState<AdminUser[]>([])
  const [projects,setProjects]=useState<AdminProject[]>([])
  const [error,setError]=useState('')
  const reload=useCallback(async()=>{try{const [u,p]=await Promise.all([api<AdminUser[]>('/admin/users'),api<AdminProject[]>('/admin/projects')]);setUsers(u);setProjects(p);setError('')}catch(e){setError(e instanceof Error?e.message:'Falha na administração')}},[])
  useEffect(()=>{void reload()},[reload])
  async function remove(type:'users'|'projects',id:string,label:string){
    if(!confirm(`Eliminar permanentemente ${label}? Esta ação não pode ser anulada.`))return
    try{await api(`/admin/${type}/${id}`,'DELETE');await reload()}catch(e){setError(e instanceof Error?e.message:'Falha ao eliminar')}
  }
  return <section className="account-dashboard account-admin"><button onClick={onBack}>← Projetos</button><span className="account-pill">ACESSO RESTRITO</span><h1>Administração<span>.</span></h1><p>Gestão global de contas e projetos. Eliminar uma conta remove também os projetos de que é proprietária.</p>{error&&<p role="alert">{error}</p>}
    <h2>Utilizadores · {users.length}</h2><div className="account-admin-list">{users.map(u=><div key={u.id}><span><strong>{u.name}</strong> · {u.email} · {u.role} · {u.projects} projeto(s)</span>{u.role!=='admin'&&<button onClick={()=>void remove('users',u.id,`a conta ${u.email} e os seus projetos`)}>Eliminar conta</button>}</div>)}</div>
    <h2>Projetos · {projects.length}</h2><div className="account-admin-list">{projects.map(p=><div key={p.id}><span><strong>{p.name}</strong> · {p.owner}</span><button onClick={()=>void remove('projects',p.id,`o projeto ${p.name}`)}>Eliminar projeto</button></div>)}</div>
  </section>
}

function Landing({onRegister,onLogin}:{onRegister:()=>void;onLogin:()=>void}) {
  return <div className="landing">
    <section className="landing-hero">
      <div className="landing-copy">
        <div className="landing-eyebrow"><span className="landing-pulse"/> O SEU LABORATÓRIO DE AUTOMAÇÃO</div>
        <h1>Projete o circuito.<br/><span>Veja-o ganhar vida.</span></h1>
        <p>Do primeiro fio ao scan do PLC: crie esquemas, programe em Ladder e visualize o seu painel em 3D. Tudo ligado, no mesmo projeto.</p>
        <div className="landing-actions"><button className="account-primary" onClick={onRegister}>Criar projeto grátis <span aria-hidden>↗</span></button><button className="landing-secondary" onClick={onLogin}>Entrar na minha conta <span aria-hidden>→</span></button></div>
        <div className="landing-trust"><span className="landing-trust-dot">✓</span> Esquema, Ladder e painel 3D sincronizados <span className="landing-trust-line"/> <span className="landing-trust-dot">✓</span> Projetos partilhados com a equipa</div>
      </div>
      <div className="landing-visual" aria-label="Pré-visualização ilustrativa do editor de esquema DC-SIMU" role="img">
        <div className="landing-window">
          <div className="landing-window-top"><div className="landing-window-brand"><span>◇</span> DC-SIMU <small>/ PROJETO MOTOR 01</small></div><div className="landing-window-controls"><i/><i/><i/></div></div>
          <div className="landing-window-tools"><span className="active">⌁ &nbsp; Esquema</span><span>▤ &nbsp; Ladder</span><span>▧ &nbsp; Painel 3D</span><span>◉ &nbsp; Monitor</span><b>● &nbsp; RUN</b></div>
          <div className="landing-window-body"><aside><small>BIBLIOTECA</small><div>▣ <span>Controladores</span></div><div>◫ <span>Proteções</span></div><div>▤ <span>Contactores</span></div><div>⊕ <span>Botões e sinais</span></div><div>⌁ <span>Fontes</span></div><small className="landing-layers">CAMADAS</small><div>◉ <span>Componentes</span></div><div>◉ <span>Cabos</span></div></aside>
            <div className="landing-canvas"><div className="landing-canvas-title">CIRCUITO DE COMANDO <span>ESQUEMA · 01</span></div><svg viewBox="0 0 620 370" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
              <defs><pattern id="landgrid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#d4e0e8"/></pattern><marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="#24ad8b"/></marker></defs><rect width="620" height="370" fill="url(#landgrid)"/>
              <g fill="none" stroke="#3f779d" strokeWidth="2.5" strokeLinejoin="round"><path d="M148 96 H218 V115 H269"/><path d="M350 115 H406 V85 H474"/><path d="M148 149 H200 V208 H269"/><path d="M350 208 H410 V232 H474"/><path d="M200 208 V287 H474"/><path d="M474 85 V287" stroke="#2da886"/></g>
              <g fill="#fff" stroke="#748da1" strokeWidth="2"><rect x="34" y="64" width="114" height="112" rx="7"/><rect x="269" y="79" width="81" height="157" rx="7"/><rect x="474" y="56" width="112" height="251" rx="7"/></g>
              <g fill="#edf4f8"><rect x="43" y="74" width="96" height="30" rx="3"/><rect x="278" y="89" width="63" height="30" rx="3"/><rect x="483" y="67" width="94" height="35" rx="3"/></g>
              <g fill="#193e59" fontFamily="system-ui" fontWeight="700" fontSize="11"><text x="56" y="94">24V POWER</text><text x="283" y="109">KM1</text><text x="500" y="88">PLC · LOGO!</text></g>
              <g fill="#5d778e" fontFamily="system-ui" fontSize="10"><text x="47" y="129">DRAN120-24B</text><text x="282" y="145">A1</text><text x="282" y="211">A2</text><text x="492" y="137">I1   I2   I3   I4</text><text x="492" y="260">Q1   Q2   Q3   Q4</text></g>
              <g fill="#28a787" stroke="#fff" strokeWidth="2"><circle cx="148" cy="96" r="6"/><circle cx="148" cy="149" r="6"/><circle cx="269" cy="115" r="6"/><circle cx="269" cy="208" r="6"/><circle cx="350" cy="115" r="6"/><circle cx="350" cy="208" r="6"/><circle cx="474" cy="85" r="6"/><circle cx="474" cy="232" r="6"/><circle cx="474" cy="287" r="6"/></g><rect x="502" y="158" width="53" height="48" rx="4" fill="#143c56"/><text x="509" y="187" fontFamily="monospace" fill="#91e2ba" fontSize="12">RUN ✓</text>
              <rect x="204" y="270" width="126" height="27" rx="13" fill="#dbf5eb"/><circle cx="221" cy="283" r="4" fill="#24a87c"/><text x="233" y="287" fontFamily="system-ui" fill="#147053" fontSize="10" fontWeight="700">Circuito ativo</text>
            </svg><div className="landing-canvas-status"><span>● &nbsp; SIMULAÇÃO ATIVA</span><span>3 componentes &nbsp; · &nbsp; 5 ligações</span></div></div>
          </div>
        </div>
        <div className="landing-float landing-float-top"><span>⚡</span><div><strong>Simulação em tempo real</strong><small>Do borne à lógica do PLC</small></div></div>
        <div className="landing-float landing-float-bottom"><span>▧</span><div><strong>Uma única área de trabalho</strong><small>Esquema · Ladder · Painel 3D</small></div></div>
      </div>
    </section>
    <div className="landing-ribbon"><span>UM PROJETO, VÁRIAS VISTAS</span><b>Esquema elétrico</b><i/> <b>Ladder</b><i/> <b>GRAFCET</b><i/> <b>Painel 3D</b><i/> <b>Monitorização</b></div>
    <section className="landing-below"><div className="landing-section-heading"><div><span className="account-pill">PENSADO PARA QUEM CONSTRÓI</span><h2>Menos ferramentas separadas.<br/>Mais tempo a criar.</h2></div><p>Uma experiência de ponta a ponta para desenhar, testar e partilhar os seus sistemas de automação.</p></div><div className="landing-benefits"><article><span className="landing-icon">⌁</span><span>01 / LIGAR</span><h3>Monte o seu esquema</h3><p>Organize componentes, bornes e cabos num espaço de trabalho visual.</p></article><article><span className="landing-icon">▤</span><span>02 / PROGRAMAR</span><h3>Programe e simule</h3><p>Crie lógica Ladder e acompanhe o comportamento do PLC durante o scan.</p></article><article><span className="landing-icon">↗</span><span>03 / PARTILHAR</span><h3>Trabalhe em conjunto</h3><p>Convide editores para o projeto e continue o trabalho em equipa.</p></article></div></section>
    <section className="landing-end"><div><span className="account-pill">PRONTO PARA COMEÇAR?</span><h2>O próximo circuito começa aqui.</h2><p>Crie uma conta e transforme o seu projeto num sistema que pode ver funcionar.</p></div><button className="account-primary" onClick={onRegister}>Criar conta <span aria-hidden>↗</span></button></section>
    <footer className="landing-footer"><strong>◇ DC-SIMU</strong><span>Esquema. Lógica. Simulação.</span><small>© {new Date().getFullYear()} DC-SIMU</small></footer>
  </div>
}
