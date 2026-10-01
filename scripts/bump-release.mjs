// Carimbo de release: corre no hook pre-commit e muda `release-stamp.json` em CADA commit.
// O carimbo entra no `buildId` (vite.config.ts) e em `version.json`; os navegadores que detetam um
// buildId novo limpam as caches (src/utils/cacheCleanup.ts) e carregam a versão nova.
import { readFileSync, writeFileSync } from 'node:fs'

const file = new URL('../release-stamp.json', import.meta.url)
let previous = { count: 0 }
try { previous = JSON.parse(readFileSync(file, 'utf8')) } catch { /* primeiro carimbo */ }
const next = { count: (Number(previous.count) || 0) + 1, epoch: Date.now().toString(36) }
writeFileSync(file, JSON.stringify(next, null, 2) + '\n')
console.log(`[release] carimbo #${next.count} (${next.epoch}) — as caches dos navegadores serão limpas na próxima visita`)
