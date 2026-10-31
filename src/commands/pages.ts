/**
 * Folhas (páginas) do Esquema IEC e ligações entre páginas.
 *
 * Cada símbolo e texto pertence a uma página (`page`). Cabos ligam bornes na
 * mesma página. A corrente passa de uma página a outra pelos símbolos
 * `pageRef` (referência de potencial / conector entre folhas): o mesmo `tag`
 * em páginas diferentes fica unido electricamente na simulação.
 */
import { nanoid } from 'nanoid'
import type { CmdPart, CmdText, CmdWire, CommandsDiagram } from './model'

export interface CmdPage {
  id: string
  name: string
}

export const DEFAULT_PAGE_ID = 'page-1'

export function defaultPages(): CmdPage[] {
  return [{ id: DEFAULT_PAGE_ID, name: 'Página 1' }]
}

/** Garante pelo menos uma página e ids válidos nos elementos. */
export function normalizeCommandsPages(diagram: CommandsDiagram): CommandsDiagram {
  const pages = diagram.pages?.length ? diagram.pages.map((p, i) => ({
    id: p.id || `page-${i + 1}`,
    name: (p.name || `Página ${i + 1}`).trim() || `Página ${i + 1}`,
  })) : defaultPages()
  const ids = new Set(pages.map((p) => p.id))
  const fallback = pages[0].id
  const fixPage = (page?: string) => (page && ids.has(page) ? page : fallback)
  return {
    ...diagram,
    pages,
    parts: diagram.parts.map((p) => ({ ...p, page: fixPage(p.page) })),
    wires: diagram.wires.map((w) => ({ ...w, page: fixPage(w.page) })),
    texts: (diagram.texts ?? []).map((t) => ({ ...t, page: fixPage(t.page) })),
  }
}

export function pagesOf(diagram: CommandsDiagram): CmdPage[] {
  return normalizeCommandsPages(diagram).pages!
}

export function pageIdOf(part: Pick<CmdPart, 'page'> | Pick<CmdWire, 'page'> | Pick<CmdText, 'page'> | undefined, fallback = DEFAULT_PAGE_ID): string {
  return part?.page || fallback
}

export function partsOnPage(diagram: CommandsDiagram, pageId: string): CmdPart[] {
  const pages = pagesOf(diagram)
  const id = pages.some((p) => p.id === pageId) ? pageId : pages[0].id
  return diagram.parts.filter((p) => pageIdOf(p, pages[0].id) === id)
}

export function wiresOnPage(diagram: CommandsDiagram, pageId: string): CmdWire[] {
  const pages = pagesOf(diagram)
  const id = pages.some((p) => p.id === pageId) ? pageId : pages[0].id
  const partPage = new Map(diagram.parts.map((p) => [p.id, pageIdOf(p, pages[0].id)]))
  return diagram.wires.filter((w) => {
    if (w.page) return pageIdOf(w, pages[0].id) === id
    // Cabo sem página: herda a página do primeiro extremo conhecido.
    const a = partPage.get(w.a.part)
    const b = partPage.get(w.b.part)
    return (a ?? b ?? pages[0].id) === id
  })
}

export function textsOnPage(diagram: CommandsDiagram, pageId: string): CmdText[] {
  const pages = pagesOf(diagram)
  const id = pages.some((p) => p.id === pageId) ? pageId : pages[0].id
  return (diagram.texts ?? []).filter((t) => pageIdOf(t, pages[0].id) === id)
}

export function addPage(diagram: CommandsDiagram, name?: string): CommandsDiagram {
  const pages = pagesOf(diagram)
  const n = pages.length + 1
  const page: CmdPage = { id: `page-${nanoid(6)}`, name: name?.trim() || `Página ${n}` }
  return normalizeCommandsPages({ ...diagram, pages: [...pages, page] })
}

export function renamePage(diagram: CommandsDiagram, pageId: string, name: string): CommandsDiagram {
  const pages = pagesOf(diagram).map((p) => (p.id === pageId ? { ...p, name: name.trim() || p.name } : p))
  return { ...diagram, pages }
}

/** Só elimina se a página estiver vazia (sem símbolos nem textos). */
export function removePage(diagram: CommandsDiagram, pageId: string): { diagram: CommandsDiagram; error?: string } {
  const pages = pagesOf(diagram)
  if (pages.length <= 1) return { diagram, error: 'É preciso pelo menos uma página.' }
  if (partsOnPage(diagram, pageId).length || textsOnPage(diagram, pageId).length) {
    return { diagram, error: 'A página só pode ser eliminada se estiver vazia (sem símbolos nem textos).' }
  }
  const nextPages = pages.filter((p) => p.id !== pageId)
  const fallback = nextPages[0].id
  return {
    diagram: normalizeCommandsPages({
      ...diagram,
      pages: nextPages,
      wires: diagram.wires.filter((w) => pageIdOf(w, fallback) !== pageId),
    }),
  }
}

/** Outras páginas que partilham o mesmo tag de `pageRef` (ligação eléctrica). */
export function pageRefPeers(diagram: CommandsDiagram, tag: string, exceptPage?: string): CmdPage[] {
  const net = tag.trim()
  if (!net) return []
  const pages = pagesOf(diagram)
  const found = new Set<string>()
  for (const p of diagram.parts) {
    if (p.kind !== 'pageRef') continue
    if (p.tag.trim() !== net) continue
    const pid = pageIdOf(p, pages[0].id)
    if (exceptPage && pid === exceptPage) continue
    found.add(pid)
  }
  return pages.filter((p) => found.has(p.id))
}
