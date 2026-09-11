// Runs Vitest under Electron's Node so node:sqlite (built into Electron) is available.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const electron = require('electron')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const vitest = path.join(root, 'node_modules/vitest/vitest.mjs')

const result = spawnSync(electron, [vitest, 'run', ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
})
process.exit(result.status ?? 1)
