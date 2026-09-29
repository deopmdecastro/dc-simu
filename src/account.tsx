import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import App from './App'
import { useSimStore } from './store/useSimStore'

/** Vitrine 3D carregada em lazy — o bundle three/GLB só entra quando é visível. */
const LandingShowcase = lazy(() => import('./three/LandingShowcase'))

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
  const refresh = useCallback(async () => {
    const [p, i] = await Promise.all([api<Project[]>('/projects'), api<Invite[]>('/invitations')]); setProjects(p); setInvites(i)
  }, [])
  useEffect(() => { api<{user:User}>('/me').then(r => { setUser(r.user); setPage('dashboard'); refresh().catch(e => setMessage(e.message)) }).catch(() => {}).finally(() => setReady(true)) }, [refresh])
  const error = (e: unknown) => setMessage(e instanceof Error ? e.message : 'Falha inesperada')
  async function authenticate(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);setMessage('')
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
    try {const r=await api<{revision:number}>('/projects/'+entry.id,'PUT',{revision:entry.revision,content:JSON.parse(useSimStore.getState().saveJSON())});const updated={...entry,revision:r.revision};openRef.current=updated;setOpen(updated);useSimStore.setState({dirty:false});setMessage('Projeto guardado na conta.') }catch(e){error(e)}
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
  useEffect(() => {
    if(page!=='editor')return
    const handle=(e:KeyboardEvent)=>{if(e.ctrlKey && e.key.toLowerCase()==='s'){e.preventDefault();void save()}}
    window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle)
  },[page])
  // a mensagem de sucesso desaparece sozinha — feedback discreto, sem fricção
  useEffect(() => {
    if(!message||page==='login'||page==='register')return
    const t=setTimeout(()=>setMessage(''),5000);return()=>clearTimeout(t)
  },[message,page])

  if (!ready) return (
    <div className="dc-boot">
      <span>DC·SIMU — a iniciar ambiente</span>
      <span className="dc-boot-bar"><i /></span>
    </div>
  )

  if (page === 'editor' && open) return (
    <>
      <div className="account-bar">
        <Logo dark size={22} />
        <span className="account-bar-crumb"><span>/</span><b>{open.name}</b></span>
        {message && <span className="account-bar-msg">{message}</span>}
        <span className="account-bar-actions">
          <button onClick={() => void leave()} title="Voltar ao espaço de trabalho">← Projetos</button>
          <button className="primary" onClick={() => void save()} title="Guardar no servidor (Ctrl+S)">Guardar</button>
        </span>
      </div>
      <div style={{ height: 'calc(100vh - 40px)' }}>
        <App onBack={() => void leave()} onSave={() => void save()} />
      </div>
    </>
  )

  return <main className="account-shell">
    {message && page !== 'login' && page !== 'register' && (
      <div className="account-alert" role="status">{message}<button onClick={() => setMessage('')} aria-label="Fechar mensagem">×</button></div>
    )}
    {page==='landing' && <Landing onRegister={()=>setPage('register')} onLogin={()=>setPage('login')}/>}
    {(page==='login'||page==='register')&&<AuthScreen mode={page} form={form} setForm={setForm} busy={busy} message={message} clearMessage={()=>setMessage('')} onSubmit={authenticate} onSwitch={()=>{setMessage('');setPage(page==='register'?'login':'register')}} onHome={()=>{setMessage('');setPage('landing')}}/>}
    {page==='admin'&&user?.role==='admin'&&<AdminPanel user={user} onBack={()=>setPage('dashboard')} onLogout={()=>void logout()}/>}
    {page==='dashboard'&&<Dashboard user={user} projects={projects} invites={invites} onCreate={create} onOpen={load} onInvite={invite} onReply={reply} onDelete={remove} onLogout={()=>void logout()} onAdmin={()=>setPage('admin')}/>}
  </main>
}

/* ------------------------------------------------------------------ marca */
function Logo({dark,size=30}:{dark?:boolean;size?:number}) {
  return <span className={'dc-logo'+(dark?' dark':'')}>
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="8" fill={dark ? '#101823' : '#0e1620'} />
      <rect x="1.5" y="1.5" width="29" height="29" rx="7.5" fill="none" stroke="#2f6bff" strokeOpacity=".55" />
      <path d="M8 10h5.2M8 16h5.2M8 22h5.2" stroke="#3c4d61" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M19.4 6.5 12.6 17.2h4.1l-1.6 8.3 7-11h-4.2z" fill="#2f6bff" />
      <circle cx="24.5" cy="9" r="1.6" fill="#ffab2e" />
    </svg>
    <span className="dc-logo-t"><b>DC<i>·</i>SIMU</b><small>electrical panels</small></span>
  </span>
}

/* --------------------------------------------------------- autenticação */
function AuthScreen({mode,form,setForm,busy,message,clearMessage,onSubmit,onSwitch,onHome}:{mode:'login'|'register';form:{name:string;email:string;password:string};setForm:(f:{name:string;email:string;password:string})=>void;busy:boolean;message:string;clearMessage:()=>void;onSubmit:(e:React.FormEvent)=>void;onSwitch:()=>void;onHome:()=>void}) {
  const [show,setShow]=useState(false)
  const reg=mode==='register'
  const canFocus=typeof window!=='undefined'&&window.matchMedia('(hover:hover)').matches
  const len=form.password.length
  const strength=len===0?0:len<10?1:len<14?2:3
  const labels=['','Curta — mínimo 10 caracteres','Boa','Forte']
  return <div className="auth">
    <aside className="auth-side">
      <button className="auth-logo" onClick={onHome} aria-label="Voltar ao início"><Logo dark/></button>
      <div className="auth-pitch">
        <h2>{reg?<>O próximo quadro<br/>começa aqui.</>:<>Projete o quadro.<br/>Veja-o ganhar vida.</>}</h2>
        <p>{reg?'Crie uma conta e monte o seu primeiro quadro elétrico em 3D em menos de um minuto.':'Retome o esquema, a lógica Ladder e o painel 3D exatamente onde os deixou.'}</p>
        <ul>
          <li><i>⌁</i>Esquema elétrico com bornes e cabos reais</li>
          <li><i>▤</i>Ladder com simulação do scan do PLC</li>
          <li><i>▧</i>Painel 3D sincronizado com o projeto</li>
          <li><i>↗</i>Projetos partilhados com a equipa</li>
        </ul>
      </div>
      <div className="auth-status"><span className="dc-state run"><i/>RUN</span> Os seus projetos ficam guardados no servidor.</div>
    </aside>
    <section className="auth-main"><div className="auth-panel">
      <div className="auth-mobile-logo"><button className="auth-mlogo" onClick={onHome} aria-label="Voltar ao início"><Logo/></button><button className="auth-mback" onClick={onHome}>← Início</button></div>
      <button className="auth-back" onClick={onHome}>← Voltar ao início</button>
      <span className="dc-label accent">A sua área de trabalho</span>
      <h1>{reg?'Criar conta':'Bem-vindo de volta'}</h1>
      <p className="auth-sub">{reg?'Gratuito. Comece o primeiro projeto em menos de um minuto.':'Entre para continuar os seus projetos.'}</p>
      {message&&<div className="auth-error" role="alert"><span>{message}</span><button onClick={clearMessage} aria-label="Fechar aviso">×</button></div>}
      <form onSubmit={onSubmit} noValidate={false}>
        {reg&&<label>Nome<input required minLength={2} autoFocus={canFocus} autoComplete="name" placeholder="O seu nome" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>}
        <label>Email<input required type="email" autoFocus={canFocus&&!reg} autoComplete="email" placeholder="nome@empresa.com" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
        <label>Palavra-passe<div className="auth-pw"><input required minLength={reg?10:1} type={show?'text':'password'} autoComplete={reg?'new-password':'current-password'} placeholder={reg?'Mínimo 10 caracteres':'A sua palavra-passe'} value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/><button type="button" onClick={()=>setShow(!show)} aria-pressed={show}>{show?'Ocultar':'Mostrar'}</button></div></label>
        {reg&&<div className="auth-meter" aria-live="polite"><div className={'s'+strength}><i/><i/><i/></div><small>{labels[strength]||'Use pelo menos 10 caracteres'}</small></div>}
        <button className="dc-a dc-a-primary lg block" disabled={busy}>{busy?'Aguarde…':reg?'Criar conta':'Entrar'} {!busy&&<span className="dc-arrow" aria-hidden>→</span>}</button>
      </form>
      <p className="auth-switch">{reg?'Já tem conta?':'Ainda não tem conta?'} <button onClick={onSwitch}>{reg?'Entrar':'Criar conta grátis'}</button></p>
    </div></section>
  </div>
}

/* ------------------------------------------------- pré-visualização card */
function ProjectArtwork({variant=0}:{variant?:number}) {
  return <svg className="pd-art" viewBox="0 0 360 135" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><pattern id={`pd-grid-${variant}`} width="18" height="18" patternUnits="userSpaceOnUse"><path d="M18 0H0V18" fill="none" stroke="#d6deea" strokeWidth="1"/></pattern></defs>
    <rect width="360" height="135" fill={variant%2?'#eef1f6':'#f1f4f8'}/><rect width="360" height="135" fill={`url(#pd-grid-${variant})`}/>
    <g fill="none" stroke="#9aaec9" strokeWidth="1.6"><path d="M42 66H108V46H155"/><path d="M207 46H251V74H309"/><path d="M108 66V106H155"/><path d="M207 106H251V74"/></g>
    <g fill="#fff" stroke="#8d9fba" strokeWidth="1.3"><rect x="30" y="40" width="55" height="51" rx="4"/><rect x="155" y="27" width="52" height="96" rx="4"/><rect x="309" y="48" width="43" height="52" rx="4"/></g>
    <g fill="#e3e9f2"><rect x="37" y="47" width="41" height="13" rx="2"/><rect x="162" y="34" width="38" height="14" rx="2"/><rect x="316" y="55" width="29" height="11" rx="2"/></g>
    <g fontSize="6" fontFamily="monospace" fontWeight="bold" fill="#3b4757"><text x="41" y="56">24V DC</text><text x="169" y="44">PLC</text><text x="318" y="63">KM1</text></g>
    <rect x="164" y="56" width="34" height="20" rx="2" fill="#0e1620"/><text x="170" y="70" fontSize="7" fontFamily="monospace" fill="#21c47b">RUN</text>
    <g fill="#2f6bff" stroke="white" strokeWidth="1.2"><circle cx="85" cy="66" r="3.2"/><circle cx="155" cy="46" r="3.2"/><circle cx="155" cy="106" r="3.2"/><circle cx="207" cy="46" r="3.2"/><circle cx="207" cy="106" r="3.2"/><circle cx="309" cy="74" r="3.2"/></g>
  </svg>
}

function Members({id}:{id:string}) {
  const [members,setMembers]=useState<{name:string;email:string}[]>([])
  const [error,setError]=useState('')
  useEffect(()=>{api<{members:{name:string;email:string}[]}>('/projects/'+id+'/members').then(r=>setMembers(r.members)).catch(e=>setError(e instanceof Error?e.message:'Erro ao carregar'))},[id])
  return <div className="pd-members">{error|| (members.length ? members.map(m=><div key={m.email}><span className="pd-avatar">{m.name.charAt(0).toUpperCase()}</span><span><b>{m.name}</b><small>{m.email}</small></span></div>) : 'Ainda não há editores neste projeto.')}</div>
}

function greeting() {
  const h = new Date().getHours()
  return h < 6 ? 'Boa madrugada' : h < 13 ? 'Bom dia' : h < 20 ? 'Boa tarde' : 'Boa noite'
}

/* -------------------------------------------------------------- dashboard */
function Dashboard({user,projects,invites,onCreate,onOpen,onInvite,onReply,onDelete,onLogout,onAdmin}:{user:User|null;projects:Project[];invites:Invite[];onCreate:(name:string)=>Promise<void>;onOpen:(id:string)=>Promise<void>;onInvite:(id:string,email:string)=>Promise<void>;onReply:(id:string,action:'accept'|'reject')=>Promise<void>;onDelete:(p:Project)=>Promise<void>;onLogout:()=>void;onAdmin:()=>void}) {
  const [query,setQuery]=useState('')
  const [filter,setFilter]=useState<'all'|'owner'|'editor'>('all')
  const [modal,setModal]=useState<{type:'create'|'invite';project?:Project}|null>(null)
  const [value,setValue]=useState('')
  const [saving,setSaving]=useState(false)
  const [notice,setNotice]=useState('')
  const [expanded,setExpanded]=useState<string|null>(null)
  const [menu,setMenu]=useState<string|null>(null)
  const [opening,setOpening]=useState<string|null>(null)
  const visible=projects.filter(p=>(filter==='all'||p.role===filter)&&p.name.toLocaleLowerCase('pt-PT').includes(query.trim().toLocaleLowerCase('pt-PT')))
  const owned=projects.filter(p=>p.role==='owner').length
  const openModal=(type:'create'|'invite',project?:Project)=>{setModal({type,project});setValue('');setNotice('');setMenu(null)}
  async function submit(e:React.FormEvent) {
    e.preventDefault();const text=value.trim();if(!text||saving)return
    setSaving(true);setNotice('')
    try {if(modal?.type==='create')await onCreate(text);else if(modal?.project)await onInvite(modal.project.id,text);setModal(null);setValue('')}
    catch(e){setNotice(e instanceof Error?e.message:'Não foi possível concluir a operação.')}
    finally{setSaving(false)}
  }
  async function openProject(id:string){setOpening(id);try{await onOpen(id)}finally{setOpening(null)}}
  useEffect(()=>{if(!modal)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!saving)setModal(null)};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[modal,saving])
  useEffect(()=>{if(!menu)return;const c=()=>setMenu(null);window.addEventListener('click',c);return()=>window.removeEventListener('click',c)},[menu])

  return <section className="pd-page">
    <header className="pd-topbar"><div className="pd-topbar-in">
      <Logo size={30}/>
      <nav>
        {user?.role==='admin'&&<button className="dc-a dc-a-ghost sm" onClick={onAdmin}>Administração</button>}
        <span className="pd-user"><span className="pd-avatar">{(user?.name??'?').charAt(0).toUpperCase()}</span>{user?.name}</span>
        <button className="dc-a dc-a-outline sm" onClick={onLogout}>Sair</button>
      </nav>
    </div></header>

    <div className="pd-inner">
      <div className="pd-hero">
        <div>
          <span className="dc-label">Espaço de trabalho / Projetos</span>
          <h1>{greeting()}, {(user?.name??'').split(' ')[0]}.</h1>
          <p>Continue de onde ficou ou comece um novo quadro elétrico em 3D.</p>
        </div>
        <button className="dc-a dc-a-primary lg" onClick={()=>openModal('create')}><span aria-hidden>＋</span> Novo projeto</button>
      </div>

      <div className="pd-summary" aria-label="Resumo dos projetos">
        <div><span className="pd-summary-icon">▦</span><span><strong>{projects.length}</strong><small>Projetos acessíveis</small></span></div>
        <div><span className="pd-summary-icon">◇</span><span><strong>{owned}</strong><small>Da sua autoria</small></span></div>
        <div><span className="pd-summary-icon">↗</span><span><strong>{projects.length-owned}</strong><small>Partilhados consigo</small></span></div>
        <div><span className="pd-summary-icon">✉</span><span><strong>{invites.length}</strong><small>Convites pendentes</small></span></div>
      </div>

      {invites.length>0&&<div className="pd-invites">
        <div className="pd-invite-heading"><span aria-hidden>✉</span><div><b>Convites para colaborar</b><small>Outros utilizadores querem trabalhar consigo.</small></div></div>
        {invites.map(i=><div className="pd-invite-row" key={i.id}>
          <div><b>{i.project}</b><span>Convite de {i.sender}</span></div>
          <div><button className="dc-a dc-a-ghost sm" onClick={()=>void onReply(i.id,'reject')}>Recusar</button><button className="dc-a dc-a-primary sm" onClick={()=>void onReply(i.id,'accept')}>Aceitar <span className="dc-arrow" aria-hidden>→</span></button></div>
        </div>)}
      </div>}

      <div className="pd-section-head"><h2>Os seus projetos</h2><span>{projects.length.toString().padStart(2,'0')}</span></div>

      <div className="pd-toolbar">
        <div className="pd-tabs" role="group" aria-label="Filtrar projetos">
          {([['all','Todos'],['owner','Os meus'],['editor','Partilhados']] as const).map(([key,label])=>
            <button key={key} className={filter===key?'selected':''} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</button>)}
        </div>
        <label className="pd-search"><span aria-hidden>⌕</span><span className="sr-only">Pesquisar projetos</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pesquisar projeto…" type="search"/></label>
      </div>

      <div className="pd-grid">
        {visible.map((p,index)=><article className="pd-card" key={p.id}>
          <div className="pd-card-art"><ProjectArtwork variant={index}/><span className="pd-card-kind">{p.role==='owner'?'◇ Meu projeto':'↗ Partilhado'}</span></div>
          <div className="pd-card-body">
            <div className="pd-card-top">
              <span className="pd-role">{p.role==='owner'?'PROPRIETÁRIO':'EDITOR'}</span>
              {p.role==='owner'&&<div className="pd-menu-wrap" onClick={e=>e.stopPropagation()}>
                <button className="pd-more" title={`Opções de ${p.name}`} aria-label={`Opções de ${p.name}`} aria-expanded={menu===p.id} onClick={()=>setMenu(menu===p.id?null:p.id)}>···</button>
                {menu===p.id&&<div className="pd-menu" role="menu">
                  <button role="menuitem" onClick={()=>openModal('invite',p)}>↗ Convidar editor</button>
                  <button role="menuitem" onClick={()=>{setExpanded(expanded===p.id?null:p.id);setMenu(null)}}>♙ Ver membros</button>
                  <button role="menuitem" className="danger" onClick={()=>{setMenu(null);void onDelete(p)}}>✕ Eliminar projeto</button>
                </div>}
              </div>}
            </div>
            <h3>{p.name}</h3>
            <div className="pd-card-meta"><span>por {p.owner}</span><span>·</span><span>Atualizado em {new Date(p.updated_at).toLocaleDateString('pt-PT')}</span></div>
            <div className="pd-card-actions">
              <button className="dc-a dc-a-primary sm" disabled={opening===p.id} onClick={()=>void openProject(p.id)}>{opening===p.id?'A abrir…':'Abrir projeto'} {opening!==p.id&&<span className="dc-arrow" aria-hidden>↗</span>}</button>
              {p.role==='owner'&&<button className="dc-a dc-a-outline sm" onClick={()=>openModal('invite',p)} title="Convidar editor" aria-label={`Convidar editor para ${p.name}`}>↗</button>}
            </div>
            {expanded===p.id&&<Members id={p.id}/>}
          </div>
        </article>)}

        {projects.length>0&&visible.length===0&&<div className="pd-empty">
          <div className="pd-empty-icon">⌕</div><h3>Nenhum projeto encontrado</h3>
          <p>Experimente outro termo de pesquisa ou escolha um filtro diferente.</p>
          <button className="dc-a dc-a-outline" onClick={()=>{setQuery('');setFilter('all')}}>Limpar filtros</button>
        </div>}

        {projects.length===0&&<div className="pd-empty">
          <div className="pd-empty-icon">▦</div><h3>Ainda não tem projetos.</h3>
          <p>Comece o seu primeiro quadro elétrico em 3D — escolha os componentes, ligue-os e simule.</p>
          <button className="dc-a dc-a-primary lg" onClick={()=>openModal('create')}><span aria-hidden>＋</span> Criar projeto</button>
        </div>}
      </div>

      <div className="pd-footnote">DC·SIMU — esquema, lógica e simulação no mesmo lugar.</div>
    </div>

    {modal&&<div className="pd-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setModal(null)}}>
      <div className="pd-dialog" role="dialog" aria-modal="true" aria-labelledby="pd-dialog-title">
        <button className="pd-dialog-close" aria-label="Fechar" onClick={()=>setModal(null)} disabled={saving}>×</button>
        <div className="pd-dialog-icon">{modal.type==='create'?'▦':'↗'}</div>
        <h2 id="pd-dialog-title">{modal.type==='create'?'Criar novo projeto':'Convidar editor'}</h2>
        <p>{modal.type==='create'?'Dê um nome ao projeto. Poderá montar o quadro assim que o criar.':<>Convide um utilizador já registado para editar <strong>{modal.project?.name}</strong>.</>}</p>
        <form onSubmit={e=>void submit(e)}>
          <label>{modal.type==='create'?'Nome do projeto':'Email do utilizador'}
            <input autoFocus required maxLength={modal.type==='create'?120:254} type={modal.type==='invite'?'email':'text'} value={value} placeholder={modal.type==='create'?'Ex.: Quadro de comando — Linha A':'nome@empresa.com'} onChange={e=>setValue(e.target.value)}/>
          </label>
          {modal.type==='invite'&&<small>O convite aparece no painel da pessoa convidada. Não enviamos email.</small>}
          {notice&&<div className="pd-dialog-error" role="alert">{notice}</div>}
          <div className="pd-dialog-actions">
            <button type="button" className="dc-a dc-a-ghost" disabled={saving} onClick={()=>setModal(null)}>Cancelar</button>
            <button type="submit" className="dc-a dc-a-primary" disabled={!value.trim()||saving}>{saving?'Aguarde…':modal.type==='create'?'Criar projeto':'Enviar convite'}</button>
          </div>
        </form>
      </div>
    </div>}
  </section>
}

/* ----------------------------------------------------------- administração */
type AdminUser = User & { projects: number }
type AdminProject = { id: string; name: string; owner: string; updated_at: string }
function AdminPanel({user,onBack,onLogout}:{user:User;onBack:()=>void;onLogout:()=>void}) {
  const [users,setUsers]=useState<AdminUser[]>([])
  const [projects,setProjects]=useState<AdminProject[]>([])
  const [error,setError]=useState('')
  const reload=useCallback(async()=>{try{const [u,p]=await Promise.all([api<AdminUser[]>('/admin/users'),api<AdminProject[]>('/admin/projects')]);setUsers(u);setProjects(p);setError('')}catch(e){setError(e instanceof Error?e.message:'Falha na administração')}},[])
  useEffect(()=>{void reload()},[reload])
  async function remove(type:'users'|'projects',id:string,label:string){
    if(!confirm(`Eliminar permanentemente ${label}? Esta ação não pode ser anulada.`))return
    try{await api(`/admin/${type}/${id}`,'DELETE');await reload()}catch(e){setError(e instanceof Error?e.message:'Falha ao eliminar')}
  }
  return <section className="pd-page">
    <header className="pd-topbar"><div className="pd-topbar-in">
      <Logo size={30}/>
      <nav>
        <span className="pd-user"><span className="pd-avatar">{user.name.charAt(0).toUpperCase()}</span>{user.name}</span>
        <button className="dc-a dc-a-outline sm" onClick={onLogout}>Sair</button>
      </nav>
    </div></header>
    <div className="pd-inner">
      <div className="pd-hero">
        <div>
          <span className="dc-label accent">Acesso restrito</span>
          <h1>Administração.</h1>
          <p>Gestão global de contas e projetos. Eliminar uma conta remove também os projetos de que é proprietária.</p>
        </div>
        <button className="dc-a dc-a-outline" onClick={onBack}>← Projetos</button>
      </div>
      {error&&<div className="pd-dialog-error" role="alert" style={{marginBottom:16}}>{error}</div>}
      <div className="pd-section-head"><h2>Utilizadores</h2><span>{users.length}</span></div>
      <div className="pd-admin-table">{users.map(u=><div key={u.id}><span><strong>{u.name}</strong> · {u.email} · {u.role} · {u.projects} projeto(s)</span>{u.role!=='admin'&&<button className="dc-a dc-a-danger sm" onClick={()=>void remove('users',u.id,`a conta ${u.email} e os seus projetos`)}>Eliminar conta</button>}</div>)}</div>
      <div className="pd-section-head" style={{marginTop:32}}><h2>Projetos</h2><span>{projects.length}</span></div>
      <div className="pd-admin-table">{projects.map(p=><div key={p.id}><span><strong>{p.name}</strong> · {p.owner}</span><button className="dc-a dc-a-danger sm" onClick={()=>void remove('projects',p.id,`o projeto ${p.name}`)}>Eliminar projeto</button></div>)}</div>
    </div>
  </section>
}

/* ================================================================ LANDING */

/** Palco 3D — o produto real como protagonista visual. */
function Stage({compact}:{compact?:boolean}) {
  return <div className="dcx-stage">
    <div className="dcx-stage-bar">
      <span className="dcx-dots"><i/><i/><i/></span>
      <small>quadro-comando-linha-a.dcs</small>
      <span className="dc-state run"><i/>RUN</span>
    </div>
    <div className="dcx-stage-tabs"><span>Esquema</span><span>Ladder</span><span className="on">Painel 3D</span><span>Monitor</span></div>
    <div className="dcx-stage-body">
      <Suspense fallback={<div className="dc-showcase"><div className="dc-showcase-stage"><div className="dc-showcase-fallback">A preparar o painel 3D…</div></div></div>}>
        <LandingShowcase compact={compact}/>
      </Suspense>
    </div>
    <div className="dcx-stage-foot">
      <b>3 componentes</b><b>4 ligações</b><b>Calha DIN 35 mm</b>
      <span className="ml">I0.0 ▮ Q0.0 ▮ KM1 ▮</span>
    </div>
  </div>
}

function Landing({onRegister,onLogin}:{onRegister:()=>void;onLogin:()=>void}) {
  const features=[
    {k:'01 / Esquema',t:'Esquema elétrico',p:'Componentes, bornes e cabos num espaço vetorial preciso, com deteção automática de erros de ligação.',i:'⌁'},
    {k:'02 / Ladder',t:'Programação e scan',p:'Escreva lógica Ladder e acompanhe o comportamento do PLC rede a rede durante o scan.',i:'▤'},
    {k:'03 / GRAFCET',t:'Sequências',p:'Modele etapas e transições e valide a sequência antes de a levar para o quadro real.',i:'◇'},
    {k:'04 / Painel 3D',t:'Quadro em 3D',p:'Equipamentos com modelos CAD reais, montados na calha DIN e sincronizados com o esquema.',i:'▧'},
    {k:'05 / Monitor',t:'Tempo real',p:'Entradas, saídas e contactores visíveis durante a simulação, com o estado RUN sempre à vista.',i:'◉'},
    {k:'06 / Equipa',t:'Colaboração',p:'Convide editores para o projeto e trabalhem sobre o mesmo quadro, em qualquer dispositivo.',i:'↗'},
  ]
  const flow=[
    {t:'Escolher',p:'Filtre a biblioteca por categoria.'},
    {t:'Adicionar',p:'Arraste para o quadro.'},
    {t:'Posicionar',p:'Encaixe na calha em 3D.'},
    {t:'Configurar',p:'Defina tag, calibre e polos.'},
    {t:'Ligar',p:'Una os bornes com cabo real.'},
    {t:'Exportar',p:'Lista de material e esquema.'},
  ]
  const library=[
    {n:'Disjuntores',c:'Proteção',i:'⎍'},{n:'Contactores',c:'Comando',i:'⊞'},
    {n:'Relés',c:'Comando',i:'⊟'},{n:'Botoneiras',c:'Acionamento',i:'◉'},
    {n:'Bornes e barras',c:'Distribuição',i:'≣'},{n:'PLC / LOGO!',c:'Controlo',i:'▤'},
    {n:'Fontes 24 V',c:'Alimentação',i:'▮'},{n:'Sinalização',c:'HMI',i:'◐'},
  ]
  const who=[
    {i:'🔧',t:'Eletricistas',p:'Prepare a montagem antes de abrir a mala de ferramentas.'},
    {i:'📐',t:'Projetistas',p:'Desenhe esquemas coerentes com o quadro físico.'},
    {i:'🎓',t:'Engenheiros',p:'Valide lógica e sequências sem hardware.'},
    {i:'🔗',t:'Integradores',p:'Documente e partilhe soluções com o cliente.'},
    {i:'🏭',t:'Fabricantes de quadros',p:'Planeie a calha, o espaço e a lista de material.'},
    {i:'⚙️',t:'Automação industrial',p:'Teste comandos e proteções antes da obra.'},
  ]
  const faqs=[
    {q:'Preciso de instalar alguma coisa?',a:'Não. O DC·SIMU corre no navegador e pode ser instalado como aplicação (PWA) no computador ou no telemóvel.'},
    {q:'Posso trabalhar com outras pessoas no mesmo projeto?',a:'Sim. O proprietário pode convidar editores, que passam a ver o projeto na sua área de trabalho.'},
    {q:'Que tipo de circuitos posso simular?',a:'Comandos elétricos industriais: contactores, relés, proteções, fontes, motores e PLC, com lógica em Ladder e sequências em GRAFCET.'},
    {q:'O painel 3D usa equipamentos reais?',a:'Sim. Os equipamentos disponíveis usam modelos CAD dos fabricantes e o painel mantém-se sincronizado com o esquema.'},
  ]
  const [menu,setMenu]=useState(false)
  useEffect(()=>{
    const els=Array.from(document.querySelectorAll<HTMLElement>('.dcx [data-rv]'))
    if(!('IntersectionObserver' in window)||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return
    const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('rv-in');io.unobserve(e.target)}}),{threshold:.1,rootMargin:'0px 0px -40px 0px'})
    els.forEach(el=>{el.classList.add('rv-init');io.observe(el)})
    return()=>io.disconnect()
  },[])

  return <div className="dcx">
    {/* ------------------------------------------------------------- nav */}
    <nav className="dcx-nav"><div className="dcx-nav-in">
      <Logo dark size={32}/>
      <div className={'dcx-links'+(menu?' open':'')} onClick={()=>setMenu(false)}>
        <a href="#produto">Produto</a><a href="#editor">Editor 3D</a><a href="#biblioteca">Biblioteca</a><a href="#workflow">Workflow</a><a href="#faq">FAQ</a>
      </div>
      <div className="dcx-nav-cta">
        <button className="dc-a dc-a-dark sm dcx-hide-sm" onClick={onLogin}>Entrar</button>
        <button className="dc-a dc-a-primary sm" onClick={onRegister}>Começar grátis</button>
        <button className="dcx-burger" aria-label="Abrir menu" aria-expanded={menu} onClick={()=>setMenu(!menu)}><i/><i/><i/></button>
      </div>
    </div></nav>

    {/* ------------------------------------------------------------ hero */}
    <section className="dcx-hero"><div className="dcx-hero-in">
      <span className="dc-label on-dark">Plataforma de projeto de quadros elétricos</span>
      <h1>Projete quadros elétricos<br/><em>em 3D.</em></h1>
      <p className="dcx-hero-sub">Crie, configure e visualize os seus quadros elétricos num ambiente 3D profissional — com esquema, lógica Ladder e simulação sempre sincronizados.</p>
      <div className="dcx-hero-cta">
        <button className="dc-a dc-a-primary lg" onClick={onRegister}>Começar gratuitamente <span className="dc-arrow" aria-hidden>→</span></button>
        <a className="dc-a dc-a-dark lg" href="#editor">Ver como funciona</a>
      </div>
      <div className="dcx-hero-meta">
        <span><b>●</b> Sem instalação</span><span><b>●</b> Modelos CAD reais</span><span><b>●</b> Projetos partilhados</span>
      </div>
      <Stage/>
    </div></section>

    {/* ----------------------------------------------------------- faixa */}
    <div className="dcx-strip"><div className="dcx-strip-in">
      <em>Uma base, cinco vistas</em>
      <span>Esquema</span><i/><span>Ladder</span><i/><span>GRAFCET</span><i/><span>Painel 3D</span><i/><span>Monitor</span>
    </div></div>

    {/* ------------------------------------------------- problema/solução */}
    <section className="dcx-sec" id="produto">
      <div className="dcx-head" data-rv>
        <span className="dc-label accent">O problema</span>
        <h2>Projetar um quadro elétrico<br/>não devia obrigar a imaginar o resultado.</h2>
        <p>Entre folhas de cálculo, esquemas em papel e CAD pesado, perde-se tempo — e os erros só aparecem na bancada.</p>
      </div>
      <div className="dcx-split">
        <div className="dcx-panelx problem" data-rv>
          <span className="dc-label">Hoje</span>
          <h3>Ferramentas separadas</h3>
          <ul className="dcx-list">
            <li><span className="dcx-mark bad">✕</span><span><b>Esquema num sítio, quadro noutro</b>O desenho raramente corresponde ao que é montado.</span></li>
            <li><span className="dcx-mark bad">✕</span><span><b>Espaço na calha por adivinhar</b>Só se descobre que não cabe com o material comprado.</span></li>
            <li><span className="dcx-mark bad">✕</span><span><b>Lógica testada em obra</b>Cada erro de comando custa horas de paragem.</span></li>
            <li><span className="dcx-mark bad">✕</span><span><b>CAD pesado e caro</b>Semanas de aprendizagem para uma tarefa simples.</span></li>
          </ul>
        </div>
        <div className="dcx-panelx" data-rv style={{transitionDelay:'90ms'}}>
          <span className="dc-label accent">Com o DC·SIMU</span>
          <h3>Um único ambiente</h3>
          <ul className="dcx-list">
            <li><span className="dcx-mark good">✓</span><span><b>Quadro real em 3D</b>Componentes com dimensões e modelos CAD dos fabricantes.</span></li>
            <li><span className="dcx-mark good">✓</span><span><b>Esquema sincronizado</b>Ligar no esquema é ligar no quadro — e vice-versa.</span></li>
            <li><span className="dcx-mark good">✓</span><span><b>Simulação antes da montagem</b>Veja o contactor fechar e o motor arrancar no ecrã.</span></li>
            <li><span className="dcx-mark good">✓</span><span><b>Abre no navegador</b>Zero instalação, zero licenças complicadas.</span></li>
          </ul>
        </div>
      </div>
    </section>

    {/* -------------------------------------------------------- editor 3D */}
    <section className="dcx-sec tight" id="editor">
      <div className="dcx-head" data-rv>
        <span className="dc-label accent">Editor 3D</span>
        <h2>Biblioteca à esquerda.<br/>Propriedades à direita. O quadro ao centro.</h2>
        <p>Uma interface compacta, densa na informação certa e silenciosa no resto — pensada para horas de trabalho sem cansaço visual.</p>
      </div>
      <div data-rv><Stage compact/></div>
      <div className="dcx-grid g4" style={{marginTop:'var(--dc-s5)'}}>
        {[['Snap à calha DIN','Os componentes encaixam automaticamente no perfil de 35 mm.'],
          ['Inspetor de propriedades','Tag, calibre, número de polos e datasheet num só painel.'],
          ['Atalhos de teclado','Selecionar, mover, rodar e duplicar sem largar o rato.'],
          ['Vista sincronizada','Alterar no 3D reflete-se no esquema e no Ladder.']].map(([t,p],i)=>
          <div className="dcx-card" key={t} data-rv style={{transitionDelay:`${(i%4)*60}ms`}}>
            <h3>{t}</h3><p>{p}</p>
          </div>)}
      </div>
    </section>

    {/* ------------------------------------------------------- biblioteca */}
    <section className="dcx-sec" id="biblioteca">
      <div className="dcx-head" data-rv>
        <span className="dc-label accent">Biblioteca de componentes</span>
        <h2>Os equipamentos que<br/>encontra num quadro real.</h2>
        <p>Organizados por categoria, com fabricante, modelo, dimensões, datasheet e pré-visualização 3D. Pesquise, filtre, marque favoritos e arraste para o quadro.</p>
      </div>
      <div className="dcx-lib">
        {library.map((c,i)=><div className="dcx-lib-item" key={c.n} data-rv style={{transitionDelay:`${(i%4)*50}ms`}}>
          <span className="dcx-lib-ic" aria-hidden>{c.i}</span>
          <span><b>{c.n}</b><small>{c.c}</small></span>
        </div>)}
      </div>
    </section>

    {/* ---------------------------------------------------------- workflow */}
    <section className="dcx-sec tight" id="workflow">
      <div className="dcx-head center" data-rv>
        <span className="dc-label accent">Workflow</span>
        <h2>Do componente ao quadro exportado.</h2>
        <p>Seis passos, sempre os mesmos. Sem configurações demoradas.</p>
      </div>
      <div className="dcx-flow">
        {flow.map((s,i)=><div className="dcx-step" key={s.t} data-rv style={{transitionDelay:`${i*60}ms`}}>
          <span className="dcx-step-n">{i+1}</span><b>{s.t}</b><span>{s.p}</span>
        </div>)}
      </div>
    </section>

    {/* -------------------------------------------------------- features */}
    <section className="dcx-sec">
      <div className="dcx-head" data-rv>
        <span className="dc-label accent">Funcionalidades</span>
        <h2>Menos ferramentas separadas.<br/>Mais tempo a projetar.</h2>
      </div>
      <div className="dcx-grid g3">
        {features.map((f,i)=><article className="dcx-card" key={f.k} data-rv style={{transitionDelay:`${(i%3)*70}ms`}}>
          <div className="dcx-card-ic" aria-hidden>{f.i}</div>
          <span className="dcx-card-k">{f.k}</span>
          <h3>{f.t}</h3><p>{f.p}</p>
        </article>)}
      </div>
      <div className="dcx-stats" style={{marginTop:'var(--dc-s7)'}} data-rv>
        <div><b>5</b><span>vistas sincronizadas</span></div>
        <div><b>11</b><span>categorias na biblioteca</span></div>
        <div><b>3D</b><span>modelos CAD reais</span></div>
        <div><b>PWA</b><span>instalável em qualquer ecrã</span></div>
      </div>
    </section>

    {/* ------------------------------------------------------- para quem é */}
    <section className="dcx-sec tight">
      <div className="dcx-head" data-rv>
        <span className="dc-label accent">Para quem é</span>
        <h2>Feito para quem monta<br/>quadros a sério.</h2>
      </div>
      <div className="dcx-who" data-rv>
        {who.map(w=><div key={w.t}><i aria-hidden>{w.i}</i><b>{w.t}</b><p>{w.p}</p></div>)}
      </div>
    </section>

    {/* -------------------------------------------------------------- FAQ */}
    <section className="dcx-sec" id="faq">
      <div className="dcx-head" data-rv>
        <span className="dc-label accent">Perguntas frequentes</span>
        <h2>Tudo o que precisa<br/>de saber para começar.</h2>
      </div>
      <div className="dcx-faq" data-rv>{faqs.map(f=><details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
    </section>

    {/* ------------------------------------------------------------- CTA */}
    <section className="dcx-cta">
      <span className="dc-label on-dark">Pronto para começar?</span>
      <h2>O próximo quadro começa aqui.</h2>
      <p>Crie uma conta gratuita e monte o seu primeiro quadro elétrico em 3D hoje.</p>
      <div className="dcx-cta-row">
        <button className="dc-a dc-a-light lg" onClick={onRegister}>Começar gratuitamente <span className="dc-arrow" aria-hidden>→</span></button>
        <button className="dc-a dc-a-dark lg" onClick={onLogin}>Já tenho conta</button>
      </div>
    </section>

    <footer className="dcx-foot"><div className="dcx-foot-in">
      <Logo dark size={28}/>
      <nav aria-label="Rodapé"><a href="#produto">Produto</a><a href="#editor">Editor 3D</a><a href="#biblioteca">Biblioteca</a><a href="#workflow">Workflow</a><a href="#faq">FAQ</a></nav>
      <small>© {new Date().getFullYear()} DC·SIMU</small>
    </div></footer>
  </div>
}
