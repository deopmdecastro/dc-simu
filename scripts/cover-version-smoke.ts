/** Capa do projeto: versão do enquadramento, capa antiga recapturada e captura só com cabos prontos. */
import assert from 'node:assert/strict'
import {
  COVER_VERSION, captureCover, canCaptureFreshCover, hasStaleCover, hasStoredCover, registerCoverCapture,
  setCoverWiresReady, setStoredCover, storedCoverVersion,
} from '../src/three/coverCapture'

const jpeg = (tag: string) => `data:image/jpeg;base64,${tag}`

// Capa antiga (sem versão): conta como desatualizada e pede recaptura.
setStoredCover(jpeg('OLD'))
assert.equal(hasStoredCover(), false)
assert.equal(hasStaleCover(), true)
assert.equal(storedCoverVersion(), 0)

// Capa da versão atual: não se recaptura.
setStoredCover(jpeg('NEW'), COVER_VERSION)
assert.equal(hasStoredCover(), true)
assert.equal(hasStaleCover(), false)

// Sem capa nenhuma.
setStoredCover(undefined)
assert.equal(hasStoredCover(), false)
assert.equal(storedCoverVersion(), undefined)

// Cena não montada ou cabos por traçar: nunca captura nem dá a capa antiga por fresca.
setStoredCover(jpeg('OLD'), 1)
registerCoverCapture(() => jpeg('FRESH'))
setCoverWiresReady(false)
assert.equal(canCaptureFreshCover(), false)
assert.equal(captureCover(), jpeg('OLD'))
assert.equal(storedCoverVersion(), 1, 'a capa antiga mantém a versão antiga')
assert.equal(hasStoredCover(), false)

// Cabos prontos: captura nova e fica na versão atual.
setCoverWiresReady(true)
assert.equal(canCaptureFreshCover(), true)
assert.equal(captureCover(), jpeg('FRESH'))
assert.equal(storedCoverVersion(), COVER_VERSION)
assert.equal(hasStoredCover(), true)

// Sem cena montada: devolve o último conhecido, sem alterar a versão.
registerCoverCapture(null)
assert.equal(canCaptureFreshCover(), false)
assert.equal(captureCover(), jpeg('FRESH'))

console.log('cover-version: ok')
