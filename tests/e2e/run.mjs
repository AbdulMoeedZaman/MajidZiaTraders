// One-command end-to-end run: builds the app, launches it on a throwaway user-data folder,
// runs both e2e suites against it, then stops it. Your real data is never touched.
//   npm run test:e2e            (add -- --no-build to skip the build)
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electronBinary = require('electron')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' }).status ?? 1

if (!process.argv.includes('--no-build') && run(npmCmd, ['run', 'build']) !== 0) process.exit(1)

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-e2e-'))
console.log(`\nTest data folder: ${testDir}\n`)
const app = spawn(
  electronBinary,
  ['.', '--remote-debugging-port=9334', `--user-data-dir=${path.join(testDir, 'e2e-userdata')}`],
  { cwd: root, stdio: 'ignore' }
)

let failedSuites = 0
try {
  for (const suite of ['tests/e2e/e2e.mjs', 'tests/e2e/e2e-round2.mjs']) {
    if (run(process.execPath, [suite, testDir]) !== 0) failedSuites++
  }
} finally {
  app.kill()
}
console.log(failedSuites ? `\n${failedSuites} suite(s) failed.` : '\nAll e2e suites passed.')
process.exit(failedSuites ? 1 : 0)
