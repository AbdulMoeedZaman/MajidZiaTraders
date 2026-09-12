// Generates sample-data/mztraders-sample.db by running the seed test under Electron's Node
// (node:sqlite is built into Electron) and copying the seeded database out of its temp folder.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const electron = require('electron')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const vitest = path.join(root, 'node_modules/vitest/vitest.mjs')
const out = path.join(root, 'sample-data', 'mztraders-sample.db')

const result = spawnSync(electron, [vitest, 'run', 'sample-data.test.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', SAMPLE_DATA_OUT: out },
})
process.exit(result.status ?? 1)