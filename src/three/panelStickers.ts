/**
 * Catálogo e renderizador de adesivos e etiquetas de sinalização para quadros elétricos
 * e disjuntores DIN (no estilo da imagem 26: tomadas, iluminação, eletrodomésticos,
 * climatização, segurança, videovigilância, bombas e números modulares 1 a 14).
 */

import { faBolt } from '@fortawesome/free-solid-svg-icons/faBolt'
import { faSkullCrossbones } from '@fortawesome/free-solid-svg-icons/faSkullCrossbones'

export interface PanelStickerDef {
  id: string
  category: 'sockets' | 'lighting' | 'appliances' | 'climate' | 'security' | 'numbers'
  categoryName: string
  icon: string
  label: string
  bg?: string
  fg?: string
  accent?: string
}

export const PANEL_STICKER_PRESETS: PanelStickerDef[] = [
  // --- TOMADAS ---
  { id: 'sock_hall', category: 'sockets', categoryName: 'Tomadas', icon: 'socket', label: 'Corredor', bg: '#ffffff', fg: '#1e293b' },
  { id: 'sock_kitchen', category: 'sockets', categoryName: 'Tomadas', icon: 'socket', label: 'Cozinha', bg: '#ffffff', fg: '#1e293b' },
  { id: 'sock_living', category: 'sockets', categoryName: 'Tomadas', icon: 'socket', label: 'Sala', bg: '#ffffff', fg: '#1e293b' },
  { id: 'sock_bed_kids', category: 'sockets', categoryName: 'Tomadas', icon: 'socket', label: 'Quarto Crianças', bg: '#ffffff', fg: '#1e293b' },
  { id: 'sock_bed_main', category: 'sockets', categoryName: 'Tomadas', icon: 'socket', label: 'Quarto Principal', bg: '#ffffff', fg: '#1e293b' },
  { id: 'sock_bath', category: 'sockets', categoryName: 'Tomadas', icon: 'socket', label: 'Casa de Banho', bg: '#ffffff', fg: '#1e293b' },
  { id: 'sock_garage', category: 'sockets', categoryName: 'Tomadas', icon: 'socket', label: 'Garagem', bg: '#ffffff', fg: '#1e293b' },
  { id: 'sock_room1', category: 'sockets', categoryName: 'Tomadas', icon: 'socket', label: 'Quarto 1', bg: '#ffffff', fg: '#1e293b' },
  { id: 'sock_room2', category: 'sockets', categoryName: 'Tomadas', icon: 'socket', label: 'Quarto 2', bg: '#ffffff', fg: '#1e293b' },
  { id: 'sock_room3', category: 'sockets', categoryName: 'Tomadas', icon: 'socket', label: 'Quarto 3', bg: '#ffffff', fg: '#1e293b' },

  // --- ILUMINAÇÃO ---
  { id: 'light_hall', category: 'lighting', categoryName: 'Iluminação', icon: 'light', label: 'Corredor', bg: '#ffffff', fg: '#1e293b', accent: '#f59e0b' },
  { id: 'light_kitchen', category: 'lighting', categoryName: 'Iluminação', icon: 'light', label: 'Cozinha', bg: '#ffffff', fg: '#1e293b', accent: '#f59e0b' },
  { id: 'light_living', category: 'lighting', categoryName: 'Iluminação', icon: 'light', label: 'Sala', bg: '#ffffff', fg: '#1e293b', accent: '#f59e0b' },
  { id: 'light_bed_kids', category: 'lighting', categoryName: 'Iluminação', icon: 'light', label: 'Quarto Crianças', bg: '#ffffff', fg: '#1e293b', accent: '#f59e0b' },
  { id: 'light_bed_main', category: 'lighting', categoryName: 'Iluminação', icon: 'light', label: 'Quarto', bg: '#ffffff', fg: '#1e293b', accent: '#f59e0b' },
  { id: 'light_bath', category: 'lighting', categoryName: 'Iluminação', icon: 'light', label: 'Casa de Banho', bg: '#ffffff', fg: '#1e293b', accent: '#f59e0b' },
  { id: 'light_garage', category: 'lighting', categoryName: 'Iluminação', icon: 'light', label: 'Garagem', bg: '#ffffff', fg: '#1e293b', accent: '#f59e0b' },
  { id: 'light_outdoor', category: 'lighting', categoryName: 'Iluminação', icon: 'gardenlight', label: 'Exterior / Jardim', bg: '#ffffff', fg: '#1e293b', accent: '#f59e0b' },

  // --- ELETRODOMÉSTICOS & UTILIDADES ---
  { id: 'app_ac', category: 'climate', categoryName: 'Climatização', icon: 'ac', label: 'Ar Condicionado', bg: '#ffffff', fg: '#1e293b', accent: '#0284c7' },
  { id: 'app_oven', category: 'appliances', categoryName: 'Eletrodomésticos', icon: 'oven', label: 'Forno Elétrico', bg: '#ffffff', fg: '#1e293b', accent: '#ea580c' },
  { id: 'app_cooktop', category: 'appliances', categoryName: 'Eletrodomésticos', icon: 'cooktop', label: 'Placa / Fogão', bg: '#ffffff', fg: '#1e293b', accent: '#ea580c' },
  { id: 'app_hood', category: 'appliances', categoryName: 'Eletrodomésticos', icon: 'hood', label: 'Exaustor', bg: '#ffffff', fg: '#1e293b', accent: '#64748b' },
  { id: 'app_waterheater', category: 'appliances', categoryName: 'Eletrodomésticos', icon: 'waterheater', label: 'Termoacumulador', bg: '#ffffff', fg: '#1e293b', accent: '#0284c7' },
  { id: 'app_fridge', category: 'appliances', categoryName: 'Eletrodomésticos', icon: 'fridge', label: 'Frigorífico', bg: '#ffffff', fg: '#1e293b', accent: '#0284c7' },
  { id: 'app_washer', category: 'appliances', categoryName: 'Eletrodomésticos', icon: 'washer', label: 'Máq. Lavar Roupa', bg: '#ffffff', fg: '#1e293b', accent: '#0284c7' },
  { id: 'app_gate', category: 'appliances', categoryName: 'Eletrodomésticos', icon: 'gate', label: 'Portão Elétrico', bg: '#ffffff', fg: '#1e293b', accent: '#78716c' },
  { id: 'app_garage', category: 'appliances', categoryName: 'Eletrodomésticos', icon: 'garage', label: 'Porta Garagem', bg: '#ffffff', fg: '#1e293b', accent: '#78716c' },
  { id: 'app_fan', category: 'climate', categoryName: 'Climatização', icon: 'fan', label: 'Ventilação / VMC', bg: '#ffffff', fg: '#1e293b', accent: '#64748b' },
  { id: 'app_wifi', category: 'appliances', categoryName: 'Eletrodomésticos', icon: 'wifi', label: 'Router / Internet', bg: '#ffffff', fg: '#1e293b', accent: '#16a34a' },

  // --- CLIMATIZAÇÃO & AQUECIMENTO ---
  { id: 'clim_floor1', category: 'climate', categoryName: 'Climatização', icon: 'floorheat', label: 'Piso Radiante 1', bg: '#ffffff', fg: '#1e293b', accent: '#ea580c' },
  { id: 'clim_floor2', category: 'climate', categoryName: 'Climatização', icon: 'floorheat', label: 'Piso Radiante 2', bg: '#ffffff', fg: '#1e293b', accent: '#ea580c' },
  { id: 'clim_floor3', category: 'climate', categoryName: 'Climatização', icon: 'floorheat', label: 'Piso Radiante 3', bg: '#ffffff', fg: '#1e293b', accent: '#ea580c' },
  { id: 'clim_floor4', category: 'climate', categoryName: 'Climatização', icon: 'floorheat', label: 'Piso Radiante 4', bg: '#ffffff', fg: '#1e293b', accent: '#ea580c' },

  // --- SEGURANÇA & BOMBAS ---
  { id: 'sec_cctv', category: 'security', categoryName: 'Segurança', icon: 'cctv', label: 'Videovigilância', bg: '#ffffff', fg: '#1e293b', accent: '#0284c7' },
  { id: 'sec_pump', category: 'security', categoryName: 'Segurança', icon: 'pump', label: 'Bomba de Água', bg: '#ffffff', fg: '#1e293b', accent: '#0284c7' },
  { id: 'sec_shield', category: 'security', categoryName: 'Segurança', icon: 'shield', label: 'Segurança Geral', bg: '#ffffff', fg: '#1e293b', accent: '#0f172a' },
  { id: 'sec_alarm', category: 'security', categoryName: 'Segurança', icon: 'alarm', label: 'Alarme Incêndio', bg: '#ffffff', fg: '#1e293b', accent: '#dc2626' },
  { id: 'sec_intercom', category: 'security', categoryName: 'Segurança', icon: 'intercom', label: 'Videoporteiro', bg: '#ffffff', fg: '#1e293b', accent: '#ea580c' },
  { id: 'cmd_power_red', category: 'security', categoryName: 'Segurança', icon: 'power', label: 'Alimentação OFF', bg: '#ffffff', fg: '#1e293b', accent: '#dc2626' },
  { id: 'cmd_power_blue', category: 'security', categoryName: 'Segurança', icon: 'power', label: 'Alimentação ON', bg: '#ffffff', fg: '#1e293b', accent: '#0284c7' },

  // --- NÚMEROS DE CIRCUITO DIN (1 A 14) ---
  { id: 'num_1', category: 'numbers', categoryName: 'Números DIN', icon: 'num', label: '1', bg: '#dc2626', fg: '#ffffff' },
  { id: 'num_2', category: 'numbers', categoryName: 'Números DIN', icon: 'num', label: '2', bg: '#dc2626', fg: '#ffffff' },
  { id: 'num_3', category: 'numbers', categoryName: 'Números DIN', icon: 'num', label: '3', bg: '#dc2626', fg: '#ffffff' },
  { id: 'num_4', category: 'numbers', categoryName: 'Números DIN', icon: 'num', label: '4', bg: '#dc2626', fg: '#ffffff' },
  { id: 'num_5', category: 'numbers', categoryName: 'Números DIN', icon: 'num', label: '5', bg: '#2563eb', fg: '#ffffff' },
  { id: 'num_6', category: 'numbers', categoryName: 'Números DIN', icon: 'num', label: '6', bg: '#2563eb', fg: '#ffffff' },
  { id: 'num_7', category: 'numbers', categoryName: 'Números DIN', icon: 'num', label: '7', bg: '#2563eb', fg: '#ffffff' },
  { id: 'num_8', category: 'numbers', categoryName: 'Números DIN', icon: 'num', label: '8', bg: '#d97706', fg: '#ffffff' },
  { id: 'num_9', category: 'numbers', categoryName: 'Números DIN', icon: 'num', label: '9', bg: '#d97706', fg: '#ffffff' },
  { id: 'num_10', category: 'numbers', categoryName: 'Números DIN', icon: 'num', label: '10', bg: '#d97706', fg: '#ffffff' },
  { id: 'num_11', category: 'numbers', categoryName: 'Números DIN', icon: 'num', label: '11', bg: '#d97706', fg: '#ffffff' },
  { id: 'num_12', category: 'numbers', categoryName: 'Números DIN', icon: 'num', label: '12', bg: '#d97706', fg: '#ffffff' },
  { id: 'num_13', category: 'numbers', categoryName: 'Números DIN', icon: 'num', label: '13', bg: '#d97706', fg: '#ffffff' },
  { id: 'num_14', category: 'numbers', categoryName: 'Números DIN', icon: 'num', label: '14', bg: '#d97706', fg: '#ffffff' },
]

/** Desenha o pictograma vetorial limpo no canvas. */
export function drawStickerIcon(
  ctx: CanvasRenderingContext2D,
  icon: string,
  cx: number,
  cy: number,
  size: number,
  color = '#1e293b',
  accent = '#f59e0b',
) {
  const r = size / 2
  ctx.save()
  ctx.translate(cx, cy)
  ctx.lineWidth = Math.max(2, size * 0.08)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  switch (icon) {
    case 'bolt':
    case 'danger': {
      // Mesmos contornos SVG usados nos controlos da interface, rasterizados
      // apenas para a textura física; nunca dependem de um glifo de emoji.
      const [w, h, , , data] = (icon === 'bolt' ? faBolt : faSkullCrossbones).icon
      const scale = size / Math.max(w, h)
      ctx.scale(scale, scale)
      ctx.translate(-w / 2, -h / 2)
      for (const path of Array.isArray(data) ? data : [data]) ctx.fill(new Path2D(path))
      break
    }

    case 'socket': {
      // Placa exterior quadrada com cantos arredondados
      ctx.fillStyle = '#e2e8f0'
      ctx.beginPath()
      ctx.roundRect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7, r * 0.25)
      ctx.fill()
      ctx.stroke()
      // Encaixe circular interior
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      // Furos do plugue
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(-r * 0.25, 0, r * 0.1, 0, Math.PI * 2)
      ctx.arc(r * 0.25, 0, r * 0.1, 0, Math.PI * 2)
      ctx.fill()
      break
    }

    case 'light': {
      // Lâmpada incandescente / LED âmbar
      ctx.fillStyle = accent
      ctx.beginPath()
      ctx.arc(0, -r * 0.18, r * 0.52, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      // Casquilho
      ctx.fillStyle = '#94a3b8'
      ctx.beginPath()
      ctx.rect(-r * 0.22, r * 0.35, r * 0.44, r * 0.3)
      ctx.fill()
      ctx.stroke()
      break
    }

    case 'gardenlight': {
      // Poste / candeeiro exterior
      ctx.beginPath()
      ctx.moveTo(0, r * 0.8)
      ctx.lineTo(0, -r * 0.4)
      ctx.stroke()
      // Campânula
      ctx.fillStyle = accent
      ctx.beginPath()
      ctx.moveTo(-r * 0.6, -r * 0.1)
      ctx.lineTo(r * 0.6, -r * 0.1)
      ctx.lineTo(0, -r * 0.6)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      break
    }

    case 'ac': {
      // Ar condicionado split
      ctx.fillStyle = '#f1f5f9'
      ctx.beginPath()
      ctx.roundRect(-r * 0.9, -r * 0.45, r * 1.8, r * 0.9, r * 0.15)
      ctx.fill()
      ctx.stroke()
      // Grelhas de saída e linhas de vento
      ctx.beginPath()
      ctx.moveTo(-r * 0.7, r * 0.18)
      ctx.lineTo(r * 0.7, r * 0.18)
      ctx.moveTo(-r * 0.4, r * 0.55)
      ctx.lineTo(-r * 0.2, r * 0.85)
      ctx.moveTo(0, r * 0.55)
      ctx.lineTo(0, r * 0.85)
      ctx.moveTo(r * 0.4, r * 0.55)
      ctx.lineTo(r * 0.2, r * 0.85)
      ctx.stroke()
      break
    }

    case 'oven': {
      // Forno elétrico
      ctx.fillStyle = '#f8fafc'
      ctx.beginPath()
      ctx.roundRect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6, r * 0.15)
      ctx.fill()
      ctx.stroke()
      // Visor de vidro
      ctx.fillStyle = '#334155'
      ctx.beginPath()
      ctx.roundRect(-r * 0.55, -r * 0.25, r * 1.1, r * 0.8, r * 0.1)
      ctx.fill()
      // Puxador
      ctx.beginPath()
      ctx.moveTo(-r * 0.5, -r * 0.45)
      ctx.lineTo(r * 0.5, -r * 0.45)
      ctx.stroke()
      break
    }

    case 'cooktop': {
      // Placa de fogão com 4 discos
      ctx.fillStyle = '#1e293b'
      ctx.beginPath()
      ctx.roundRect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6, r * 0.15)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = accent
      for (const [dx, dy] of [[-r * 0.4, -r * 0.4], [r * 0.4, -r * 0.4], [-r * 0.4, r * 0.4], [r * 0.4, r * 0.4]]) {
        ctx.beginPath()
        ctx.arc(dx, dy, r * 0.2, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }

    case 'hood': {
      // Exaustor
      ctx.fillStyle = '#cbd5e1'
      ctx.beginPath()
      ctx.moveTo(-r * 0.3, -r * 0.8)
      ctx.lineTo(r * 0.3, -r * 0.8)
      ctx.lineTo(r * 0.3, -r * 0.2)
      ctx.lineTo(r * 0.8, r * 0.4)
      ctx.lineTo(-r * 0.8, r * 0.4)
      ctx.lineTo(-r * 0.3, -r * 0.2)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      break
    }

    case 'waterheater': {
      // Termoacumulador cilíndrico
      ctx.fillStyle = '#f1f5f9'
      ctx.beginPath()
      ctx.roundRect(-r * 0.55, -r * 0.85, r * 1.1, r * 1.7, r * 0.35)
      ctx.fill()
      ctx.stroke()
      // Indicador de temperatura
      ctx.fillStyle = accent
      ctx.beginPath()
      ctx.arc(0, -r * 0.2, r * 0.18, 0, Math.PI * 2)
      ctx.fill()
      break
    }

    case 'fridge': {
      // Frigorífico combinado
      ctx.fillStyle = '#f8fafc'
      ctx.beginPath()
      ctx.roundRect(-r * 0.55, -r * 0.9, r * 1.1, r * 1.8, r * 0.15)
      ctx.fill()
      ctx.stroke()
      // Separação congelador / refrigerador
      ctx.beginPath()
      ctx.moveTo(-r * 0.55, -r * 0.2)
      ctx.lineTo(r * 0.55, -r * 0.2)
      ctx.stroke()
      break
    }

    case 'washer': {
      // Máquina de lavar
      ctx.fillStyle = '#f8fafc'
      ctx.beginPath()
      ctx.roundRect(-r * 0.8, -r * 0.85, r * 1.6, r * 1.7, r * 0.15)
      ctx.fill()
      ctx.stroke()
      // Óculo circular
      ctx.fillStyle = '#38bdf8'
      ctx.beginPath()
      ctx.arc(0, r * 0.1, r * 0.42, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      break
    }

    case 'gate': {
      // Portão
      ctx.beginPath()
      ctx.rect(-r * 0.8, -r * 0.7, r * 0.75, r * 1.4)
      ctx.rect(r * 0.05, -r * 0.7, r * 0.75, r * 1.4)
      ctx.moveTo(-r * 0.8, -r * 0.7); ctx.lineTo(-r * 0.05, r * 0.7)
      ctx.moveTo(r * 0.05, -r * 0.7); ctx.lineTo(r * 0.8, r * 0.7)
      ctx.stroke()
      break
    }

    case 'garage': {
      // Porta seccionada
      ctx.beginPath()
      ctx.rect(-r * 0.85, -r * 0.8, r * 1.7, r * 1.6)
      for (const y of [-r * 0.4, 0, r * 0.4]) {
        ctx.moveTo(-r * 0.85, y)
        ctx.lineTo(r * 0.85, y)
      }
      ctx.stroke()
      break
    }

    case 'fan': {
      // Ventilação / VMC
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(-r * 0.6, 0); ctx.lineTo(r * 0.6, 0)
      ctx.moveTo(0, -r * 0.6); ctx.lineTo(0, r * 0.6)
      ctx.stroke()
      break
    }

    case 'wifi': {
      // Router Wi-Fi
      ctx.beginPath()
      ctx.rect(-r * 0.7, r * 0.2, r * 1.4, r * 0.5)
      ctx.fill()
      ctx.stroke()
      // Ondas concêntricas
      ctx.beginPath()
      ctx.arc(0, -r * 0.2, r * 0.35, Math.PI * 1.2, Math.PI * 1.8)
      ctx.arc(0, -r * 0.2, r * 0.6, Math.PI * 1.2, Math.PI * 1.8)
      ctx.stroke()
      break
    }

    case 'floorheat': {
      // Pavimento radiante
      ctx.beginPath()
      ctx.rect(-r * 0.75, r * 0.1, r * 1.5, r * 0.6)
      ctx.stroke()
      // Ondas térmicas
      ctx.beginPath()
      for (const x of [-r * 0.4, 0, r * 0.4]) {
        ctx.moveTo(x, -r * 0.1)
        ctx.quadraticCurveTo(x - r * 0.15, -r * 0.4, x, -r * 0.6)
      }
      ctx.stroke()
      break
    }

    case 'cctv': {
      // Câmara CCTV
      ctx.beginPath()
      ctx.moveTo(-r * 0.6, -r * 0.4)
      ctx.lineTo(r * 0.4, -r * 0.1)
      ctx.lineTo(r * 0.4, r * 0.2)
      ctx.lineTo(-r * 0.6, r * 0.4)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      // Suporte articulado
      ctx.beginPath()
      ctx.moveTo(0, r * 0.15)
      ctx.lineTo(r * 0.3, r * 0.7)
      ctx.lineTo(r * 0.6, r * 0.7)
      ctx.stroke()
      break
    }

    case 'pump': {
      // Eletrobomba / motor de água
      ctx.beginPath()
      ctx.arc(-r * 0.1, 0, r * 0.55, 0, Math.PI * 2)
      ctx.fill()
      ctx.rect(r * 0.2, -r * 0.35, r * 0.55, r * 0.7)
      ctx.fill()
      ctx.stroke()
      break
    }

    case 'shield': {
      // Escudo com relâmpago de proteção
      ctx.beginPath()
      ctx.moveTo(0, -r * 0.8)
      ctx.lineTo(r * 0.7, -r * 0.5)
      ctx.lineTo(r * 0.55, r * 0.4)
      ctx.lineTo(0, r * 0.85)
      ctx.lineTo(-r * 0.55, r * 0.4)
      ctx.lineTo(-r * 0.7, -r * 0.5)
      ctx.closePath()
      ctx.fill()
      // Raio interior branco
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.moveTo(r * 0.1, -r * 0.5)
      ctx.lineTo(-r * 0.25, -r * 0.05)
      ctx.lineTo(0, -r * 0.05)
      ctx.lineTo(-r * 0.15, r * 0.5)
      ctx.lineTo(r * 0.25, 0)
      ctx.lineTo(0, 0)
      ctx.closePath()
      ctx.fill()
      break
    }

    case 'alarm': {
      // Sirene de alarme
      ctx.fillStyle = accent
      ctx.beginPath()
      ctx.arc(0, r * 0.1, r * 0.5, Math.PI, 0)
      ctx.rect(-r * 0.6, r * 0.1, r * 1.2, r * 0.3)
      ctx.fill()
      ctx.stroke()
      // Ondas de som
      ctx.beginPath()
      ctx.arc(0, r * 0.1, r * 0.75, Math.PI * 1.2, Math.PI * 1.8)
      ctx.stroke()
      break
    }

    case 'intercom': {
      // Videoporteiro
      ctx.fillStyle = '#f8fafc'
      ctx.beginPath()
      ctx.roundRect(-r * 0.6, -r * 0.85, r * 1.2, r * 1.7, r * 0.15)
      ctx.fill()
      ctx.stroke()
      // Lente da câmara e botão
      ctx.fillStyle = accent
      ctx.beginPath()
      ctx.arc(0, -r * 0.35, r * 0.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(0, r * 0.35, r * 0.16, 0, Math.PI * 2)
      ctx.fill()
      break
    }

    case 'power': {
      // Símbolo universal de energia / ligar
      ctx.lineWidth = Math.max(3, size * 0.12)
      ctx.strokeStyle = accent
      ctx.beginPath()
      ctx.arc(0, r * 0.1, r * 0.55, -Math.PI * 0.3, Math.PI * 1.3, false)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, -r * 0.65)
      ctx.lineTo(0, -r * 0.05)
      ctx.stroke()
      break
    }

    default:
      break
  }

  ctx.restore()
}

/** Renderiza a etiqueta completa (ícone + texto) para CanvasTexture. */
export function drawCircuitSticker(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sticker: PanelStickerDef,
) {
  ctx.clearRect(0, 0, w, h)

  // Fundo branco ou colorido
  ctx.fillStyle = sticker.bg || '#ffffff'
  ctx.fillRect(0, 0, w, h)

  // Borda suave arredondada
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = Math.max(2, h * 0.02)
  ctx.strokeRect(1, 1, w - 2, h - 2)

  if (sticker.category === 'numbers') {
    // Quadrado de número DIN destacado
    ctx.fillStyle = sticker.bg || '#dc2626'
    const pad = Math.round(Math.min(w, h) * 0.12)
    ctx.fillRect(pad, pad, w - pad * 2, h - pad * 2)
    ctx.fillStyle = sticker.fg || '#ffffff'
    ctx.font = `900 ${Math.round(h * 0.58)}px "Inter", "Arial Black", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(sticker.label, w / 2, h / 2)
    return
  }

  // Desenho do ícone
  const iconSize = Math.round(h * 0.54)
  const iconY = Math.round(h * 0.36)
  drawStickerIcon(ctx, sticker.icon, w / 2, iconY, iconSize, sticker.fg || '#1e293b', sticker.accent || '#f59e0b')

  // Texto da divisão / circuito abaixo do ícone
  ctx.fillStyle = sticker.fg || '#1e293b'
  const fontSize = Math.round(h * 0.22)
  ctx.font = `700 ${fontSize}px "Inter", "Arial", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const textY = Math.round(h * 0.8)

  // Ajuste se o texto for muito longo
  let fitSize = fontSize
  while (ctx.measureText(sticker.label).width > w * 0.9 && fitSize > 8) {
    fitSize -= 1
    ctx.font = `700 ${fitSize}px "Inter", "Arial", sans-serif`
  }
  ctx.fillText(sticker.label, w / 2, textY)
}
