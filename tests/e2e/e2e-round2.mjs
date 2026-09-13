// Round-2 retest checks for MZTraders, through the real renderer -> preload -> IPC -> SQLite path.
// Runs against the SAME isolated user-data dir as the main suite, verifying the data created
// in that suite is still present and behaviour is consistent after UI round trips.
//
// Usage:
//   npm run build
//   TEST_DIR=$(mktemp -d)
//   node_modules/.bin/electron . --remote-debugging-port=9334 --user-data-dir="$TEST_DIR/e2e-userdata" &
//   node tests/e2e/e2e.mjs "$TEST_DIR"          # main suite
//   node tests/e2e/e2e-round2.mjs "$TEST_DIR"   # this suite
//   pkill -f "remote-debugging-port=9334"
import fs from 'node:fs'
import path from 'node:path'

const S = process.argv[2]
if (!S) { console.log('Usage: node tests/e2e/e2e-round2.mjs <TEST_DIR>'); process.exit(1) }
const TESTDIR = path.join(S, 'e2e-userdata')
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
if (!fs.existsSync(path.join(TESTDIR, 'majidzia.db'))) { console.log('ISOLATION FAIL: test DB not found in', TESTDIR, '— aborting'); process.exit(2) }

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

try {
  const invoices = must(await inv('invoices:list'), 'invoices')
  const products = must(await inv('products:list'), 'products')
  const customers = must(await inv('customers:list'), 'customers')

  // X-1: the main suite's data survived both suites
  check('X-1', 'Main suite data is present (3 invoices, products, 3 customers, settings)',
    invoices.length >= 3 && products.length >= 3 && customers.length >= 3,
    { invoices: invoices.length, products: products.length, customers: customers.length })

  // X-1b: stock the product used by the invoices below — round 1 left Axle Bearing 6204 at 45 pcs
  const productsSorted = [...products].sort((a, b) => a.name.localeCompare(b.name))
  const stockLead = productsSorted[0] // 'Axle Bearing 6204' (created first in round 1)
  must(await inv('stock:restock', { productId: stockLead.id, quantity: 3 }), 'stock P1 3 cartons (30 pcs) for round2 invoices')

  // X-2: the invoice numbering counter carried on in the same session after UI-created invoices
  const B = must(await inv('brokers:list'), 'brokers')
  const customerId = invoices[0].customerId
  const next = must(await inv('invoices:create', {
    customerId,
    brokerId: B[0].id,
    date: TODAY,
    filerStatus: 'filer',
    remaining: null,
    tax: null,
    grandTotal: null,
    items: [{ productId: stockLead.id, rate: stockLead.rate, cartonCount: 1, boxCount: 0 }],
  }), 'next invoice')
  check('X-2', 'Next invoice is numbered INV-000004 (counter persisted through the UI round trip)', next.invoiceNumber === 'INV-000004', next.invoiceNumber)
  await inv('invoices:delete', next.id)

  // X-3: the invoice description setting printed on the sheet in round 1 is still stored
  const desc = must(await inv('settings:get-value', 'invoice_description'), 'desc')
  check('X-3', 'Invoice description saved in the first round is still stored', desc === 'Payment due within 7 days.', desc)

  // X-4: route count reflects the customers added through the UI and the Excel import in round 1
  const routes = must(await inv('routes:list-with-counts'), 'routes')
  const monday = routes.find((r) => r.name === 'Monday')
  check('X-4', 'Monday route customer count matches Bilal Auto Shop + UI-added + 2 Excel-imported stores', monday.customerCount === 4, { monday: monday.customerCount, routeName: monday.name })

  // X-5: rate-floor rule holds for the UI-created product (min rate 150)
  const gauge = products.find((p) => p.name === 'GAUGE 2026')
  if (!gauge) throw new Error('GAUGE 2026 product from round 1 missing')
  const lowRate = await inv('invoices:create', {
    customerId,
    brokerId: B[0].id,
    date: TODAY,
    filerStatus: 'filer',
    remaining: null,
    tax: null,
    grandTotal: null,
    items: [{ productId: gauge.id, rate: 149, cartonCount: 1, boxCount: 0 }],
  })
  check('X-5', 'A rate of Rs.1.49 below the UI product\'s min (Rs.1.50) is rejected', !lowRate.ok, lowRate.e ?? 'accepted')

  // X-6: every round-1 invoice line was recorded in the stock ledger as a sale movement
  const stockRows = must(await inv('stock:list'), 'stock list')
  const s1 = stockRows.find((m) => m.productName === 'Axle Bearing 6204' && m.type === 'sale')
  const s2 = stockRows.find((m) => m.productName === 'Valve Spring' && m.type === 'sale')
  const sg = stockRows.find((m) => m.productName === 'GAUGE 2026' && m.type === 'sale')
  check('X-6', 'Round-1 invoice lines wrote sale movements in pieces (negative qty, price snapshot, customer name)',
    !!s1 && s1.quantity === -25 && s1.price === 65000 && s1.customerName === 'Bilal Auto Shop' &&
    !!s2 && s2.quantity === -80 &&
    !!sg && sg.quantity === -36,
    stockRows.map((m) => ({ p: m.productName, t: m.type, q: m.quantity, price: m.price, c: m.customerName })))

  // X-7: the UI restock from round 1 persisted as a purchase movement dated today
  // (50 cartons of the 12/carton GAUGE 2026 → 600 pcs).
  const rg = stockRows.find((m) => m.productName === 'GAUGE 2026' && m.type === 'purchase')
  check('X-7', 'UI restock persisted: GAUGE 2026 +50 cartons (600 pcs) purchase movement with running balance carried to 600',
    !!rg && rg.quantity === 600 && rg.date === TODAY && rg.previousQuantity === 0 && rg.newQuantity === 600,
    rg ?? null)

  // X-8: backup create → validate → restore round trip (data intact, safety copy kept)
  const backupPath = path.join(TESTDIR, 'e2e-backup.db')
  const created = must(await inv('backup:create', backupPath), 'create backup')
  const createdOnDisk = fs.existsSync(created.path) && fs.statSync(created.path).size > 0

  const validated = must(await inv('backup:validate', backupPath), 'validate backup')
  const garbagePath = path.join(TESTDIR, 'not-a-backup.db')
  fs.writeFileSync(garbagePath, 'not a real sqlite file at all')
  const garbage = must(await inv('backup:validate', garbagePath), 'validate garbage')

  const restored = must(await inv('backup:restore', backupPath), 'restore backup')
  const safetyOnDisk = fs.existsSync(restored.safetyPath) && fs.statSync(restored.safetyPath).size > 0

  const invoicesAfter = must(await inv('invoices:list'), 'invoices after restore')
  const stockAfter = must(await inv('stock:list'), 'stock after restore')
  check('X-8', 'Backup create/validate/restore round trip: valid backup, garbage rejected, safety copy saved, data intact after restore',
    createdOnDisk && validated.valid && validated.version === 7 && !garbage.valid &&
    safetyOnDisk && invoicesAfter.length === invoices.length && stockAfter.length === stockRows.length,
    { createdOnDisk, fileBytes: created.size, validation: { valid: validated.valid, version: validated.version }, garbageRejected: { valid: garbage.valid, message: garbage.message }, safetyOnDisk, invoicesAfter: invoicesAfter.length, stockAfter: stockAfter.length })

  // X-9: a backup stamped with a future schema version is rejected
  const { DatabaseSync } = await import('node:sqlite')
  const futurePath = path.join(TESTDIR, 'e2e-newer-version.db')
  fs.copyFileSync(backupPath, futurePath)
  const dup = new DatabaseSync(futurePath)
  dup.exec("INSERT INTO _migrations (version, name) VALUES (999, 'fictional-future')")
  dup.close()
  const future = must(await inv('backup:validate', futurePath), 'validate future backup')
  check('X-9', 'A backup made by a newer app version is rejected with a clear message',
    !future.valid && future.version === 999 && /newer version/.test(future.message), future)

  // X-10: expenses created in round 1 persist on the same day and on a past day
  const todaysExpenses = must(await inv('expenses:list-by-date', TODAY), 'expenses today')
  const pastExpenses = must(await inv('expenses:list-by-date', '2026-01-02'), 'expenses past day')
  const travel = todaysExpenses.find((e) => e.name === 'Travelling')
  const oldTea = pastExpenses.find((e) => e.name === 'Old Tea')
  check('X-10', 'Expenses saved in round 1 persisted (today travelling Rs.75, past-day Old Tea Rs.20)',
    !!travel && travel.price === 7500 && !!oldTea && oldTea.price === 2000,
    { today: todaysExpenses, pastDay: pastExpenses })

  // X-11: payments + cancellation survived the UI round trip and cancel reverses everything
  const now = must(await inv('invoices:list'), 'invoices for payments')
  const paidOne = now.find((i) => i.invoiceNumber === 'INV-000001')
  const paidThree = now.find((i) => i.invoiceNumber === 'INV-000003')
  if (!paidOne || !paidThree) throw new Error('INV-000001 / INV-000003 missing for X-11')
  const p1 = must(await inv('payments:list-by-invoice', paidOne.id), 'payments INV-000001')
  const p3 = must(await inv('payments:list-by-invoice', paidThree.id), 'payments INV-000003')

  const fresh = must(await inv('invoices:create', {
    customerId,
    brokerId: B[0].id,
    date: TODAY,
    filerStatus: 'filer',
    remaining: null,
    tax: null,
    grandTotal: null,
    items: [{ productId: stockLead.id, rate: stockLead.rate, cartonCount: 2, boxCount: 0 }],
  }), 'fresh invoice for cancel')
  await inv('invoices:pay', fresh.id, 5000)
  const cancelled = must(await inv('invoices:cancel', fresh.id), 'cancel fresh invoice')
  const freshPays = must(await inv('payments:list-by-invoice', fresh.id), 'payments after cancel')
  const stockNow = must(await inv('stock:list'), 'stock after cancel')
  const freshSale = stockNow.find((m) => m.type === 'sale' && m.referenceId === fresh.id)
  const freshReturn = stockNow.find((m) => m.type === 'return' && m.referenceId === fresh.id)
  const freshStillThere = (await inv('invoices:list')).v.find((i) => i.id === fresh.id)
  check('X-11', 'Round-1 payments persisted; cancel reverses payments, restocks via a return movement and keeps the cancelled record',
    paidOne.status === 'paid' && paidOne.paidAmount === 162500 &&
    paidThree.status === 'paid' && paidThree.paidAmount === 600 &&
    p1.length === 1 && p1[0].amount === 162500 && p3.length === 1 && p3[0].amount === 600 &&
    cancelled.status === 'cancelled' && cancelled.paidAmount === 0 && freshPays.length === 0 &&
    !!freshSale && freshSale.quantity === -20 &&
    !!freshReturn && freshReturn.quantity === 20 && freshReturn.newQuantity === freshSale.previousQuantity &&
    freshStillThere && freshStillThere.status === 'cancelled',
    { paidOne: { status: paidOne.status, paid: paidOne.paidAmount }, paidThree: { status: paidThree.status, paid: paidThree.paidAmount }, p1, p3, cancelled: { status: cancelled.status, paid: cancelled.paidAmount }, freshPays: freshPays.length, stock: stockNow.filter((m) => m.referenceId === fresh.id).map((m) => ({ t: m.type, q: m.quantity, prev: m.previousQuantity, new: m.newQuantity })) })
} catch (err) {
  console.log('\nSCRIPT STOPPED:', err.message)
  process.exitCode = 1
}
const failed = results.filter((r) => !r.pass)
console.log(`\n==== round 2: ${results.length} checks, ${results.length - failed.length} passed, ${failed.length} failed ====`)
fs.writeFileSync(path.join(S, 'e2e-round2-results.json'), JSON.stringify(results, null, 2))
if (failed.length > 0) process.exitCode = 1
ws.close()