import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createComponent } from '../src/electrical/factory'
import { EnclosureControls, fitEnclosureToContent } from '../src/components/PanelAccessoryControls'
import { Enclosure2D } from '../src/schematic/PanelAccessories2D'
import { EnclosureHoleGland3D } from '../src/three/PanelAccessories3D'
import { useSimStore } from '../src/store/useSimStore'

const makeEnclosure = (holes: Array<Record<string, unknown>> = []) => {
  const enclosure = createComponent('panelEnclosure', 'QE1', undefined, 0, 0, 0)
  enclosure.schematicX = 20
  enclosure.schematicY = 40
  enclosure.w = 600
  enclosure.h = 900
  enclosure.state = { ...enclosure.state, widthMm: 400, heightMm: 600, holes }
  return enclosure
}

const renderInspector = (enclosure: ReturnType<typeof makeEnclosure>) =>
  renderToStaticMarkup(createElement(EnclosureControls, { c: enclosure }))

const renderSchematic = (enclosure: ReturnType<typeof makeEnclosure>) =>
  renderToStaticMarkup(createElement('svg', null, createElement(Enclosure2D, { c: enclosure })))

const elementTypes = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(elementTypes)
  if (!node || typeof node !== 'object' || !('type' in node)) return []
  const element = node as { type: unknown; props?: { children?: unknown } }
  return [String(element.type), ...elementTypes(element.props?.children)]
}

{
  const enclosure = makeEnclosure()
  useSimStore.setState({ components: [enclosure], selectedComponentIds: [] })
  const before = { x: enclosure.schematicX, y: enclosure.schematicY, w: enclosure.w, h: enclosure.h, state: { ...enclosure.state } }
  assert.equal(fitEnclosureToContent(enclosure), 'empty', 'quadro sem conteúdo devolve estado vazio')
  const after = useSimStore.getState().components[0]
  assert.deepEqual(
    { x: after.schematicX, y: after.schematicY, w: after.w, h: after.h, state: { ...after.state } },
    before,
    'quadro sem conteúdo mantém dimensões, posição e estado',
  )
}

{
  const enclosure = makeEnclosure()
  const first = createComponent('emergencyButton', 'S1', undefined, 0, 0, 0)
  first.enclosureId = enclosure.id
  first.schematicX = 60
  first.schematicY = 90
  first.w = 900
  first.h = 1200
  const second = createComponent('emergencyButton', 'S2', undefined, 0, 0, 0)
  second.enclosureId = enclosure.id
  second.schematicX = 960
  second.schematicY = 1290
  second.w = 60
  second.h = 90
  useSimStore.setState({ components: [enclosure, first, second], selectedComponentIds: [] })

  assert.equal(fitEnclosureToContent(enclosure), 'fit', 'conteúdo associado permite ajustar')
  const fitted = useSimStore.getState().components[0]
  assert.equal(fitted.state.widthMm, 720, 'largura usa os limites dos aparelhos e a margem de 60 px')
  assert.equal(fitted.state.heightMm, 940, 'altura usa os limites dos aparelhos e a margem de 60 px')
  assert.equal(fitted.schematicX, 0, 'posiciona o quadro em torno do conteúdo assimétrico no eixo horizontal')
  assert.equal(fitted.schematicY, 30, 'posiciona o quadro em torno do conteúdo assimétrico no eixo vertical')
  const fittedBounds = { x: fitted.schematicX, y: fitted.schematicY, w: fitted.w, h: fitted.h }
  for (const item of [first, second]) {
    assert.ok(item.schematicX >= fitted.schematicX && item.schematicX + item.w <= fitted.schematicX + fitted.w, `${item.ref} fica contido na largura ajustada`)
    assert.ok(item.schematicY >= fitted.schematicY && item.schematicY + item.h <= fitted.schematicY + fitted.h, `${item.ref} fica contido na altura ajustada`)
  }

  assert.equal(fitEnclosureToContent(enclosure), 'fit', 'repetir o ajuste mantém resultado válido')
  const repeated = useSimStore.getState().components[0]
  assert.deepEqual(
    { x: repeated.schematicX, y: repeated.schematicY, w: repeated.w, h: repeated.h },
    fittedBounds,
    'ajustes repetidos com o mesmo conteúdo mantêm o mesmo tamanho e posição',
  )
}

{
  const enclosure = makeEnclosure()
  enclosure.schematicX = 100
  enclosure.schematicY = 200
  enclosure.w = 900
  enclosure.h = 1200
  enclosure.state = { ...enclosure.state, widthMm: 600, heightMm: 800 }
  const edgeDevices = [
    { ref: 'LEFT', x: 100, y: 700, w: 90, h: 90 },
    { ref: 'RIGHT', x: 850, y: 700, w: 150, h: 90 },
    { ref: 'TOP', x: 500, y: 200, w: 90, h: 90 },
    { ref: 'BOTTOM', x: 500, y: 1250, w: 90, h: 150 },
    { ref: 'ASYM', x: 1200, y: 350, w: 90, h: 120 },
  ].map(({ ref, x, y, w, h }) => {
    const item = createComponent('emergencyButton', ref, undefined, 0, 0, 0)
    item.enclosureId = enclosure.id
    item.schematicX = x
    item.schematicY = y
    item.w = w
    item.h = h
    return item
  })
  useSimStore.setState({ components: [enclosure, ...edgeDevices], selectedComponentIds: [] })

  assert.equal(fitEnclosureToContent(enclosure), 'fit', 'ajusta conteúdo encostado às quatro faces e um aparelho associado assimétrico')
  const fitted = useSimStore.getState().components[0]
  assert.equal(fitted.state.widthMm, 874, 'a largura deriva da união dos limites e da margem')
  assert.equal(fitted.state.heightMm, 880, 'a altura deriva da união dos limites e da margem')
  assert.equal(fitted.schematicX, 40, 'a posição horizontal centra a união, não o quadro anterior')
  assert.equal(fitted.schematicY, 140, 'a posição vertical centra a união, não o quadro anterior')
  for (const item of edgeDevices) {
    assert.ok(item.schematicX >= fitted.schematicX + 60 && item.schematicX + item.w <= fitted.schematicX + fitted.w - 60, `${item.ref} fica contido com margem horizontal`)
    assert.ok(item.schematicY >= fitted.schematicY + 60 && item.schematicY + item.h <= fitted.schematicY + fitted.h - 60, `${item.ref} fica contido com margem vertical`)
  }
}

{
  const enclosure = makeEnclosure()
  const nearby = createComponent('emergencyButton', 'S-near', undefined, 0, 0, 0)
  nearby.schematicX = enclosure.schematicX + enclosure.w + 1
  nearby.schematicY = enclosure.schematicY + 100
  const before = { x: enclosure.schematicX, y: enclosure.schematicY, w: enclosure.w, h: enclosure.h, state: { ...enclosure.state } }
  useSimStore.setState({ components: [enclosure, nearby], selectedComponentIds: [] })

  assert.equal(fitEnclosureToContent(enclosure), 'empty', 'ignora componente próximo mas exterior ao quadro')
  const after = useSimStore.getState().components[0]
  assert.deepEqual(
    { x: after.schematicX, y: after.schematicY, w: after.w, h: after.h, state: { ...after.state } },
    before,
    'componente próximo não altera geometria nem estado do quadro',
  )
}

{
  const enclosure = makeEnclosure()
  const oversized = createComponent('emergencyButton', 'S-large', undefined, 0, 0, 0)
  oversized.enclosureId = enclosure.id
  oversized.schematicX = enclosure.schematicX
  oversized.schematicY = enclosure.schematicY
  oversized.w = 3000
  oversized.h = 4000
  const originalPushEvent = useSimStore.getState().pushEvent
  const events: Array<{ level: string; message: string }> = []
  useSimStore.setState({ components: [enclosure, oversized], selectedComponentIds: [], pushEvent: (level, message) => events.push({ level, message }) })
  try {
    assert.equal(fitEnclosureToContent(enclosure), 'limited', 'devolve limite quando o conteúdo ultrapassa a capacidade máxima')
    const fitted = useSimStore.getState().components[0]
    assert.equal(fitted.state.widthMm, 1600, 'a largura respeita o máximo permitido')
    assert.equal(fitted.state.heightMm, 2200, 'a altura respeita o máximo permitido')
    assert.ok(events.some(({ level, message }) => level === 'warning' && message.includes('excede o limite máximo')), 'limite é comunicado como aviso')
    assert.ok(!events.some(({ level }) => level === 'info'), 'limite não é anunciado como ajuste concluído')
  } finally {
    useSimStore.setState({ pushEvent: originalPushEvent })
  }
}

{
  const hole = { id: 'hole-none', face: 'door', offsetXmm: 0, offsetYmm: 0, diameterMm: 22, glandType: 'none' }
  const enclosure = makeEnclosure([hole])
  useSimStore.setState({ components: [enclosure], selectedComponentIds: [] })

  const inspector = renderInspector(enclosure)
  assert.match(inspector, /role="status" aria-live="polite" data-enclosure-fit-feedback/, 'mensagem local de ajuste tem live region anunciável')
  assert.match(inspector, /aria-label="Largura do quadro \(mm\)"/, 'slider de largura tem nome acessível')
  assert.match(inspector, /role="group" aria-label="Face do furo"/, 'opções da face formam grupo nomeado')
  assert.match(inspector, /role="group" aria-label="Diâmetro do furo"/, 'opções do diâmetro formam grupo nomeado')
  assert.match(inspector, /aria-label="Diâmetro do furo \(mm\)"/, 'campo numérico do diâmetro tem nome acessível')
  assert.match(inspector, /aria-pressed="true"[^>]*>.*?Fundo/s, 'face selecionada expõe estado acessível')
  assert.match(inspector, /aria-pressed="true"[^>]*>M20/, 'diâmetro selecionado expõe estado acessível')
  assert.match(inspector, /min-h-\[34px\]/, 'alvos das opções de furo têm pelo menos 34 px')
  assert.match(inspector, /min-h-\[38px\]/, 'slider e ação principal usam alvo de pelo menos 38 px')
  assert.match(inspector, /h-9 text-xs[^>]*aria-label="Diâmetro do furo/, 'campo numérico tem alvo superior a 34 px')
  assert.match(inspector, /vazio — escolha bucim ou aparelho/, 'resumo trata none como ausência de bucim')
  assert.doesNotMatch(inspector, /Bucim none/, 'resumo não exibe none como um bucim')

  const schematic = renderSchematic(enclosure)
  assert.match(schematic, /door Ø22 furo/, 'vista 2D mantém o furo sem o rotular como bucim')
  assert.doesNotMatch(schematic, />[^<]*none<\/text>/, 'vista 2D não representa none como bucim')
  const holeTextAt = schematic.indexOf('door Ø22 furo')
  const holeMarkup = schematic.slice(schematic.lastIndexOf('<g pointer-events="none">', holeTextAt), holeTextAt)
  assert.equal((holeMarkup.match(/<circle\b/g) ?? []).length, 1, 'vista 2D desenha o furo sem o anel de bucim')

  const glandGeometry = EnclosureHoleGland3D({ diameter: 0.22, glandType: 'none' })
  assert.deepEqual(elementTypes(glandGeometry), [], 'none não produz geometria de bucim em 3D')
}

{
  const hole = { id: 'hole-m20', face: 'door', offsetXmm: 0, offsetYmm: 0, diameterMm: 20, glandType: 'M20' }
  const enclosure = makeEnclosure([hole])
  useSimStore.setState({ components: [enclosure], selectedComponentIds: [] })

  assert.match(renderInspector(enclosure), /Bucim M20/, 'resumo mantém o bucim real')
  const schematic = renderSchematic(enclosure)
  assert.match(schematic, /door Ø20 M20/, 'vista 2D mantém a designação do bucim real')
  const holeTextAt = schematic.indexOf('door Ø20 M20')
  const holeMarkup = schematic.slice(schematic.lastIndexOf('<g pointer-events="none">', holeTextAt), holeTextAt)
  assert.equal((holeMarkup.match(/<circle\b/g) ?? []).length, 2, 'vista 2D desenha o anel do bucim real')
  const glandGeometry = elementTypes(EnclosureHoleGland3D({ diameter: 0.2, glandType: 'M20' }))
  assert.ok(glandGeometry.includes('ringGeometry'), 'bucim real produz o anel 3D')
  assert.ok(glandGeometry.includes('cylinderGeometry'), 'bucim real produz o corpo 3D')
}

{
  const enclosure = makeEnclosure([{ id: 'hole-occupied', face: 'door', offsetXmm: 0, offsetYmm: 0, diameterMm: 22 }])
  useSimStore.setState({ components: [enclosure], selectedComponentIds: [], demoMode: false })
  const availableInspector = renderInspector(enclosure)
  const availableButton = availableInspector.match(/<button\b[^>]*aria-label="Adicionar aparelho ao furo hole-occupied"[^>]*>/)?.[0]
  assert.ok(availableButton && !availableButton.includes('disabled'), 'inspetor permite adicionar ao furo livre')
  const store = useSimStore.getState()
  const add = () => store.addMountedDevice('emergencyButton', enclosure.id, 'door', 0, 0, 22, 'hole-occupied')
  const firstId = add()
  assert.ok(firstId, 'primeiro aparelho é acrescentado ao furo livre')
  const firstState = useSimStore.getState()
  const firstHole = (firstState.components[0].state.holes as Array<{ id: string; occupiedBy?: string }>)[0]
  assert.equal(firstHole.occupiedBy, firstId, 'store associa a ocupação ao aparelho criado')
  assert.equal(firstState.components.length, 2, 'store cria um único aparelho')

  const duplicateId = useSimStore.getState().addMountedDevice('emergencyButton', enclosure.id, 'door', 0, 0, 30)
  const duplicateState = useSimStore.getState()
  const duplicateHole = (duplicateState.components[0].state.holes as Array<{ id: string; occupiedBy?: string }>)[0]
  assert.equal(duplicateId, null, 'store recusa a segunda criação no mesmo furo')
  assert.equal(duplicateState.components.length, 2, 'recusa não cria outro componente')
  assert.equal(duplicateHole.occupiedBy, firstId, 'recusa preserva a ocupação existente')

  const inspector = renderInspector(duplicateState.components[0])
  const addSelect = inspector.match(/<button\b[^>]*aria-label="Adicionar aparelho ao furo hole-occupied"[^>]*>/)?.[0]
  assert.ok(addSelect?.includes('disabled'), 'inspetor desativa a ação de adicionar ao furo ocupado')
  assert.match(inspector, /Aparelho montado/, 'inspetor explica o estado da ação desativada')
}

console.log('PASS — regressões do inspetor: bounds/posição, limite máximo, estado vazio, acessibilidade, bucins e ocupação única dos furos')
