import { existsSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

if (existsSync(new URL('.env', import.meta.url))) {
  console.log('Ambiente existente preservado.')
} else {
  const secret = () => randomBytes(32).toString('hex')
  writeFileSync(new URL('.env', import.meta.url), [
    'COMPOSE_PROJECT_NAME=n8n-local',
    'N8N_IMAGE=docker.n8n.io/n8nio/n8n@sha256:3db21366be1d3c77c1708963129c051948573019659e8873e0294be035ffc1b2',
    'N8N_SANDBOX_VERSION=1.9.0',
    'SEARXNG_IMAGE=ghcr.io/searxng/searxng@sha256:8bdd9aa136b2dc3b9332cf24714fa34a375b8a1949a1201ec900c24d7378596e',
    `SANDBOX_API_KEYS=${secret()}`,
    `SANDBOX_API_RUNNER_REGISTRATION_TOKEN=${secret()}`,
    `SANDBOX_API_RUNNER_API_KEY=${secret()}`,
    `SEARXNG_SECRET=${secret()}`,
    '',
  ].join('\n'), { mode: 0o600 })
  console.log('Ambiente criado com segredos aleatórios; valores não apresentados.')
}
