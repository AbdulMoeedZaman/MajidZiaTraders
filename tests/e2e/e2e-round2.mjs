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
    items: [{ productId: products[0].id, rate: products[0].rate, cartonCount: 1, boxCount: 0 }],
  }), 'next invoice')
  check('X-2', 'Next invoice is numbered INV-000004 (counter persisted through the UI round trip)', next.invoiceNumber === 'INV-000004', next.invoiceNumber)
  await inv('invoices:delete', next.id)

  // X-3: the invoice description setting printed on the sheet in round 1 is still stored
  const desc = must(await inv('settings:get-value', 'invoice_description'), 'desc')
  check('X-3', 'Invoice description saved in the first round is still stored', desc === 'Payment due within 7 days.', desc)

  // X-4: route count reflects the customer added through the UI in round 1
  const routes = must(await inv('routes:list-with-counts'), 'routes')
  const monday = routes.find((r) => r.name === 'Monday')
  check('X-4', 'Monday route customer count matches the two customers created on it (Bilal Auto Shop + UI-added)', monday.customerCount === 2, { monday: monday.customerCount, routeName: monday.name })

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
  check('X-6', 'Round-1 invoice lines wrote sale movements (negative qty, price snapshot, customer name)',
    !!s1 && s1.quantity === -7 && s1.price === 65000 && s1.customerName === 'Bilal Auto Shop' &&
    !!s2 && s2.quantity === -4 &&
    !!sg && sg.quantity === -3,
    stockRows.map((m) => ({ p: m.productName, t: m.type, q: m.quantity, price: m.price, c: m.customerName })))

  // X-7: the UI restock from round 1 persisted as a purchase movement dated today
  const rg = stockRows.find((m) => m.productName === 'GAUGE 2026' && m.type === 'purchase')
  check('X-7', 'UI restock persisted: GAUGE 2026 +50 purchase movement with running balance carried to 47',
    !!rg && rg.quantity === 50 && rg.date === TODAY && rg.previousQuantity === -3 && rg.newQuantity === 47,
    rg ?? null)
} catch (err) {
  console.log('\nSCRIPT STOPPED:', err.message)
  process.exitCode = 1
}
const failed = results.filter((r) => !r.pass)
console.log(`\n==== round 2: ${results.length} checks, ${results.length - failed.length} passed, ${failed.length} failed ====`)
fs.writeFileSync(path.join(S, 'e2e-round2-results.json'), JSON.stringify(results, null, 2))
if (failed.length > 0) process.exitCode = 1
ws.close()