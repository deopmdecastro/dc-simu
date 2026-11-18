import type { ElectricalComponent } from '../types'
import {
  ACRYLIC_BUSBAR,
  acrylicBusbarColorOf,
  acrylicBusbarDimsOf,
  acrylicBusbarWireEntryOf,
  acrylicCoverVisibleOf,
  isAcrylicBusbarType,
  STEPPED_BUSBAR,
  steppedBarCenterMm,
  steppedBusbarDimsOf,
  steppedCoverOpenOf,
  steppedCoverVisibleOf,
} from '../three/busbarParts'
import {
  COMB_BUSBAR,
  COMB_CONDUCTOR_HEX,
  COMB_CONNECTOR,
  COMB_CONNECTOR_GAUGES,
  combBrandOf,
  combBusbarDimsOf,
  combCatalogCodeOf,
  combConnectorColorOf,
  combConnectorGaugeOf,
  combConnectorPhaseColorsOf,
  combConnectorPinDirectionOf,
  combRatedAOf,
  combSectionMm2Of,
  isCombBusbarType,
  isCombConnectorType,
} from '../three/combBusbarParts'

/**
 * Vista frontal ortográfica fiel em 2D dos barramentos isolados com acrílico (PE, N e Fase)
 * e do repartidor de fases em escada (4P/3P/2P), sincronizada ao milímetro com o n.º de bornes,
 * a cor do acrílico e o estado da tampa (fechada, aberta ou oculta).
 */
export function Busbar2D({ c }: { c: ElectricalComponent }) {
  const uid = `bb-${c.id.replace(/[^a-zA-Z0-9_-]/g, '')}`

  if (isCombBusbarType(c.type)) {
    return <CombBusbar2DView c={c} uid={uid} />
  }
  if (isCombConnectorType(c.type)) {
    return <CombConnector2DView c={c} uid={uid} />
  }

  if (isAcrylicBusbarType(c.type)) {
    const d = acrylicBusbarDimsOf(c.state)
    const sx = c.w / d.widthMm
    const sy = c.h / d.heightMm
    const color = acrylicBusbarColorOf(c.type, c.state)
    const coverOn = acrylicCoverVisibleOf(c.state)
    const wireEntry = acrylicBusbarWireEntryOf(c.type, c.state)
    const isTop = wireEntry === 'top'
    const earW = ACRYLIC_BUSBAR.earWidthMm * sx
    const bodyX = earW
    const bodyW = d.bodyWidthMm * sx
    const screwY = c.h / 2
    const screwR = 2.4 * Math.min(sx, sy)
    const wireY = isTop ? 3.5 * sy : c.h - 3.5 * sy
    const wireR = 2.2 * Math.min(sx, sy)
    const clipCount = d.poles <= 6 ? 2 : 3
    const clipW = Math.max(6, Math.min(12, bodyW * 0.1))

    return (
      <g pointerEvents="none">
        <defs>
          <linearGradient id={`${uid}-pa`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ebe6dc" />
            <stop offset="55%" stopColor="#dcd6c9" />
            <stop offset="100%" stopColor="#c7c0b2" />
          </linearGradient>
          <linearGradient id={`${uid}-br`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f3d98b" />
            <stop offset="50%" stopColor="#cfa23b" />
            <stop offset="100%" stopColor="#8a6518" />
          </linearGradient>
          <linearGradient id={`${uid}-sc`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="45%" stopColor="#eab308" />
            <stop offset="85%" stopColor="#ca8a04" />
            <stop offset="100%" stopColor="#713f12" />
          </linearGradient>
          <linearGradient id={`${uid}-ac`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.52" />
            <stop offset="22%" stopColor={color} stopOpacity="0.68" />
            <stop offset="85%" stopColor={color} stopOpacity="0.82" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.32" />
          </linearGradient>
        </defs>

        {/* Orelhas laterais M4 */}
        {[0, c.w - earW].map((ex, idx) => {
          const slotCx = idx === 0
            ? (ACRYLIC_BUSBAR.earWidthMm - ACRYLIC_BUSBAR.mountOffsetFromBodyMm) * sx
            : c.w - (ACRYLIC_BUSBAR.earWidthMm - ACRYLIC_BUSBAR.mountOffsetFromBodyMm) * sx
          return (
            <g key={idx}>
              <rect x={ex} y={c.h * 0.22} width={earW} height={c.h * 0.56} rx={1.6} fill={`url(#${uid}-pa)`} stroke="#9c9588" strokeWidth={0.9} />
              <circle cx={slotCx} cy={c.h / 2} r={2.15 * Math.min(sx, sy)} fill="#f8fafc" stroke="#8a8377" strokeWidth={0.8} />
            </g>
          )
        })}

        {/* Corpo isolante PA66 */}
        <rect
          x={bodyX}
          y={1.5 * sy}
          width={bodyW}
          height={c.h - 3 * sy}
          rx={2}
          fill={`url(#${uid}-pa)`}
          stroke="#958e81"
          strokeWidth={0.95}
        />

        {/* Barra condutora maciça central de latão */}
        <rect
          x={bodyX + 2 * sx}
          y={screwY - 6.5 * sy}
          width={bodyW - 4 * sx}
          height={13 * sy}
          rx={1.5}
          fill={`url(#${uid}-br)`}
          stroke="#7d5b14"
          strokeWidth={0.8}
        />

        {/* Parafusos frontais e furos de entrada de cabos */}
        {Array.from({ length: d.poles }, (_, i) => {
          const cx = bodyX + (ACRYLIC_BUSBAR.endWallMm + (i + 0.5) * ACRYLIC_BUSBAR.pitchMm) * sx
          return (
            <g key={i}>
              {/* Furo de entrada do condutor (topo ou base) */}
              <circle cx={cx} cy={wireY} r={wireR} fill="#1e180d" stroke="#cfa23b" strokeWidth={0.7} />

              {/* Arruela plana sob a cabeça do parafuso */}
              <circle cx={cx} cy={screwY} r={screwR * 1.3} fill="#d8ae47" stroke="#785713" strokeWidth={0.4} />

              {/* Cabeça do parafuso frontal M4 */}
              <circle cx={cx} cy={screwY} r={screwR} fill={`url(#${uid}-sc)`} stroke="#5b3d09" strokeWidth={0.6} />

              {/* Fenda em cruz Pozidriv / Phillips voltada para a frente */}
              <line x1={cx - screwR * 0.72} y1={screwY} x2={cx + screwR * 0.72} y2={screwY} stroke="#3b2404" strokeWidth={0.7} />
              <line x1={cx} y1={screwY - screwR * 0.72} x2={cx} y2={screwY + screwR * 0.72} stroke="#3b2404" strokeWidth={0.7} />
              <line x1={cx - screwR * 0.42} y1={screwY - screwR * 0.42} x2={cx + screwR * 0.42} y2={screwY + screwR * 0.42} stroke="#3b2404" strokeWidth={0.5} />
              <line x1={cx - screwR * 0.42} y1={screwY + screwR * 0.42} x2={cx + screwR * 0.42} y2={screwY - screwR * 0.42} stroke="#3b2404" strokeWidth={0.5} />
            </g>
          )
        })}

        {/* Tampa frontal em acrílico translúcido colorido com aberturas de acesso à chave de fendas */}
        {coverOn && (
          <g>
            <rect
              x={bodyX + 0.6}
              y={3.5 * sy}
              width={bodyW - 1.2}
              height={c.h - 7 * sy}
              rx={1.8}
              fill={color}
              fillOpacity={0.52}
              stroke={color}
              strokeWidth={1.1}
            />
            <rect
              x={bodyX + 0.6}
              y={3.5 * sy}
              width={bodyW - 1.2}
              height={c.h - 7 * sy}
              rx={1.8}
              fill={`url(#${uid}-ac)`}
            />
            {/* Aberturas circulares na tampa para passar a chave de fendas */}
            {Array.from({ length: d.poles }, (_, i) => {
              const cx = bodyX + (ACRYLIC_BUSBAR.endWallMm + (i + 0.5) * ACRYLIC_BUSBAR.pitchMm) * sx
              return (
                <circle
                  key={`ap-${i}`}
                  cx={cx}
                  cy={screwY}
                  r={screwR * 1.35}
                  fill="none"
                  stroke="#ffffff"
                  strokeOpacity={0.65}
                  strokeWidth={0.8}
                />
              )
            })}
            {Array.from({ length: clipCount }, (_, k) => {
              const frac = clipCount === 2 ? (k === 0 ? 0.24 : 0.76) : (k === 0 ? 0.18 : k === 1 ? 0.5 : 0.82)
              const lx = bodyX + frac * bodyW - clipW / 2
              return (
                <rect key={k} x={lx} y={c.h - 5.5 * sy} width={clipW} height={3.5 * sy} rx={0.7} fill={color} fillOpacity={0.85} stroke="#ffffff" strokeOpacity={0.45} strokeWidth={0.6} />
              )
            })}
          </g>
        )}
      </g>
    )
  }

  // Barramento repartidor de fases em escada (4P / 3P / 2P)
  const d = steppedBusbarDimsOf(c.state)
  const sx = c.w / d.widthMm
  const sy = c.h / d.heightMm
  const sideW = STEPPED_BUSBAR.sideFrameMm * sx
  const barX = sideW
  const barW = d.barWidthMm * sx
  const barH = STEPPED_BUSBAR.barHeightMm * sy
  const coverOn = steppedCoverVisibleOf(c.state)
  const coverOpen = steppedCoverOpenOf(c.state)
  const firstBar = steppedBarCenterMm(d, 0)
  const coverBotY = (d.heightMm - (firstBar.yMm + STEPPED_BUSBAR.barHeightMm / 2 + 1.2)) * sy

  return (
    <g pointerEvents="none">
      <defs>
        <linearGradient id={`${uid}-fr`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e5e8ec" />
          <stop offset="100%" stopColor="#c2c7cf" />
        </linearGradient>
        <linearGradient id={`${uid}-sbr`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0d584" />
          <stop offset="50%" stopColor="#cca03a" />
          <stop offset="100%" stopColor="#8d6819" />
        </linearGradient>
      </defs>

      {/* Corpo central isolante em escada */}
      <rect x={barX - 1} y={3} width={barW + 2} height={c.h - 10} rx={2} fill="#eef1f4" stroke="#9aa2ae" strokeWidth={0.9} />

      {/* Suportes laterais RAL 7035 com pés DIN */}
      <rect x={0.5} y={1.5} width={sideW} height={c.h - 2} rx={2} fill={`url(#${uid}-fr)`} stroke="#8f98a5" strokeWidth={1} />
      <rect x={c.w - sideW - 0.5} y={1.5} width={sideW} height={c.h - 2} rx={2} fill={`url(#${uid}-fr)`} stroke="#8f98a5" strokeWidth={1} />

      {/* Barras maciças de latão escalonadas + fileiras de parafusos zincados + furos reais */}
      {d.conductors.map((cond, b) => {
        const { yMm } = steppedBarCenterMm(d, b)
        const cy = (d.heightMm - yMm) * sy
        const topY = cy - barH / 2
        return (
          <g key={cond}>
            {/* Barreira dielétrica entre degraus */}
            <line x1={barX} y1={topY - 3.5 * sy} x2={barX + barW} y2={topY - 3.5 * sy} stroke="#cbd5e1" strokeWidth={1.2} />
            {/* Barra de latão */}
            <rect x={barX} y={topY} width={barW} height={barH} rx={1} fill={`url(#${uid}-sbr)`} stroke="#7d5b14" strokeWidth={0.8} />
            {/* Etiqueta gravada no suporte lateral esquerdo */}
            <text x={sideW * 0.52} y={cy + 3} textAnchor="middle" fontSize={Math.max(7, Math.min(9.5, sideW * 0.55))} fontWeight={700} fill={cond === 'N' ? '#1d4ed8' : '#334155'}>
              {cond}
            </text>
            {/* Parafusos superiores zincados + furos frontais de entrada dos cabos */}
            {Array.from({ length: d.holesPerBar }, (_, k) => {
              const hx = barX + (STEPPED_BUSBAR.barEndPadMm + (k + 0.5) * STEPPED_BUSBAR.pitchMm) * sx
              const r = (k === 0 ? 2.85 : 2.32) * Math.min(sx, sy)
              return (
                <g key={k}>
                  <rect x={hx - r * 0.92} y={topY - 3.2 * sy} width={r * 1.84} height={3.1 * sy} rx={0.8} fill="#dbe1e8" stroke="#64748b" strokeWidth={0.55} />
                  <circle cx={hx} cy={cy} r={r} fill="#251d0e" stroke="#f5df97" strokeWidth={0.65} />
                </g>
              )
            })}
          </g>
        )
      })}

      {/* Tampa articulada em policarbonato transparente (fechada ou aberta para cima) */}
      {coverOn && !coverOpen && (
        <g>
          <rect
            x={2}
            y={2}
            width={c.w - 4}
            height={Math.max(12, coverBotY - 2)}
            rx={2.2}
            fill="#e2eef8"
            fillOpacity={0.28}
            stroke="#334155"
            strokeOpacity={0.72}
            strokeWidth={1.35}
          />
          <line x1={5} y1={5} x2={c.w - 5} y2={5} stroke="#ffffff" strokeOpacity={0.75} strokeWidth={1.2} />
          {/* Duas patilhas frontais de abertura */}
          <rect x={sideW + 2} y={coverBotY - 2.5} width={10} height={3.5} rx={0.8} fill="#cbd5e1" fillOpacity={0.7} stroke="#475569" strokeWidth={0.7} />
          <rect x={c.w - sideW - 12} y={coverBotY - 2.5} width={10} height={3.5} rx={0.8} fill="#cbd5e1" fillOpacity={0.7} stroke="#475569" strokeWidth={0.7} />
        </g>
      )}
      {coverOn && coverOpen && (
        <g>
          <rect
            x={2.5}
            y={-8}
            width={c.w - 5}
            height={10}
            rx={1.8}
            fill="#dbeafe"
            fillOpacity={0.35}
            stroke="#334155"
            strokeOpacity={0.65}
            strokeDasharray="3 2"
            strokeWidth={1.1}
          />
        </g>
      )}
    </g>
  )
}

/** Vista ortográfica frontal 2D realista do barramento tipo pente (`busbarComb` — 1P, 1P+N, 3P, 3P+N). */
function CombBusbar2DView({ c, uid }: { c: ElectricalComponent; uid: string }) {
  const d = combBusbarDimsOf(c.state)
  const brand = combBrandOf(c.state)
  const ratedA = combRatedAOf(c.state)
  const sectionMm2 = combSectionMm2Of(ratedA)
  const code = combCatalogCodeOf(brand, d.mode, d.poles, ratedA)
  const connColor = combConnectorColorOf(c.state)
  const phaseCols = combConnectorPhaseColorsOf(c.state)

  const sx = c.w / d.widthMm
  const sy = c.h / d.heightMm
  const toX = (xMm: number) => (xMm + d.widthMm / 2) * sx
  const toY = (yMm: number) => (d.heightMm / 2 - yMm) * sy

  const isDown = d.teethDirection === 'down'
  const spineTop = toY(d.spineCenterYMm + d.spineHeightMm / 2)
  const spineH = d.spineHeightMm * sy
  const spineLeft = toX(-d.bodyLengthMm / 2)
  const spineW = d.bodyLengthMm * sx
  const capW = d.endCaps ? COMB_BUSBAR.endCapMm * sx : 0
  const spineEdgeY = isDown ? spineTop + spineH : spineTop
  const pinLen = d.pinLengthMm * sy
  const pinW = COMB_BUSBAR.pinWidthMm * sx
  const shW = COMB_BUSBAR.pinShoulderWidthMm * sx
  const brandLabel = brand === 'lexman' ? 'LEXman' : brand === 'sibratec' ? 'SIBRATEC' : brand === 'schneider' ? 'Schneider' : 'legrand'
  const brandInk = brand === 'schneider' ? '#009530' : brand === 'legrand' ? '#d9272e' : '#242930'

  return (
    <g pointerEvents="none" data-comb-busbar={d.mode}>
      <defs>
        <linearGradient id={`${uid}-pvc`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f1f3f5" />
          <stop offset="16%" stopColor="#d9dde2" />
          <stop offset="86%" stopColor="#cdd2d8" />
          <stop offset="100%" stopColor="#b8bec6" />
        </linearGradient>
        <linearGradient id={`${uid}-cu`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#9c4a1f" />
          <stop offset="35%" stopColor="#e3925c" />
          <stop offset="68%" stopColor="#cf753d" />
          <stop offset="100%" stopColor="#8c3f18" />
        </linearGradient>
        <linearGradient id={`${uid}-sn`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#94a3b8" />
          <stop offset="45%" stopColor="#f1f5f9" />
          <stop offset="100%" stopColor="#64748b" />
        </linearGradient>
      </defs>

      {/* Pinos chanfrados de cobre eletrolítico Cu-ETP a passo modular de 18 mm */}
      {d.teeth.map((t) => {
        const cx = toX(t.xMm)
        const tipW = pinW * 0.56
        const cham = pinLen * 0.25
        const pts = isDown
          ? [
              `${cx - pinW / 2},${spineEdgeY}`,
              `${cx + pinW / 2},${spineEdgeY}`,
              `${cx + pinW / 2},${spineEdgeY + pinLen - cham}`,
              `${cx + tipW / 2},${spineEdgeY + pinLen}`,
              `${cx - tipW / 2},${spineEdgeY + pinLen}`,
              `${cx - pinW / 2},${spineEdgeY + pinLen - cham}`,
            ].join(' ')
          : [
              `${cx - pinW / 2},${spineEdgeY}`,
              `${cx - pinW / 2},${spineEdgeY - pinLen + cham}`,
              `${cx - tipW / 2},${spineEdgeY - pinLen}`,
              `${cx + tipW / 2},${spineEdgeY - pinLen}`,
              `${cx + pinW / 2},${spineEdgeY - pinLen + cham}`,
              `${cx + pinW / 2},${spineEdgeY}`,
            ].join(' ')
        return (
          <g key={t.label}>
            {/* Ombro / dobra escalonada na saída do canal */}
            <rect
              x={cx - shW / 2}
              y={isDown ? spineEdgeY - 0.6 : spineEdgeY - 2.4 * sy}
              width={shW}
              height={3.0 * sy}
              fill={`url(#${uid}-cu)`}
              stroke="#78350f"
              strokeWidth={0.45}
            />
            <polygon points={pts} fill={`url(#${uid}-cu)`} stroke="#78350f" strokeWidth={0.55} />
          </g>
        )
      })}

      {/* Perfil isolante em PVC rígido + barreiras escalonadas + serigrafia real */}
      <rect x={spineLeft} y={spineTop} width={spineW} height={spineH} rx={1.6} fill={`url(#${uid}-pvc)`} stroke="#7b838e" strokeWidth={0.85} />
      <line
        x1={spineLeft + 1}
        y1={isDown ? spineTop + 2.4 : spineTop + spineH - 2.4}
        x2={spineLeft + spineW - 1}
        y2={isDown ? spineTop + 2.4 : spineTop + spineH - 2.4}
        stroke="#64748b"
        strokeWidth={0.8}
      />

      {/* Topos isolantes laterais (end caps) */}
      {d.endCaps && (
        <>
          <rect x={0} y={spineTop - 0.3} width={Math.max(1.8, capW)} height={spineH + 0.6} rx={0.8} fill={brand === 'schneider' ? '#eab308' : '#9aa1aa'} stroke={brand === 'schneider' ? '#ca8a04' : '#64748b'} strokeWidth={0.6} />
          <rect x={c.w - Math.max(1.8, capW)} y={spineTop - 0.3} width={Math.max(1.8, capW)} height={spineH + 0.6} rx={0.8} fill={brand === 'schneider' ? '#eab308' : '#9aa1aa'} stroke={brand === 'schneider' ? '#ca8a04' : '#64748b'} strokeWidth={0.6} />
        </>
      )}

      {/* Tampas de proteção amarelas snap-on para dentes de reserva (A9XPT920) */}
      {((c.state.toothCoverCount as number) > 0 || (brand === 'schneider' && d.mode === '1P+N-3P' && d.teeth.length > 6)) && (
        d.teeth.slice(-3).map((t) => {
          const cx = toX(t.xMm)
          return (
            <rect
              key={`cover-${t.label}`}
              x={cx - pinW * 0.72}
              y={isDown ? spineEdgeY : spineEdgeY - pinLen * 0.9}
              width={pinW * 1.44}
              height={pinLen * 0.9}
              rx={1.2}
              fill="#eab308"
              stroke="#ca8a04"
              strokeWidth={0.5}
            />
          )
        })
      )}

      {/* Etiqueta / serigrafia técnica (CE, marca, código, modo, calibre e código de barras) */}
      {spineW >= 78 && (
        <g>
          {brand === 'lexman' && spineW >= 150 && (
            <>
              <rect
                x={spineLeft + spineW * 0.09}
                y={spineTop + (isDown ? 3.4 : spineH * 0.28)}
                width={spineW * 0.4}
                height={spineH * 0.56}
                rx={1.2}
                fill="#ffffff"
                stroke="#cbd5e1"
                strokeWidth={0.5}
              />
              <rect
                x={spineLeft + spineW * 0.1}
                y={spineTop + (isDown ? 3.4 + spineH * 0.32 : spineH * 0.6)}
                width={spineW * 0.12}
                height={spineH * 0.21}
                rx={0.8}
                fill="#e11d48"
              />
              <text
                x={spineLeft + spineW * 0.16}
                y={spineTop + (isDown ? 3.4 + spineH * 0.46 : spineH * 0.74)}
                textAnchor="middle"
                fontSize={Math.max(4.2, spineH * 0.16)}
                fontWeight={700}
                fill="#ffffff"
              >
                {code}
              </text>
            </>
          )}
          <text
            x={spineLeft + 5}
            y={spineTop + (isDown ? spineH * 0.48 : spineH * 0.66)}
            fontSize={Math.max(5.5, spineH * 0.28)}
            fontWeight={800}
            fill="#242930"
          >
            CE
          </text>
          <text
            x={spineLeft + (brand === 'lexman' && spineW >= 150 ? spineW * 0.105 : 22)}
            y={spineTop + (isDown ? spineH * 0.36 : spineH * 0.56)}
            fontSize={Math.max(5.5, spineH * 0.25)}
            fontWeight={800}
            fill={brandInk}
          >
            {brandLabel}
          </text>
          <text
            x={spineLeft + spineW * (brand === 'lexman' && spineW >= 150 ? 0.53 : 0.46)}
            y={spineTop + (isDown ? spineH * 0.45 : spineH * 0.64)}
            fontSize={Math.max(5, spineH * 0.22)}
            fontWeight={700}
            fill="#334155"
          >
            {d.mode} · {ratedA}A · {sectionMm2}mm²
          </text>
        </g>
      )}

      {/* Identificação de fase (L / L1 / L2 / L3 / N) alinhada com cada pino */}
      {d.teeth.map((t) => {
        const cx = toX(t.xMm)
        const text = d.mode === '1P' ? 'L' : d.mode === '1P+N' && t.conductor === 'L1' ? 'L' : t.conductor
        const badgeY = isDown ? spineTop + spineH - 4.8 : spineTop + 4.8
        const col = t.conductor === 'N' ? '#1d63c2' : t.conductor === 'L1' || t.conductor === 'L' ? '#6d3713' : t.conductor === 'L2' ? '#1f242c' : '#475569'
        return (
          <text key={`lbl-${t.label}`} x={cx} y={badgeY} textAnchor="middle" dominantBaseline="central" fontSize={5.2} fontWeight={800} fill={col}>
            {text}
          </text>
        )
      })}

      {/* Conectores de alimentação 6–25 mm² acoplados aos dentes (com cor personalizável) */}
      {d.connectorToothIndices.map((idx) => {
        const t = d.teeth[idx]
        if (!t) return null
        const cx = toX(t.xMm)
        const cw = COMB_CONNECTOR.widthMm * sx * 0.94
        const ch = COMB_CONNECTOR.bodyHeightMm * sy * 0.9
        const cy = isDown ? spineEdgeY + pinLen + ch * 0.34 : spineEdgeY - pinLen - ch * 0.34
        const fill = phaseCols ? COMB_CONDUCTOR_HEX[t.conductor] : connColor
        const bladeY = isDown ? spineEdgeY + 1 : cy - ch / 2 - pinLen * 0.72
        return (
          <g key={`fc-${t.label}`}>
            {/* Pino chato estanhado acoplado ao dente */}
            <rect x={cx - pinW * 0.42} y={bladeY} width={pinW * 0.84} height={pinLen * 0.78} fill={`url(#${uid}-sn)`} stroke="#475569" strokeWidth={0.45} />
            {/* Corpo PA66 colorido + bocal cilíndrico + parafuso Pozidriv */}
            <rect x={cx - cw / 2} y={cy - ch / 2} width={cw} height={ch} rx={2.2} fill={fill} stroke="#64748b" strokeWidth={0.8} />
            <circle cx={cx} cy={cy} r={Math.min(cw, ch) * 0.34} fill={fill} stroke="#475569" strokeWidth={0.75} />
            <circle cx={cx} cy={cy} r={Math.min(cw, ch) * 0.21} fill="#cbd5e1" stroke="#334155" strokeWidth={0.6} />
            <line x1={cx - 2.3} y1={cy} x2={cx + 2.3} y2={cy} stroke="#334155" strokeWidth={0.7} />
            <line x1={cx} y1={cy - 2.3} x2={cx} y2={cy + 2.3} stroke="#334155" strokeWidth={0.7} />
          </g>
        )
      })}
    </g>
  )
}

/** Vista ortográfica frontal 2D realista do conector de alimentação para pente (`combBusbarConnector`). */
function CombConnector2DView({ c, uid }: { c: ElectricalComponent; uid: string }) {
  const color = combConnectorColorOf(c.state)
  const dir = combConnectorPinDirectionOf(c.state)
  const gauge = combConnectorGaugeOf(c.state)
  const stamp = (COMB_CONNECTOR_GAUGES.find((g) => g.id === gauge) ?? COMB_CONNECTOR_GAUGES[1]).stamp
  const isDown = dir === 'down'

  const sx = c.w / COMB_CONNECTOR.widthMm
  const sy = c.h / COMB_CONNECTOR.heightMm
  const bodyH = COMB_CONNECTOR.bodyHeightMm * sy
  const pinH = COMB_CONNECTOR.pinLengthMm * sy
  const bodyY = isDown ? 0.5 : pinH
  const pinY = isDown ? bodyH - 0.5 : 0.5
  const pinW = COMB_CONNECTOR.pinWidthMm * sx
  const shW = COMB_CONNECTOR.shoulderWidthMm * sx
  const cx = c.w / 2
  const collarY = bodyY + bodyH * (isDown ? 0.56 : 0.44)
  const rOut = COMB_CONNECTOR.collarOuterRadiusMm * Math.min(sx, sy)
  const rIn = COMB_CONNECTOR.collarInnerRadiusMm * Math.min(sx, sy)
  const ribCount = 6

  return (
    <g pointerEvents="none" data-comb-connector={color}>
      <defs>
        <linearGradient id={`${uid}-tin`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#94a3b8" />
          <stop offset="42%" stopColor="#f8fafc" />
          <stop offset="72%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#64748b" />
        </linearGradient>
      </defs>

      {/* Pino chato de cobre estanhado com ombro em T e estrias horizontais */}
      <rect
        x={cx - shW / 2}
        y={isDown ? bodyH - 1.2 : pinH - 1.4}
        width={shW}
        height={2.4}
        rx={0.5}
        fill={`url(#${uid}-tin)`}
        stroke="#475569"
        strokeWidth={0.55}
      />
      <rect x={cx - pinW / 2} y={pinY} width={pinW} height={pinH} rx={0.9} fill={`url(#${uid}-tin)`} stroke="#475569" strokeWidth={0.65} />
      {Array.from({ length: ribCount }, (_, i) => {
        const ry = pinY + ((i + 1) / (ribCount + 1)) * pinH
        return <line key={i} x1={cx - pinW * 0.42} y1={ry} x2={cx + pinW * 0.42} y2={ry} stroke="#64748b" strokeWidth={0.55} />
      })}

      {/* Capuz superior escalonado (`6-25□`) + corpo isolante PA66 na cor escolhida */}
      <rect
        x={2.2}
        y={isDown ? bodyY : bodyY + bodyH - 4.8}
        width={c.w - 4.4}
        height={4.8}
        rx={1.8}
        fill={color}
        stroke="#64748b"
        strokeWidth={0.75}
      />
      <rect
        x={0.8}
        y={isDown ? bodyY + 3.4 : bodyY}
        width={c.w - 1.6}
        height={bodyH - 3.6}
        rx={1.6}
        fill={color}
        stroke="#64748b"
        strokeWidth={0.85}
      />

      {/* 4 cavidades quadradas de moldação nos cantos (fiel à foto IMG_5789!) */}
      {[
        [2.4, (isDown ? bodyY + 5.2 : bodyY + 1.8)],
        [c.w - 4.8, (isDown ? bodyY + 5.2 : bodyY + 1.8)],
        [2.4, (isDown ? bodyY + bodyH - 4.2 : bodyY + bodyH - 7.4)],
        [c.w - 4.8, (isDown ? bodyY + bodyH - 4.2 : bodyY + bodyH - 7.4)],
      ].map(([px, py], i) => (
        <rect key={i} x={px} y={py} width={2.3} height={2.3} rx={0.4} fill="#334155" fillOpacity={0.35} />
      ))}

      {/* Bocal cilíndrico IP20 + parafuso Pozidriv M6 no interior */}
      <circle cx={cx} cy={collarY} r={rOut} fill={color} stroke="#475569" strokeWidth={0.85} />
      <circle cx={cx} cy={collarY} r={rIn} fill="#1e293b" stroke="#94a3b8" strokeWidth={0.6} />
      <circle cx={cx} cy={collarY} r={rIn * 0.76} fill="#e2e8f0" stroke="#475569" strokeWidth={0.5} />
      <line x1={cx - rIn * 0.55} y1={collarY} x2={cx + rIn * 0.55} y2={collarY} stroke="#334155" strokeWidth={0.8} />
      <line x1={cx} y1={collarY - rIn * 0.55} x2={cx} y2={collarY + rIn * 0.55} stroke="#334155" strokeWidth={0.8} />

      {/* Gravação de calibre (`6-25□`) */}
      <text
        x={cx}
        y={isDown ? bodyY + 2.7 : bodyY + bodyH - 2.1}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={3.6}
        fontWeight={700}
        fill="#475569"
        fillOpacity={0.85}
      >
        {stamp}
      </text>
    </g>
  )
}
