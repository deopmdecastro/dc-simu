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

function SimWindow({full}:{full?:boolean}) {
  return <div className={'lp-win'+(full?' full':'')} role="img" aria-label="Pré-visualização do editor DC-SIMU: esquema, Ladder, Painel 3D e Monitor">
    <div className="lp-win-top"><b>◇ DC-SIMU</b><small>/ PROJETO MOTOR 01</small><span className="lp-run"><i/>RUN</span></div>
    <div className="lp-win-tabs"><span className="on">Esquema</span><span>Ladder</span><span>Painel 3D</span><span>Monitor</span></div>
    <div className="lp-win-body">
      <div className="lp-pane lp-schem"><div className="lp-pane-h">CIRCUITO DE COMANDO<em>ESQUEMA · 01</em></div>
        <svg viewBox="0 0 400 230" aria-hidden="true"><defs><pattern id="lpg" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#c9d5ea"/></pattern></defs><rect width="400" height="230" fill="url(#lpg)"/>
          <g fill="none" stroke="#2655e5" strokeWidth="2" strokeLinejoin="round"><path d="M98 60 H140 V72 H170"/><path d="M226 72 H262 V56 H300"/><path d="M98 96 H124 V132 H170"/><path d="M226 132 H268 V150 H300"/><path d="M124 132 V196 H300"/></g>
          <path d="M300 56 V196" stroke="#16a34a" strokeWidth="2" fill="none"/>
          <g fill="#fff" stroke="#8fa3c7" strokeWidth="1.5"><rect x="26" y="40" width="72" height="72" rx="5"/><rect x="170" y="50" width="56" height="102" rx="5"/><rect x="300" y="34" width="76" height="180" rx="5"/></g>
          <g fill="#12214f" fontFamily="system-ui" fontWeight="700" fontSize="9"><text x="36" y="60">24V POWER</text><text x="180" y="68">KM1</text><text x="310" y="52">PLC · LOGO!</text></g>
          <g fill="#6a7fa6" fontFamily="system-ui" fontSize="8"><text x="36" y="100">DRAN120-24B</text><text x="180" y="92">A1</text><text x="180" y="136">A2</text><text x="310" y="90">I1 I2 I3 I4</text><text x="310" y="170">Q1 Q2 Q3 Q4</text></g>
          <g fill="#3c6ff0" stroke="#fff" strokeWidth="1.5"><circle cx="98" cy="60" r="4"/><circle cx="98" cy="96" r="4"/><circle cx="170" cy="72" r="4"/><circle cx="226" cy="72" r="4"/><circle cx="170" cy="132" r="4"/><circle cx="226" cy="132" r="4"/><circle cx="300" cy="56" r="4"/><circle cx="300" cy="150" r="4"/></g>
          <rect x="322" y="104" width="34" height="28" rx="3" fill="#12214f"/><text x="327" y="122" fontFamily="monospace" fontSize="9" fill="#5be08e">RUN</text>
        </svg></div>
      <div className="lp-side">
        <div className="lp-pane lp-ladder"><div className="lp-pane-h">LADDER<em>REDE 1</em></div>
          <svg viewBox="0 0 220 90" aria-hidden="true"><g stroke="#12214f" strokeWidth="2" fill="none"><path d="M10 8 V82"/><path d="M210 8 V82"/><path d="M10 26 H70 M92 26 H130 M152 26 H210"/><path d="M10 64 H70 M92 64 H130 M152 64 H210"/></g><g stroke="#2655e5" strokeWidth="2" fill="none"><path d="M70 16 V36 M92 16 V36"/><path d="M70 54 V74 M92 54 V74"/><circle cx="141" cy="26" r="10"/></g><path d="M10 26 H70 M92 26 H130" stroke="#16a34a" strokeWidth="2.5"/><g fontFamily="system-ui" fontSize="7" fill="#6a7fa6"><text x="66" y="12">I0.0</text><text x="66" y="50">Q0.0</text><text x="129" y="14">Q0.0</text></g></svg></div>
        <div className="lp-pane lp-p3d"><div className="lp-pane-h">PAINEL 3D</div>
          <svg viewBox="0 0 220 110" aria-hidden="true"><path d="M50 30 L110 12 L170 30 L170 86 L110 104 L50 86 Z" fill="#dbe4f4" stroke="#8fa3c7"/><path d="M50 30 L110 48 L170 30 M110 48 V104" fill="none" stroke="#8fa3c7"/><path d="M50 30 L110 48 V104 L50 86 Z" fill="#c4d2ec"/><g fill="#12214f"><rect x="66" y="46" width="14" height="9" transform="skewY(18)"/><rect x="86" y="52" width="14" height="9" transform="skewY(18)" fill="#2655e5"/></g><circle cx="140" cy="52" r="3" fill="#16a34a"/><rect x="128" y="62" width="30" height="16" fill="#12214f" transform="skewY(-18) translate(0 40)" opacity=".85"/></svg></div>
      </div>
    </div>
    <div className="lp-win-foot"><span><i/>SIMULAÇÃO ATIVA</span><span className="lp-mon">Monitor · I0.0 ▮ &nbsp; Q0.0 ▮ &nbsp; KM1 ▮</span><span>3 componentes · 5 ligações</span></div>
  </div>
}

function Landing({onRegister,onLogin}:{onRegister:()=>void;onLogin:()=>void}) {
  const items=[
    {k:'01 / LIGAR',t:'Monte o seu esquema',p:'Organize componentes, bornes e cabos num espaço de trabalho visual.',i:'⌁'},
    {k:'02 / PROGRAMAR',t:'Programe e simule',p:'Crie lógica Ladder e acompanhe o comportamento do PLC durante o scan.',i:'▤'},
    {k:'03 / PARTILHAR',t:'Trabalhe em conjunto',p:'Convide editores para o projeto e continue o trabalho em equipa.',i:'↗'}]
  return <div className="landing lp">
    <nav className="lp-nav"><div className="lp-nav-in"><strong className="lp-logo">◇ DC-SIMU</strong>
      <div className="lp-links"><a href="#funcionalidades">Funcionalidades</a><a href="#simulador">Simulador</a><a href="#recursos">Recursos</a><a href="#sobre">Sobre</a></div>
      <div className="lp-nav-cta"><button className="lp-ghost" onClick={onLogin}>Entrar</button><button className="lp-btn sm" onClick={onRegister}>Criar projeto grátis</button></div></div></nav>
    <section className="lp-hero"><div className="lp-hero-copy">
      <span className="lp-pill"><i/>O SEU LABORATÓRIO DE AUTOMAÇÃO</span>
      <h1>Projete o circuito.<br/><em>Veja-o ganhar vida.</em></h1>
      <p>Do primeiro fio ao scan do PLC: crie esquemas, programe em Ladder e visualize o seu painel em 3D. Tudo ligado, no mesmo projeto.</p>
      <div className="lp-actions"><button className="lp-btn" onClick={onRegister}>Criar projeto grátis <span aria-hidden>↗</span></button><button className="lp-outline" onClick={onLogin}>Entrar na minha conta <span aria-hidden>→</span></button></div>
      <ul className="lp-checks"><li>Esquema, Ladder e painel 3D sincronizados</li><li>Projetos partilhados com a equipa</li></ul></div>
      <div className="lp-hero-vis"><SimWindow/><div className="lp-chip c1">⚡ <div><b>Simulação em tempo real</b><small>Do borne à lógica do PLC</small></div></div><div className="lp-chip c2">▧ <div><b>Mais que um simulador.</b><small>Um ambiente completo.</small></div></div></div>
    </section>
    <div className="lp-views" id="recursos"><span>UM PROJETO, VÁRIAS VISTAS</span><b>Esquema elétrico</b><i/><b>Ladder</b><i/><b>GRAFCET</b><i/><b>Painel 3D</b><i/><b>Monitorização</b></div>
    <section className="lp-sec" id="funcionalidades"><div className="lp-head"><div><span className="lp-tag">PENSADO PARA QUEM CONSTRÓI</span><h2>Menos ferramentas separadas.<br/>Mais tempo a criar.</h2></div><p>Uma experiência de ponta a ponta para desenhar, testar e partilhar os seus sistemas de automação.</p></div>
      <div className="lp-feats">{items.map(f=><article key={f.k}><div className="lp-ic">{f.i}</div><span>{f.k}</span><h3>{f.t}</h3><p>{f.p}</p></article>)}</div></section>
    <section className="lp-sec lp-sim" id="simulador"><div className="lp-head"><div><span className="lp-tag">O SIMULADOR</span><h2>Esquema, Ladder e Painel 3D<br/>numa única área de trabalho.</h2></div><p>Componentes PLC, ligações elétricas e Monitor em tempo real, com o estado RUN sempre visível.</p></div><SimWindow full/></section>
    <section className="lp-end" id="sobre"><div><span className="lp-tag light">PRONTO PARA COMEÇAR?</span><h2>O próximo circuito começa aqui.</h2><p>Crie uma conta e transforme o seu projeto num sistema que pode ver funcionar.</p></div><button className="lp-btn light" onClick={onRegister}>Criar conta <span aria-hidden>↗</span></button></section>
    <footer className="lp-foot"><strong>◇ DC-SIMU</strong><span>Esquema. Lógica. Simulação.</span><small>© {new Date().getFullYear()} DC-SIMU</small></footer>
  </div>
}
