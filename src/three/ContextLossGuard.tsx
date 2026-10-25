import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'

/** Deteta a perda de contexto WebGL (comum em telemóveis e com muitos separadores) e avisa o ecrã.
 *  Sem `preventDefault` o browser nunca restaura o contexto e o canvas fica preto para sempre. */
export function ContextLossGuard({ onChange }: { onChange: (lost: boolean) => void }) {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const el = gl.domElement
    const lost = (event: Event) => { event.preventDefault(); onChange(true) }
    const restored = () => { onChange(false); invalidate() }
    el.addEventListener('webglcontextlost', lost)
    el.addEventListener('webglcontextrestored', restored)
    return () => { el.removeEventListener('webglcontextlost', lost); el.removeEventListener('webglcontextrestored', restored) }
  }, [gl, invalidate, onChange])
  return null
}

/** Aviso sobreposto ao canvas enquanto o contexto WebGL está perdido. */
export function ContextLossNotice({ lost }: { lost: boolean }) {
  if (!lost) return null
  return <div role="alert" style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, textAlign: 'center', background: 'rgba(15,23,42,.72)', color: '#fff', fontSize: 13 }}>
    <span><b>A visualização 3D perdeu o contexto gráfico.</b><br />O browser vai tentar recuperá-lo automaticamente. Se não voltar, feche outros separadores com 3D e recarregue a página — o seu projeto não foi alterado.</span>
  </div>
}
