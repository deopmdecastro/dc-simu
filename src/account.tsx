import { useCallback, useEffect, useRef, useState } from 'react'
import App from './App'
import Logo from './ui/Brand'
import Landing from './landing/Landing'
import Dashboard, { type User, type Project, type Invite } from './dashboard/Dashboard'
import { useSimStore } from './store/useSimStore'

type Open = { id: string; name: string; revision: number }
type AdminUser = User & { projects: number }
type AdminProject = { id: string; name: string; owner: string; updated_at: string }

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

  const refresh = useCallback(async () => {
    const [p, i] = await Promise.all([api<Project[]>('/projects'), api<Invite[]>('/invitations')]); setProjects(p); setInvites(i)
  }, [])
  useEffect(() => { api<{user:User}>('/me').then(r => { setUser(r.user); setPage('dashboard'); refresh().catch(e => setMessage(e.message)) }).catch(() => {}).finally(() => setReady(true)) }, [refresh])
  // limpa a notificação automaticamente — feedback discreto, sem ruído permanente
  useEffect(() => { if (!message || page === 'login' || page === 'register') return; const t = setTimeout(() => setMessage(''), 5000); return () => clearTimeout(t) }, [message, page])

  const error = (e: unknown) => setMessage(e instanceof Error ? e.message : 'Falha inesperada')
  async function authenticate(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('')
    try { const r = await api<{user:User}>(page === 'register' ? '/register' : '/login','POST',form);setUser(r.user);setPage('dashboard');setForm({name:'',email:'',password:''});await refresh() } catch(e) {error(e)} finally {setBusy(false)}
  }
  async function create(name: string) {
    useSimStore.getState().newProject()
    const r=await api<Open>('/projects','POST',{name,content:JSON.parse(useSimStore.getState().saveJSON())})
    await load(r.id)
  }
  async function load(id: string) {
    setMessage('')
    try { const r=await api<Open & {content: unknown}>('/projects/'+id);useSimStore.getState().stop();useSimStore.getState().loadJSON(JSON.stringify(r.content));useSimStore.getState().setCurrentProjectName(r.name); const entry={id:r.id,name:r.name,revision:r.revision};openRef.current=entry;setOpen(entry);setPage('editor') }catch(e){error(e)}
  }
  async function save() {
    const entry=openRef.current;if(!entry)return
    try {const r=await api<{revision:number}>('/projects/'+entry.id,'PUT',{revision:entry.revision,content:JSON.parse(useSimStore.getState().saveJSON())});const updated={...entry,revision:r.revision};openRef.current=updated;setOpen(updated);useSimStore.setState({dirty:false});setMessage('Projeto guardado.') }catch(e){error(e)}
  }
  async function leave() {
    if(useSimStore.getState().dirty && !confirm('Existem alterações não guardadas. Voltar aos projetos?'))return
    useSimStore.getState().stop();openRef.current=null;setOpen(null);setPage('dashboard');setMessage('');refresh().catch(error)
  }
  async function invite(id:string,email:string) {
    await api(`/projects/${id}/invitations`,'POST',{email})
    setMessage('Convite enviado dentro da aplicação.')
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
  const fetchMembers = useCallback(async (id: string) => (await api<{members:{name:string;email:string}[]}>('/projects/'+id+'/members')).members, [])

  useEffect(() => {
    if(page!=='editor')return
    const handle=(e:KeyboardEvent)=>{if(e.ctrlKey && e.key.toLowerCase()==='s'){e.preventDefault();void save()}}
    window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle)
  },[page])

  if (!ready) return <div className="dx" style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'var(--dx-bg)'}}><div style={{textAlign:'center',display:'grid',gap:12,justifyItems:'center'}}><Logo size={34}/><span style={{fontSize:13,color:'var(--dx-ink-3)'}}>A preparar o seu espaço de trabalho…</span></div></div>

  if (page==='editor' && open) return <>
    <div className="account-bar dx">
      <Logo size={20} tone="dark" tagline={false}/>
      <span className="dx-bar-sep">/</span>
      <span className="dx-bar-name">{open.name}</span>
      <span className="dx-bar-sep">·</span>
      <span style={{color:'#7d8daa'}}>{user?.name}</span>
      {message && <span className="dx-bar-msg">{message}</span>}
      <div style={{marginLeft: message ? 12 : 'auto', display:'flex', gap:8}}>
        <button onClick={()=>void leave()}>← Projetos</button>
        <button className="dx-bar-primary" onClick={()=>void save()} title="Guardar (Ctrl+S)">Guardar</button>
      </div>
    </div>
    <div style={{height:'calc(100vh - 42px)'}}><App onBack={()=>void leave()} onSave={()=>void save()}/></div>
  </>

  if (page==='landing') return <Landing onRegister={()=>{setMessage('');setPage('register')}} onLogin={()=>{setMessage('');setPage('login')}}/>

  return <main className="account-shell dx">
    {page!=='login' && page!=='register' && <header className="dx-topbar">
      <Logo size={28}/>
      <div className="dx-topbar-right">
        {user && <>
          <span className="dx-chip">{user.role==='admin'?'Administrador':'Conta'}</span>
          {user.role==='admin' && page!=='admin' && <button className="dx-btn dx-btn-ghost dx-btn-sm" onClick={()=>setPage('admin')}>Administração</button>}
          {page==='admin' && <button className="dx-btn dx-btn-ghost dx-btn-sm" onClick={()=>setPage('dashboard')}>← Projetos</button>}
          <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={()=>void logout()}>Sair</button>
          <span className="dx-avatar" title={user.email}>{user.name.charAt(0).toUpperCase()}</span>
        </>}
      </div>
    </header>}
    {(page==='login'||page==='register')&&<AuthScreen mode={page} form={form} setForm={setForm} busy={busy} message={message} clearMessage={()=>setMessage('')} onSubmit={authenticate} onSwitch={()=>{setMessage('');setPage(page==='register'?'login':'register')}} onHome={()=>{setMessage('');setPage('landing')}}/>}
    {page==='admin'&&user?.role==='admin'&&<AdminPanel onBack={()=>setPage('dashboard')}/>}
    {page==='dashboard'&&<Dashboard user={user} projects={projects} invites={invites} onCreate={create} onOpen={load} onInvite={invite} onReply={reply} onDelete={remove} fetchMembers={fetchMembers}/>}
    {message && page!=='login' && page!=='register' && <div className="dx-toast" role="status">{message}<button onClick={()=>setMessage('')} aria-label="Fechar">×</button></div>}
  </main>
}

function AuthScreen({mode,form,setForm,busy,message,clearMessage,onSubmit,onSwitch,onHome}:{mode:'login'|'register';form:{name:string;email:string;password:string};setForm:(f:{name:string;email:string;password:string})=>void;busy:boolean;message:string;clearMessage:()=>void;onSubmit:(e:React.FormEvent)=>void;onSwitch:()=>void;onHome:()=>void}) {
  const [show,setShow]=useState(false)
  const reg=mode==='register'
  const canFocus=typeof window!=='undefined'&&window.matchMedia('(hover:hover)').matches
  const len=form.password.length
  const strength=len===0?0:len<10?1:len<14?2:3
  const labels=['','Curta — mínimo 10 caracteres','Boa','Forte']
  return <div className="auth">
    <aside className="auth-side"><button className="auth-logo" onClick={onHome} aria-label="Voltar ao início"><Logo tone="dark"/></button>
      <div className="auth-pitch"><h2>{reg?<>O próximo circuito<br/>começa aqui.</>:<>Projete o circuito.<br/>Veja-o ganhar vida.</>}</h2>
        <p>{reg?'Crie uma conta e transforme o seu projeto num sistema que pode ver funcionar.':'Retome o esquema, a lógica Ladder e o painel 3D exatamente onde os deixou.'}</p>
        <ul><li><i>⌁</i>Esquema elétrico com bornes e cabos</li><li><i>▤</i>Ladder com simulação do scan do PLC</li><li><i>▧</i>Painel 3D sincronizado com o projeto</li><li><i>↗</i>Projetos partilhados com a equipa</li></ul></div>
      <div className="auth-status"><span><i/>RUN</span>Os seus projetos ficam guardados no servidor.</div></aside>
    <section className="auth-main"><div className="auth-panel">
      <div className="auth-mobile-logo"><button className="auth-mlogo" onClick={onHome} aria-label="Voltar ao início"><Logo/></button><button className="auth-mback" onClick={onHome}>← Início</button></div>
      <button className="auth-back" onClick={onHome}>← Voltar ao início</button>
      <span className="lp-tag">A SUA ÁREA DE TRABALHO</span>
      <h1>{reg?'Criar conta':'Bem-vindo de volta'}</h1>
      <p className="auth-sub">{reg?'Gratuito. Comece o primeiro projeto em menos de um minuto.':'Entre para continuar os seus projetos.'}</p>
      {message&&<div className="auth-error" role="alert"><span>{message}</span><button onClick={clearMessage} aria-label="Fechar aviso">×</button></div>}
      <form onSubmit={onSubmit} noValidate={false}>
        {reg&&<label>Nome<input required minLength={2} autoFocus={canFocus} autoComplete="name" placeholder="O seu nome" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>}
        <label>Email<input required type="email" autoFocus={canFocus&&!reg} autoComplete="email" placeholder="nome@empresa.com" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
        <label>Palavra-passe<div className="auth-pw"><input required minLength={reg?10:1} type={show?'text':'password'} autoComplete={reg?'new-password':'current-password'} placeholder={reg?'Mínimo 10 caracteres':'A sua palavra-passe'} value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/><button type="button" onClick={()=>setShow(!show)} aria-pressed={show}>{show?'Ocultar':'Mostrar'}</button></div></label>
        {reg&&<div className="auth-meter" aria-live="polite"><div className={'s'+strength}><i/><i/><i/></div><small>{labels[strength]||'Use pelo menos 10 caracteres'}</small></div>}
        <button className="lp-btn auth-submit" disabled={busy}>{busy?'Aguarde…':reg?'Criar conta':'Entrar'} {!busy&&<span aria-hidden>→</span>}</button>
      </form>
      <p className="auth-switch">{reg?'Já tem conta?':'Ainda não tem conta?'} <button onClick={onSwitch}>{reg?'Entrar':'Criar conta grátis'}</button></p>
    </div></section>
  </div>
}


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
