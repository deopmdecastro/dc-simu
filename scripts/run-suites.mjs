#!/usr/bin/env node
/** Executor paralelo de suítes npm: `node scripts/run-suites.mjs [--jobs N] <script...>`.
 * Corre as suítes com concorrência limitada (predefinição: min(4, núcleos)),
 * mantendo o âmbito — todas as suítes correm sempre. O output de cada suíte é
 * bufferizado e só impresso em caso de falha, terminando com um resumo com
 * durações e a lista de falhas. Exit 1 se alguma suíte falhar. */
import { spawn } from 'node:child_process'
import os from 'node:os'

const args = process.argv.slice(2)
let jobs = Math.max(2, Math.min(4, os.availableParallelism()))
while (args[0] === '--jobs') { args.shift(); jobs = Math.max(1, Number(args.shift()) || jobs) }
const suites = args
if (!suites.length) { console.error('uso: node scripts/run-suites.mjs [--jobs N] <npm-script...>'); process.exit(2) }

const started = Date.now()
const results = []
let cursor = 0

async function worker() {
  while (cursor < suites.length) {
    const name = suites[cursor++]
    const t0 = Date.now()
    const output = []
    const code = await new Promise(resolve => {
      // No Windows `npm` é um .cmd: reutilizar o npm-cli.js que lançou este script evita ENOENT sem shell.
      const npmCli = process.env.npm_execpath
      const child = npmCli && /\.c?js$/.test(npmCli)
        ? spawn(process.execPath, [npmCli, 'run', '-s', name], { stdio: ['ignore', 'pipe', 'pipe'] })
        : spawn('npm', ['run', '-s', name], { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' })
      child.stdout.on('data', d => output.push(d))
      child.stderr.on('data', d => output.push(d))
      child.on('close', resolve)
      child.on('error', () => resolve(1))
    })
    const ms = Date.now() - t0
    results.push({ name, code, ms, output: Buffer.concat(output).toString('utf8') })
    if (code === 0) console.log(`PASS — ${name} (${(ms / 1000).toFixed(1)}s)`)
    else {
      console.log(`FAIL — ${name} (${(ms / 1000).toFixed(1)}s)`)
      console.log(results[results.length - 1].output.trim().split('\n').map(l => '  ' + l).join('\n'))
    }
  }
}

await Promise.all(Array.from({ length: Math.min(jobs, suites.length) }, worker))
const failed = results.filter(r => r.code !== 0)
const total = ((Date.now() - started) / 1000).toFixed(1)
console.log(`\n${results.length - failed.length}/${results.length} suítes OK em ${total}s (${jobs} trabalhadores)`)
if (failed.length) {
  console.log('❌ FALHARAM: ' + failed.map(r => r.name).join(', '))
  process.exit(1)
}
console.log('✅ Todas as suítes passaram')
