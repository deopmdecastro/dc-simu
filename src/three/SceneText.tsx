import { forwardRef, type ComponentProps } from 'react'
import { Text as DreiText } from '@react-three/drei'

/**
 * Fonte local dos rótulos 3D (Inter 600, OFL). Sem `font`, o troika vai buscar
 * dados de fontes à CDN jsdelivr: offline, em PWA ou numa rede com firewall o
 * pedido falha, o Suspense nunca resolve e o editor fica preso a carregar.
 */
export const SCENE_TEXT_FONT = '/fonts/inter-latin-600-normal.woff'

type TextProps = ComponentProps<typeof DreiText>

/** `Text` do drei com a fonte local por omissão. */
export const Text = forwardRef<unknown, TextProps>(function SceneText(props, ref) {
  return <DreiText font={SCENE_TEXT_FONT} {...props} ref={ref as never} />
})
