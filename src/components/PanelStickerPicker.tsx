import { useState } from 'react'
import { PANEL_STICKER_PRESETS, type PanelStickerDef } from '../three/panelStickers'
import { IconClose } from '../ui/icons'

export default function PanelStickerPicker({
  onPick,
  onClose,
}: {
  onPick: (sticker: PanelStickerDef) => void
  onClose: () => void
}) {
  const [category, setCategory] = useState<string>('all')
  const [filter, setFilter] = useState('')

  const categories = [
    { id: 'all', label: 'Todos' },
    { id: 'sockets', label: 'Tomadas' },
    { id: 'lighting', label: 'Iluminação' },
    { id: 'appliances', label: 'Eletrodomésticos' },
    { id: 'climate', label: 'Climatização' },
    { id: 'security', label: 'Segurança & Bombas' },
    { id: 'numbers', label: 'Números DIN (1-14)' },
  ]

  const filtered = PANEL_STICKER_PRESETS.filter((p) => {
    if (category !== 'all' && p.category !== category) return false
    if (filter && !p.label.toLowerCase().includes(filter.toLowerCase())) return false
    return true
  })

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Adesivos e Etiquetas de Circuito (Estilo Quadro DIN)</h3>
            <p className="text-xs text-slate-500">Selecione para estampar no aparelho, disjuntor ou porta do quadro</p>
          </div>
          <button
            type="button"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition"
            onClick={onClose}
          >
            <IconClose size={14} />
          </button>
        </div>

        <div className="p-3 border-b border-slate-100 flex items-center gap-2">
          <input
            type="search"
            className="dc-input h-8 text-xs flex-1"
            placeholder="Pesquisar etiqueta (cozinha, sala, ac, bomba, forno...)"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            autoFocus
          />
          <div className="flex items-center gap-1 overflow-x-auto">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`px-2.5 py-1 text-xs rounded-full border whitespace-nowrap transition ${category === c.id ? 'bg-brand-600 text-white border-brand-700 font-semibold' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                onClick={() => setCategory(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 overflow-y-auto grid grid-cols-4 sm:grid-cols-5 gap-2.5 flex-1">
          {filtered.map((s) => {
            const isNum = s.category === 'numbers'
            return (
              <button
                key={s.id}
                type="button"
                className="group flex flex-col items-center justify-center p-2 rounded-lg border border-slate-200 hover:border-brand-500 hover:shadow-md bg-white hover:bg-slate-50/80 transition text-center"
                onClick={() => {
                  onPick(s)
                  onClose()
                }}
              >
                {isNum ? (
                  <div
                    className="w-12 h-12 rounded flex items-center justify-center text-white font-black text-xl shadow-xs"
                    style={{ background: s.bg }}
                  >
                    {s.label}
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-slate-50 border border-slate-200 flex flex-col items-center justify-center text-slate-700 shadow-2xs group-hover:scale-105 transition">
                    <span className="text-xl">
                      {s.icon === 'socket' && '🔌'}
                      {s.icon === 'light' && '💡'}
                      {s.icon === 'gardenlight' && '🏮'}
                      {s.icon === 'ac' && '❄️'}
                      {s.icon === 'oven' && '🍳'}
                      {s.icon === 'cooktop' && '🥘'}
                      {s.icon === 'hood' && '🌪️'}
                      {s.icon === 'waterheater' && '♨️'}
                      {s.icon === 'fridge' && '🧊'}
                      {s.icon === 'washer' && '🫧'}
                      {s.icon === 'gate' && '🚪'}
                      {s.icon === 'garage' && '🚗'}
                      {s.icon === 'fan' && '🌀'}
                      {s.icon === 'wifi' && '📶'}
                      {s.icon === 'floorheat' && '♨️'}
                      {s.icon === 'cctv' && '📹'}
                      {s.icon === 'pump' && '💧'}
                      {s.icon === 'shield' && '🛡️'}
                      {s.icon === 'alarm' && '🚨'}
                      {s.icon === 'intercom' && '🔔'}
                      {s.icon === 'power' && '⏻'}
                    </span>
                  </div>
                )}
                <span className="text-[11px] font-semibold text-slate-700 mt-1.5 leading-tight line-clamp-1 group-hover:text-brand-700">
                  {s.label}
                </span>
                <span className="text-[9px] text-slate-400">{s.categoryName}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
