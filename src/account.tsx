import { useCallback, useEffect, useRef, useState } from 'react'
import App from './App'
import { useSimStore } from './store/useSimStore'

type User = { id: string; name: string; email: string }
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
  const [page, setPage] = useState<'landing' | 'login' | 'register' | 'dashboard' | 'editor'>('landing')
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
    <header className="account-header"><b>◈ DC-SIMU</b><nav>{user ? <><span>{user.name}</span><button onClick={()=>void logout()}>Sair</button></> : <><button onClick={()=>setPage('login')}>Entrar</button><button className="account-primary" onClick={()=>setPage('register')}>Criar conta</button></>}</nav></header>
    {message && <div className="account-alert" role="alert">{message}<button onClick={()=>setMessage('')}>×</button></div>}
    {page==='landing' && <section className="account-hero"><div className="account-pill">DESENHE · PROGRAME · SIMULE</div><h1>Da ideia ao painel.<br/><em>Num só espaço.</em></h1><p>Crie esquemas elétricos, programe em Ladder, visualize o painel em 3D e partilhe projetos com a sua equipa.</p><button className="account-primary" onClick={()=>setPage('register')}>Começar gratuitamente →</button><button onClick={()=>setPage('login')}>Já tenho conta</button><div className="account-features"><article><strong>01 / ESQUEMA</strong><h3>Desenhe ligações reais</h3><p>Componentes, bornes, cabos e simulação elétrica.</p></article><article><strong>02 / LÓGICA</strong><h3>Do Ladder à execução</h3><p>Programe PLCs e acompanhe o scan em tempo real.</p></article><article><strong>03 / EQUIPA</strong><h3>Colabore num projeto</h3><p>Convide editores por email e trabalhe no mesmo projeto.</p></article></div></section>}
    {(page==='login'||page==='register')&&<section className="account-card"><span className="account-pill">A SUA ÁREA DE TRABALHO</span><h1>{page==='register'?'Criar conta':'Bem-vindo de volta'}</h1><p>Os seus projetos ficam guardados no servidor.</p><form onSubmit={authenticate}>{page==='register'&&<label>Nome<input required minLength={2} autoComplete="name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>}<label>Email<input required type="email" autoComplete="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Palavra-passe<input required minLength={page==='register'?10:1} type="password" autoComplete={page==='register'?'new-password':'current-password'} value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label><button className="account-primary" disabled={busy}>{busy?'Aguarde…':page==='register'?'Criar conta':'Entrar'}</button></form><p>{page==='register'?'Já tem conta?':'Ainda não tem conta?'} <button onClick={()=>{setMessage('');setPage(page==='register'?'login':'register')}}>{page==='register'?'Entrar':'Registar'}</button></p></section>}
    {page==='dashboard'&&<section className="account-dashboard"><span className="account-pill">ÁREA DE PROJETOS</span><h1>Os seus projetos<span>.</span></h1><p>Olá, {user?.name}. Continue um projeto ou comece algo novo.</p><button className="account-primary" onClick={()=>void create()}>＋ Novo projeto</button>{invites.length>0&&<div className="account-invites"><h2>Convites pendentes</h2>{invites.map(i=><div key={i.id}><b>{i.project}</b> · convite de {i.sender} <button onClick={()=>void reply(i.id,'accept')}>Aceitar</button><button onClick={()=>void reply(i.id,'reject')}>Recusar</button></div>)}</div>}<div className="account-grid">{projects.map(p=><article key={p.id}><span className="account-pill">{p.role==='owner'?'PROPRIETÁRIO':'EDITOR'}</span><h2>{p.name}</h2><p>Por {p.owner} · {new Date(p.updated_at).toLocaleDateString('pt-PT')}</p><div><button className="account-primary" onClick={()=>void load(p.id)}>Abrir →</button>{p.role==='owner'&&<><button onClick={()=>void invite(p.id)}>Convidar</button><button onClick={()=>setInviteFor(inviteFor===p.id?null:p.id)}>Membros</button><button onClick={()=>void remove(p)}>Eliminar</button></>}</div>{inviteFor===p.id&&<Members id={p.id}/>}</article>)}{!projects.length&&<div className="account-empty">Ainda não há projetos. Crie o primeiro para começar.</div>}</div></section>}
  </main>
}
function Members({id}:{id:string}) {const [members,setMembers]=useState<{name:string;email:string}[]>([]);useEffect(()=>{api<{members:{name:string;email:string}[]}>('/projects/'+id+'/members').then(r=>setMembers(r.members)).catch(()=>{})},[id]);return <small>Editores: {members.length?members.map(m=>`${m.name} (${m.email})`).join(', '):'nenhum'}</small>}
