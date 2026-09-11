// Round-2 retest checks (X-1 … X-9) for MajidZiaTraders, through the real renderer -> preload -> IPC -> SQLite path.
// Runs against an ISOLATED user-data dir; aborts if the test DB is not there.
//
// Usage (never point --user-data-dir at your real data). Requires the `sqlite3` CLI (built into macOS):
//   npm run build
//   TEST_DIR=$(mktemp -d)
//   node_modules/.bin/electron . --remote-debugging-port=9334 --user-data-dir="$TEST_DIR/e2e-userdata" &
//   node tests/e2e/e2e.mjs "$TEST_DIR"          # main suite (44 checks)
//   node tests/e2e/e2e-round2.mjs "$TEST_DIR"   # this suite (9 checks)
//   pkill -f "remote-debugging-port=9334"
// Baseline before round-2 fixes: tests/e2e/baseline-round2-results.json (all 9 failed).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const S = process.argv[2]
if (!S) { console.log('Usage: node tests/e2e/e2e-round2.mjs <TEST_DIR>'); process.exit(1) }
const TESTDIR = path.join(S, 'e2e-userdata')
const FIXTURE_V3 = fileURLToPath(new URL('./fixtures/v3-empty-backup.db', import.meta.url))
const PORT = 9334
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const TODAY = new Date().toLocaleDateString('en-CA')

let page
const deadline = Date.now() + 60000
while (!page && Date.now() < deadline) {
  try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page') } catch {}
  if (!page) await wait(500)
}
if (!page) { console.log('FAIL: app window never appeared'); process.exit(1) }
if (!fs.existsSync(path.join(TESTDIR, 'inventory.db'))) { console.log('ISOLATION FAIL: test DB not found in', TESTDIR, '— aborting'); process.exit(2) }

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const call = (method, params = {}) => new Promise((res) => {
  const my = ++id
  const h = (e) => { const m = JSON.parse(e.data); if (m.id === my) { ws.removeEventListener('message', h); res(m) } }
  ws.addEventListener('message', h); ws.send(JSON.stringify({ id: my, method, params }))
})
const ev = async (expression) => (await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value
const inv = (ch, ...args) => ev(`(async()=>{try{return {ok:true,v:await window.api.invoke(${JSON.stringify(ch)}, ...${JSON.stringify(args)})}}catch(e){return {ok:false,e:String(e.message||e).replace(/^Error invoking remote method '[^']+': (Error: )?/,'')}}})()`)
const must = (r, w) => { if (!r?.ok) throw new Error(`setup "${w}" failed: ${r?.e}`); return r.v }
const results = []
const check = (tid, name, pass, detail) => { results.push({ id: tid, name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} [${tid}] ${name}\n       ${JSON.stringify(detail)}`) }
const qty = async (pid) => must(await inv('inventory:current-quantity', pid), 'qty')
const stamp = Date.now().toString().slice(-6)

try {
  const P = must(await inv('products:create', { sku: 'X-' + stamp, name: 'Extra ' + stamp, baseCostPrice: 500, minSellingPrice: 0, sellingPrice: 1000 }), 'product')
  must(await inv('inventory:set-opening-stock', { productId: P.id, quantity: 100 }), 'opening')
  const C = must(await inv('customers:create', { name: 'Extra Cust ' + stamp }), 'customer')
  const item = (qn, price) => ({ productId: P.id, productName: P.name, productSku: P.sku, quantity: qn, costPriceAtSale: P.baseCostPrice, minSellingPriceAtSale: 0, actualSellingPrice: price })

  // X-1: a payment without an invoice (auto-allocated) is visible on the invoice it paid
  const Ia = must(await inv('invoices:create', { customerId: C.id, date: TODAY, items: [item(2, 1000)] }), 'Ia')
  const gp = must(await inv('payments:create', { customerId: C.id, amount: 500, method: 'cash', paymentDate: TODAY }), 'generic pay')
  const ia = must(await inv('invoices:get-by-id', Ia.id), 'Ia')
  const onInvoice = must(await inv('payments:list-by-invoice', Ia.id), 'list-by-invoice')
  const inList = must(await inv('payments:list'), 'payments').find((p) => p.id === gp.id)
  check('X-1', 'Payment auto-applied to an invoice appears in that invoice\'s Payments list and shows the invoice number',
    onInvoice.some((p) => p.id === gp.id) && !!inList?.invoiceNumber,
    { invoicePaidNow: ia.paid, paymentsListedOnInvoice: onInvoice.length, paymentsListInvoiceColumn: inList?.invoiceNumber ?? null })

  // X-2: discount larger than subtotal
  const big = await inv('invoices:create', { customerId: C.id, date: TODAY, discount: 999999, items: [item(1, 1000)] })
  let x2 = { rejected: !big.ok, error: big.e }
  if (big.ok) {
    const sales = must(await inv('reports:sales', TODAY, TODAY), 'sales')
    x2 = { rejected: false, savedDiscount: big.v.discount, subtotal: big.v.subtotal, total: big.v.total, salesReportRevenueToday: sales.totalRevenue }
    await inv('invoices:cancel', big.v.id)
  }
  check('X-2', 'Invoice with a discount larger than its subtotal is rejected', !big.ok, x2)

  // X-3: invoices:update changing the discount keeps totals consistent (or is refused)
  const Ib = must(await inv('invoices:create', { customerId: C.id, date: TODAY, items: [item(1, 1000)] }), 'Ib')
  const up = await inv('invoices:update', Ib.id, { discount: 500 })
  const ib = must(await inv('invoices:get-by-id', Ib.id), 'Ib')
  check('X-3', 'Changing an invoice discount via invoices:update is refused or recomputes total/outstanding',
    !up.ok || ib.total === 500, { updateAccepted: up.ok, discountNow: ib.discount, totalNow: ib.total, outstandingNow: ib.outstanding })
  await inv('invoices:cancel', Ib.id)

  // X-4: deleting a stock adjustment in the middle of the chain
  const before = await qty(P.id)
  const adj = must(await inv('stock-adjustments:create', { productId: P.id, type: 'correction', quantityAdjustment: -10, reason: 'x4' }), 'adj')
  must(await inv('stock-adjustments:create', { productId: P.id, type: 'correction', quantityAdjustment: -1, reason: 'x4 later' }), 'adj2')
  const del = await inv('stock-adjustments:delete', adj.id)
  const after = await qty(P.id)
  check('X-4', 'Deleting an earlier stock adjustment gives back its quantity (stock = before − 1), or deletion is refused',
    !del.ok ? after === before - 11 : after === before - 1,
    { stockBefore: before, deleteAccepted: del.ok, stockAfterDelete: after, expectedIfDeleted: before - 1 })

  // X-5: customer credit is used by the next invoice
  const C2 = must(await inv('customers:create', { name: 'Credit Cust ' + stamp }), 'C2')
  must(await inv('payments:create', { customerId: C2.id, amount: 700, method: 'cash', paymentDate: TODAY }), 'credit pay')
  const Ic = must(await inv('invoices:create', { customerId: C2.id, date: TODAY, items: [item(1, 1000)] }), 'Ic')
  const ic = must(await inv('invoices:get-by-id', Ic.id), 'Ic')
  const c2 = must(await inv('customers:get-with-balance', C2.id), 'c2')
  check('X-5', 'Existing customer credit is applied to the next invoice (invoice outstanding matches what the customer owes)',
    ic.outstanding === Math.max(0, c2.balance), { invoiceOutstanding: ic.outstanding, customerBalance: c2.balance })

  // X-6: overdue status without visiting the Dashboard
  const Id = must(await inv('invoices:create', { customerId: C.id, date: '2026-08-01', dueDate: '2026-08-10', items: [item(1, 1000)] }), 'Id')
  const listed = must(await inv('invoices:list'), 'list').find((i) => i.id === Id.id)
  check('X-6', 'An invoice created with a past due date shows "overdue" in the invoice list (without visiting the Dashboard)',
    listed?.status === 'overdue', { statusInList: listed?.status })

  // X-7: removed with the CSV tool (no invoice CSV export anymore)

  // X-8: a backup made BEFORE migration 004 (schema v3) is still accepted
  const vv = must(await inv('backup:validate', FIXTURE_V3), 'validate v3')
  check('X-8', 'A backup made with the previous version (before migration 004) is accepted for restore', vv.valid === true, { valid: vv.valid, message: vv.message })

  // X-9: the automatic safety copy taken before a restore contains the latest changes
  const bk = path.join(S, 'x9-backup.db'); if (fs.existsSync(bk)) fs.unlinkSync(bk)
  must(await inv('backup:create', bk), 'backup')
  must(await inv('products:create', { sku: 'SAFETY-' + stamp, name: 'made after backup' }), 'marker')
  const tStart = Date.now()
  must(await inv('backup:restore', bk), 'restore')
  const findCopies = (dir, depth = 0) => {
    if (!fs.existsSync(dir) || depth > 2) return []
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return [] } // skip folders macOS protects
    return entries.flatMap((d) => {
      const p = path.join(dir, d.name)
      if (d.isDirectory()) return findCopies(p, depth + 1)
      try {
        return /before-restore/i.test(d.name) && /\.db$/.test(d.name) && fs.statSync(p).mtimeMs >= tStart - 5000 ? [p] : []
      } catch { return [] }
    })
  }
  const safety = [...findCopies(os.tmpdir()), ...findCopies(TESTDIR)].sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs).pop()
  let hasMarker = null, readError = null
  if (safety) {
    try {
      hasMarker = execSync(`sqlite3 "${safety}" "SELECT COUNT(*) FROM products WHERE sku='SAFETY-${stamp}'"`, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim() === '1'
    } catch (e) {
      hasMarker = false
      readError = String(e.stderr || e.message).trim().split('\n')[0]
    }
  }
  check('X-9', 'Safety copy made before a restore contains the most recent changes (so nothing is lost)', hasMarker === true,
    { safetyCopy: safety ?? 'not found', containsProductCreatedJustBeforeRestore: hasMarker, safetyCopyReadError: readError })
} catch (err) {
  console.log('\nSCRIPT STOPPED:', err.message)
  process.exitCode = 1
}
const failed = results.filter((r) => !r.pass)
console.log(`\n==== round 2: ${results.length} checks, ${results.length - failed.length} passed, ${failed.length} failed ====`)
fs.writeFileSync(path.join(S, 'e2e-round2-results.json'), JSON.stringify(results, null, 2))
if (failed.length > 0) process.exitCode = 1
ws.close()
