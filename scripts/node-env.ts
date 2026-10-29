/**
 * Ambiente Node para os smoke tests: o GLTFLoader do Three usa `self.URL` ao
 * descodificar imagens embutidas nos GLB (texturas PBR) e `self` não existe em Node.
 * Importar este módulo ANTES de qualquer carregamento de modelos.
 */
const g = globalThis as { self?: unknown }
if (typeof g.self === 'undefined') g.self = globalThis
export {}
