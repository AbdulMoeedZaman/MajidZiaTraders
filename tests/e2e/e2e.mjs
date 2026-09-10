// End-to-end test of MajidZiaTraders through the real renderer -> preload -> IPC -> SQLite path.
// Runs against an ISOLATED user-data dir; aborts if the test DB is not there.
//
// Usage (never point --user-data-dir at your real data):
//   npm run build
//   TEST_DIR=$(mktemp -d)
//   node_modules/.bin/electron . --remote-debugging-port=9334 --user-data-dir="$TEST_DIR/e2e-userdata" &
//   node tests/e2e/e2e.mjs "$TEST_DIR"
//   pkill -f "remote-debugging-port=9334"
// Results are also written to $TEST_DIR/e2e-results.json. Baseline (before fixes): tests/e2e/baseline-results.json
import fs from 'node:fs'
import path from 'node:path'

const S = process.argv[2]
const TESTDIR = path.join(S, 'e2e-userdata')
const PORT = 9334
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const TODAY = new Date().toLocaleDateString('en-CA') // local YYYY-MM-DD

// ---------- connect ----------
let page
const deadline = Date.now() + 60000
while (!page && Date.now() < deadline) {
  try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page') } catch {}
  if (!page) await wait(500)
}
if (!page) { console.log('FAIL: app window never appeared'); process.exit(1) }
await wait(2500)
const testDb = path.join(TESTDIR, 'inventory.db')
if (!fs.existsSync(testDb)) { console.log('ISOLATION FAIL: test DB not found at', testDb, '— aborting, no tests run'); process.exit(2) }
console.log('Isolation OK — test DB:', testDb, '\n')

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
const exceptions = []
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.method === 'Runtime.exceptionThrown')
    exceptions.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').split('\n')[0])
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
    exceptions.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' ').split('\n')[0])
})
let id = 0
const call = (method, params = {}) => new Promise((res) => {
  const my = ++id
  const h = (e) => { const m = JSON.parse(e.data); if (m.id === my) { ws.removeEventListener('message', h); res(m) } }
  ws.addEventListener('message', h); ws.send(JSON.stringify({ id: my, method, params }))
})
const ev = async (expression) => (await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value
await call('Runtime.enable')

const inv = (ch, ...args) => ev(`(async()=>{try{return {ok:true,v:await window.api.invoke(${JSON.stringify(ch)}, ...${JSON.stringify(args)})}}catch(e){return {ok:false,e:String(e.message||e).replace(/^Error invoking remote method '[^']+': (Error: )?/,'')}}})()`)
const must = (r, what) => { if (!r?.ok) throw new Error(`setup step "${what}" failed: ${r?.e}`); return r.v }

const results = []
const check = (tid, name, pass, detail) => {
  results.push({ id: tid, name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} [${tid}] ${name}\n       ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
}
const qty = async (pid) => {
  const a = await inv('inventory:current-quantity', pid)
  const b = must(await inv('products:list-with-stock'), 'list-with-stock').find((p) => p.id === pid)?.currentStock
  return { single: a.ok ? a.v : 'ERR ' + a.e, list: b }
}

// ---------- UI helpers ----------
const nav = (label) => ev(`(()=>{const b=[...document.querySelectorAll('.nav-item')].find(b=>b.textContent.trim().endsWith(${JSON.stringify(label)})); if(b) b.click(); return !!b})()`)
const clickBtn = (text) => ev(`(()=>{const b=[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()===${JSON.stringify(text)}); if(!b.length) return false; b[0].click(); return true})()`)
const clickRowWith = (text) => ev(`(()=>{const r=[...document.querySelectorAll('tbody tr')].find(r=>r.textContent.includes(${JSON.stringify(text)})); if(!r) return false; r.click(); return true})()`)

try {
  // =============== UI-1: Settings with no business profile ===============
  await nav('Settings'); await wait(900)
  const noProfMsg = await ev(`document.body.innerText.includes('No business profile configured')`)
  await clickBtn('Edit'); await wait(700)
  const modal = await ev(`!!document.querySelector('.modal')`)
  check('UI-1', 'Settings → Edit opens the business-profile form on a fresh install', modal, { noProfileMessageShown: noProfMsg, formOpened: modal })
  await nav('Dashboard'); await wait(500)

  // =============== Setup + validation ===============
  const cat = must(await inv('categories:create', { name: 'Hardware' }), 'category')
  const dupCat = await inv('categories:create', { name: 'Hardware' })
  check('V-1', 'Duplicate category name rejected', !dupCat.ok, dupCat.e ?? 'accepted')

  const P1 = must(await inv('products:create', { sku: 'P1', name: 'Widget', categoryId: cat.id, baseCostPrice: 1000, minSellingPrice: 1200, sellingPrice: 1500, reorderLevel: 5 }), 'P1')
  const P2 = must(await inv('products:create', { sku: 'P2', name: 'Gadget', baseCostPrice: 500, minSellingPrice: 0, sellingPrice: 800 }), 'P2')
  const v2 = await inv('products:create', { sku: 'X1', name: 'x', minSellingPrice: 1000, sellingPrice: 500 })
  const v3 = await inv('products:create', { sku: 'X2', name: 'x', baseCostPrice: -1 })
  const v4 = await inv('products:create', { sku: 'P1', name: 'dup' })
  const v5 = await inv('products:create', { sku: 'X3', name: 'x', piecesPerCarton: 0 })
  check('V-2', 'Product validation (sell<min, negative cost, duplicate SKU, carton 0) all rejected', !v2.ok && !v3.ok && !v4.ok && !v5.ok, [v2.e, v3.e, v4.e, v5.e])
  const v6 = await inv('products:create', { sku: 'X4', name: 'fractional cents', sellingPrice: 1234.5 })
  check('V-3', 'Non-whole-cent prices rejected by backend', !v6.ok, v6.ok ? `accepted, stored sellingPrice=${v6.v.sellingPrice}` : v6.e)
  if (v6.ok) await inv('products:delete', v6.v.id)

  const C1 = must(await inv('customers:create', { name: 'Alice', phone: '+92 300 1234567', email: 'a@x.com' }), 'C1')
  const C2 = must(await inv('customers:create', { name: 'Bob' }), 'C2')
  const c3 = await inv('customers:create', { name: 'Alice' })
  const c4 = await inv('customers:create', { name: 'Carl', phone: '+92 300 1234567' })
  const c5 = await inv('customers:create', { name: 'Dan', email: 'bad-email' })
  const c6 = await inv('customers:create', { name: 'Eve', phone: '123' })
  check('V-4', 'Customer validation (dup name, dup phone, bad email, short phone) all rejected', !c3.ok && !c4.ok && !c5.ok && !c6.ok, [c3.e, c4.e, c5.e, c6.e])

  // =============== Stock integrity ===============
  let expectP1 = 100
  must(await inv('inventory:set-opening-stock', { productId: P1.id, quantity: 100 }), 'opening P1')
  must(await inv('stock-adjustments:create', { productId: P1.id, type: 'correction', quantityAdjustment: -10, reason: 'count' }), 'adj1'); expectP1 -= 10
  must(await inv('stock-adjustments:create', { productId: P1.id, type: 'damage', quantityAdjustment: -5, reason: 'broken' }), 'adj2'); expectP1 -= 5
  let q = await qty(P1.id)
  const mv = must(await inv('inventory:list-movements', P1.id), 'movements')
  check('S-1', `Stock after opening 100, −10, −5 in quick succession = ${expectP1}`, q.single === expectP1 && q.list === expectP1,
    { currentQuantity: q.single, listWithStock: q.list, movements: mv.map((m) => `${m.type} ${m.quantity > 0 ? '+' : ''}${m.quantity} (${m.previousQuantity}→${m.newQuantity}) @${m.createdAt}`) })
  const neg = await inv('stock-adjustments:create', { productId: P1.id, type: 'loss', quantityAdjustment: -100000, reason: 'x' })
  check('S-2', 'Adjustment below zero rejected', !neg.ok, neg.e ?? 'accepted')
  must(await inv('inventory:set-opening-stock', { productId: P2.id, quantity: 50 }), 'opening P2')

  // =============== Invoices ===============
  const item = (p, qn, price) => ({ productId: p.id, productName: p.name, productSku: p.sku, quantity: qn, costPriceAtSale: p.baseCostPrice, minSellingPriceAtSale: p.minSellingPrice, actualSellingPrice: price })
  const noProf = await inv('invoices:create', { customerId: C1.id, date: TODAY, items: [item(P2, 1, 800)] })
  check('I-0', 'Invoice can be created on a fresh install (before any business profile exists)', noProf.ok, noProf.e ?? 'ok')
  if (noProf.ok) await inv('invoices:delete', noProf.v.id)
  must(await inv('business-profile:update', { name: 'Test Biz', taxRate: 10, invoicePrefix: 'INV-', currency: 'PKR' }), 'profile')

  const I1 = must(await inv('invoices:create', { customerId: C1.id, date: TODAY, taxRate: 10, discount: 1000, items: [item(P1, 10, 1500)] }), 'I1'); expectP1 -= 10
  const formTax = Math.round((15000 - 1000) * 0.10), formTotal = 15000 - 1000 + formTax
  check('I-1', 'Saved tax & total equal what the New-invoice form displayed (form taxes subtotal − discount)', I1.taxAmount === formTax && I1.total === formTotal,
    { formShowed: { tax: formTax, total: formTotal }, saved: { subtotal: I1.subtotal, discount: I1.discount, tax: I1.taxAmount, total: I1.total } })
  const trueProfit = 15000 - 1000 - 10000
  check('I-2', 'Invoice profit = (subtotal − discount) − cost, i.e. excludes tax', I1.totalProfit === trueProfit, { expected: trueProfit, saved: I1.totalProfit })
  q = await qty(P1.id)
  check('S-3', `Invoice reduces stock (expect ${expectP1})`, q.single === expectP1 && q.list === expectP1, q)

  const I2 = must(await inv('invoices:create', { customerId: C2.id, date: TODAY, items: [item(P1, 3, 1500), item(P1, 2, 1500)] }), 'I2'); expectP1 -= 5
  q = await qty(P1.id)
  check('S-4', `Same product on two invoice lines deducts both (expect ${expectP1})`, q.single === expectP1 && q.list === expectP1, q)

  const g1 = await inv('invoices:create', { customerId: C1.id, date: TODAY, items: [item(P1, 100000, 1500)] })
  const g2 = await inv('invoices:create', { customerId: C1.id, date: TODAY, items: [item(P1, 1, 1100)] })
  const g3 = await inv('invoices:create', { customerId: C1.id, date: TODAY, taxRate: 150, items: [item(P1, 1, 1500)] })
  must(await inv('products:set-active', P2.id, false), 'deact P2')
  const g4 = await inv('invoices:create', { customerId: C1.id, date: TODAY, items: [item(P2, 1, 800)] })
  must(await inv('products:set-active', P2.id, true), 'react P2')
  must(await inv('customers:set-active', C2.id, false), 'deact C2')
  const g5 = await inv('invoices:create', { customerId: C2.id, date: TODAY, items: [item(P2, 1, 800)] })
  must(await inv('customers:set-active', C2.id, true), 'react C2')
  check('I-3', 'Invoice guards: oversell, below-min price, tax 150%, inactive product, inactive customer all rejected', [g1, g2, g3, g4, g5].every((r) => !r.ok), [g1, g2, g3, g4, g5].map((r) => r.e ?? 'ACCEPTED'))

  // =============== Payments ===============
  const pay1 = must(await inv('payments:create', { customerId: C1.id, invoiceId: I1.id, amount: 5000, method: 'cash', paymentDate: TODAY }), 'pay1')
  let i1 = must(await inv('invoices:get-by-id', I1.id), 'get I1')
  check('P-1', 'Partial payment → status "partial", outstanding reduced', i1.status === 'partial' && i1.outstanding === I1.total - 5000, { status: i1.status, outstanding: i1.outstanding })
  const over = await inv('payments:create', { customerId: C1.id, invoiceId: I1.id, amount: I1.total, method: 'cash', paymentDate: TODAY })
  check('P-2', 'Overpayment on an invoice rejected', !over.ok, over.e ?? 'accepted')
  const pay2 = must(await inv('payments:create', { customerId: C1.id, invoiceId: I1.id, amount: i1.outstanding, method: 'bank_transfer', paymentDate: TODAY }), 'pay2')
  i1 = must(await inv('invoices:get-by-id', I1.id), 'get I1')
  check('P-3', 'Paying the rest → status "paid", outstanding 0', i1.status === 'paid' && i1.outstanding === 0, { status: i1.status, outstanding: i1.outstanding })
  must(await inv('payments:delete', pay2.id), 'del pay2')
  i1 = must(await inv('invoices:get-by-id', I1.id), 'get I1')
  check('P-4', 'Deleting a payment recomputes invoice (back to partial)', i1.status === 'partial' && i1.paid === 5000, { status: i1.status, paid: i1.paid })
  const balBefore = must(await inv('customers:get-with-balance', C1.id), 'bal')
  must(await inv('payments:create', { customerId: C1.id, amount: 1000, method: 'cash', paymentDate: TODAY }), 'generic')
  const balAfter = must(await inv('customers:get-with-balance', C1.id), 'bal')
  i1 = must(await inv('invoices:get-by-id', I1.id), 'get I1')
  check('P-5', 'A payment without an invoice is applied to the customer\'s open invoices', i1.paid > 5000,
    { customerOutstandingBefore: balBefore.outstanding, customerOutstandingAfter: balAfter.outstanding, invoiceOutstandingAfter: i1.outstanding, note: 'balance drops but the invoice stays unpaid' })

  // =============== Cancel / delete ===============
  const cx1 = await inv('invoices:cancel', I1.id)
  check('C-1', 'Cancelling an invoice that has payments is rejected', !cx1.ok, cx1.e ?? 'accepted')
  must(await inv('invoices:cancel', I2.id), 'cancel I2'); expectP1 += 5
  q = await qty(P1.id)
  const bobBal = must(await inv('customers:get-with-balance', C2.id), 'bob')
  check('C-2', `Cancel restores stock (expect ${expectP1}) and removes the customer charge`, q.single === expectP1 && q.list === expectP1 && bobBal.balance === 0, { stock: q, bobBalance: bobBal.balance })
  const payCancelled = await inv('payments:create', { customerId: C2.id, invoiceId: I2.id, amount: 100, method: 'cash', paymentDate: TODAY })
  check('C-3', 'Payment on a cancelled invoice rejected', !payCancelled.ok, payCancelled.e ?? 'accepted')

  // =============== Overdue ===============
  const I3 = must(await inv('invoices:create', { customerId: C1.id, date: '2026-08-01', dueDate: '2026-08-15', items: [item(P2, 1, 800)] }), 'I3')
  must(await inv('dashboard:overview'), 'dashboard')
  const i3 = must(await inv('invoices:get-by-id', I3.id), 'I3')
  check('O-1', 'Unpaid invoice past its due date becomes "overdue"', i3.status === 'overdue', i3.status)

  // =============== Restocks ===============
  const R1 = must(await inv('restocks:create', { supplierName: 'Acme', date: TODAY, items: [{ productId: P1.id, unit: 'piece', quantity: 20, unitCost: 900 }] }), 'R1')
  const rdup = await inv('restocks:create', { supplierName: 'Acme', date: TODAY, items: [{ productId: P1.id, quantity: 1, unitCost: 1 }, { productId: P1.id, quantity: 1, unitCost: 1 }] })
  check('R-1', 'Same product twice in one restock rejected', !rdup.ok, rdup.e ?? 'accepted')
  const R1u = must(await inv('restocks:update', R1.id, { items: [{ productId: P1.id, unit: 'piece', quantity: 25, unitCost: 900 }] }), 'R1 update')
  check('R-2', 'Editing a pending restock updates its total cost', R1u.totalCost === 25 * 900, R1u.totalCost)
  must(await inv('restocks:mark-received', R1.id), 'receive'); expectP1 += 25
  q = await qty(P1.id)
  check('R-3', `Mark received adds stock (expect ${expectP1})`, q.single === expectP1 && q.list === expectP1, q)
  const rdel = await inv('restocks:delete', R1.id), rcan = await inv('restocks:cancel', R1.id)
  check('R-4', 'Received restock cannot be deleted or cancelled', !rdel.ok && !rcan.ok, [rdel.e, rcan.e])
  const P1after = must(await inv('products:get-by-id', P1.id), 'P1')
  check('R-5', 'Receiving a restock at a new unit cost updates the product cost price', P1after.baseCostPrice === 900, { unitCostReceived: 900, productBaseCostPrice: P1after.baseCostPrice })

  // =============== Deletion integrity ===============
  const P3 = must(await inv('products:create', { sku: 'P3', name: 'Temp', baseCostPrice: 100, sellingPrice: 200 }), 'P3')
  must(await inv('inventory:set-opening-stock', { productId: P3.id, quantity: 10 }), 'opening P3')
  const I4 = must(await inv('invoices:create', { customerId: C1.id, date: TODAY, items: [item(P3, 2, 200)] }), 'I4')
  const itemsBefore = must(await inv('invoices:get-items', I4.id), 'items').length
  const pdel = await inv('products:delete', P3.id)
  const itemsAfter = must(await inv('invoices:get-items', I4.id), 'items').length
  const i4 = must(await inv('invoices:get-by-id', I4.id), 'I4')
  check('D-1', 'Deleting a sold product is blocked, or at least keeps its past invoice lines', !pdel.ok || itemsAfter === itemsBefore,
    { deleteAllowed: pdel.ok, invoiceLinesBefore: itemsBefore, invoiceLinesAfter: itemsAfter, invoiceTotalStillCharged: i4.total })
  const cdel = await inv('customers:delete', C1.id)
  const catdel = await inv('categories:delete', cat.id)
  check('D-2', 'Customer with history and category with products cannot be deleted', !cdel.ok && !catdel.ok, [cdel.e, catdel.e])

  // =============== Reports ===============
  const sales = must(await inv('reports:sales', '2026-08-01', TODAY), 'sales')
  const itemProfit = sales.items.reduce((s, i) => s + i.profit, 0)
  const itemRevenue = sales.items.reduce((s, i) => s + i.revenue, 0)
  check('RP-1', 'Sales report: product rows add up to the summary cards', itemProfit === sales.totalProfit && itemRevenue === sales.totalRevenue,
    { summary: { revenue: sales.totalRevenue, profit: sales.totalProfit }, sumOfRows: { revenue: itemRevenue, profit: itemProfit } })
  const invRep = must(await inv('reports:inventory'), 'inv report')
  const costSum = invRep.items.reduce((s, i) => s + i.costValue, 0)
  check('RP-2', 'Inventory report: card "Stock value (cost)" really is valued at cost', invRep.totalValue === costSum, { cardValue: invRep.totalValue, sumAtCost: costSum })
  const smr = must(await inv('reports:stock-movements', '2026-08-01', TODAY), 'sm report')
  check('RP-3', 'Stock-movements report: "Outbound units" is a positive count', smr.outbound >= 0, { inbound: smr.inbound, outbound: smr.outbound })
  const pl = must(await inv('reports:profit-loss', '2026-08-01', TODAY), 'pl')
  const periodInvoices = must(await inv('invoices:list-between', '2026-08-01', TODAY), 'invoices in period').filter((i) => i.status !== 'cancelled')
  const netRevenue = periodInvoices.reduce((s, i) => s + i.subtotal - i.discount, 0)
  check('RP-4', 'Profit & Loss: revenue excludes tax (subtotal − discount) and gross profit = revenue − cost of goods',
    pl.totalRevenue === netRevenue && pl.grossProfit === pl.totalRevenue - pl.totalCostOfGoods,
    { expectedNetRevenue: netRevenue, revenue: pl.totalRevenue, cogs: pl.totalCostOfGoods, gross: pl.grossProfit, expenses: pl.expenses, net: pl.netProfit })

  // =============== CSV ===============
  const csvPath = path.join(S, 'e2e-products.csv')
  fs.writeFileSync(csvPath, [
    'sku,name,category,unit,piecesPerCarton,baseCostPrice,minSellingPrice,sellingPrice,reorderLevel',
    'CSV-1,Csv Good,Imported Cat,piece,10,1.00,1.50,2.00,5',
    'CSV-2,Csv BadPrice,Imported Cat,piece,10,abc,1.50,2.00,5',
    'CSV-1,Csv Dup,Imported Cat,piece,10,1.00,1.50,2.00,5',
  ].join('\n'))
  const prev = must(await inv('csv:preview', { filePath: csvPath, delimiter: ',', hasHeader: true }), 'preview')
  const imp = must(await inv('csv:import', { entityType: 'products', filePath: csvPath, delimiter: ',', hasHeader: true, encoding: 'utf8', columnMappings: prev.columns.map((c) => ({ sourceColumn: c, targetField: c })) }), 'import')
  const bad = (await inv('products:get-by-sku', 'CSV-2')).v
  check('CSV-1', 'CSV import: a row with an invalid price is skipped (not imported)', !bad && imp.imported + imp.skipped === imp.totalRows,
    { totalRows: imp.totalRows, imported: imp.imported, skipped: imp.skipped, duplicates: imp.duplicates, badRowProductCreated: !!bad, badRowPrices: bad && { cost: bad.baseCostPrice, sell: bad.sellingPrice }, errors: imp.errors })
  const good = (await inv('products:get-by-sku', 'CSV-1')).v
  const expPath = path.join(S, 'e2e-export-products.csv')
  must(await inv('csv:export', { entityType: 'products', filePath: expPath, delimiter: ',', encoding: 'utf8', includeHeaders: true,
    columns: ['sku', 'name', 'category', 'unit', 'baseCostPrice', 'minSellingPrice', 'sellingPrice', 'reorderLevel', 'currentStock', 'isActive'], filters: {} }), 'export')
  const expLines = fs.readFileSync(expPath, 'utf8').split(/\r?\n/)
  const csvRow = expLines.find((l) => l.startsWith('CSV-1')) ?? ''
  check('CSV-2', 'CSV export writes prices in the same units the import expects (e.g. 2.00, not 200)', /,2(\.00?)?,/.test(csvRow) && !/,200,/.test(csvRow),
    { importedSellingPriceCents: good?.sellingPrice, exportHeader: expLines[0], exportRow: csvRow })

  // =============== More UI checks ===============
  // UI-2 invoice default tax + currency
  await nav('Invoices'); await wait(900)
  await clickBtn('+ New invoice'); await wait(700)
  const taxDefault = await ev(`(()=>{const l=[...document.querySelectorAll('label.field')].find(l=>l.textContent.includes('Tax rate')); return l?.querySelector('input')?.value})()`)
  check('UI-2', 'New invoice form pre-fills the business profile default tax rate (10%)', taxDefault === '10', { taxRateFieldValue: taxDefault })
  await clickBtn('Cancel'); await wait(300)
  const dollars = await ev(`document.body.innerText.includes('$')`)
  check('UI-3', 'Money uses the business profile currency (PKR), not "$"', !dollars, { dollarSignShown: dollars })

  // UI-4 product detail refresh after Deactivate
  await nav('Products'); await wait(900)
  await clickRowWith('Widget'); await wait(500)
  await clickBtn('Deactivate'); await wait(1200)
  const detail = await ev(`document.querySelector('.detail')?.innerText ?? ''`)
  const dbState = must(await inv('products:get-by-id', P1.id), 'P1').isActive
  check('UI-4', 'Product details panel refreshes after Deactivate', /Reactivate/.test(detail) && /Status\s*Inactive/.test(detail),
    { savedIsActive: dbState, panelShowsButton: (detail.match(/Deactivate|Reactivate/) || [])[0], panelShowsStatus: (detail.match(/Status\s*(Active|Inactive)/) || [])[1] })
  await inv('products:set-active', P1.id, true)

  // UI-5 time display in stock history
  await nav('Inventory'); await wait(900)
  await ev(`(()=>{const r=[...document.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('Widget')); [...r.querySelectorAll('button')].find(b=>b.textContent.trim()==='History').click()})()`)
  await wait(900)
  const firstTime = await ev(`document.querySelector('.history tbody tr td')?.innerText`)
  const nowLocal = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  check('UI-5', 'Stock history shows local time (movement just created ≈ now)', !!firstTime && firstTime.includes(nowLocal.slice(0, 2)),
    { shown: firstTime, localTimeNow: nowLocal })
  await ev(`document.querySelector('.overlay')?.click()`); await wait(300)

  // UI-6 reports default range
  await nav('Reports'); await wait(1200)
  const range = await ev(`[...document.querySelectorAll('input[type=date]')].map(i=>i.value)`)
  const monthStart = TODAY.slice(0, 8) + '01'
  check('UI-6', `Reports default "From" date is the 1st of this month (${monthStart})`, range?.[0] === monthStart, { from: range?.[0], to: range?.[1] })

  // UI-7 delete a payment from the invoice details page
  await nav('Invoices'); await wait(900)
  await clickRowWith(I1.invoiceNumber); await wait(1200)
  const exBefore = exceptions.length
  await clickBtn('Delete'); await wait(200); await clickBtn('Confirm'); await wait(1500)
  const rootLen = await ev(`document.getElementById('root')?.innerHTML.length ?? 0`)
  const paymentsLeft = must(await inv('payments:list-by-invoice', I1.id), 'pays').length
  check('UI-7', 'Deleting a payment on the Invoice details page works without crashing the screen', exceptions.length === exBefore && rootLen > 100,
    { newExceptions: exceptions.slice(exBefore), screenHtmlLength: rootLen, paymentsLeftOnInvoice: paymentsLeft })
  await call('Page.reload'); await wait(2500)

  // =============== Backup / restore (last: may break the app) ===============
  const bpath = path.join(S, 'e2e-backup.db'); if (fs.existsSync(bpath)) fs.unlinkSync(bpath)
  const bk = await inv('backup:create', bpath)
  check('BK-1', 'Create backup', bk.ok, bk.ok ? { fileName: bk.v.fileName, size: bk.v.size } : bk.e)
  const val = must(await inv('backup:validate', bpath), 'validate')
  const junkPath = path.join(S, 'e2e-not-a-backup.db'); fs.writeFileSync(junkPath, 'this is not a database')
  const junk = must(await inv('backup:validate', junkPath), 'validate junk')
  check('BK-2', 'Backup validation: a real backup is valid, a non-database file is rejected with a message (Settings must read valid/message)',
    val.valid === true && junk.valid === false && !!junk.message, { goodBackup: { valid: val.valid, message: val.message }, junkFile: { valid: junk.valid, message: junk.message } })
  const rs = await inv('backup:restore', bpath)
  const afterRestore = await inv('products:list')
  check('BK-3', 'App keeps working after restoring a backup (no restart needed)', rs.ok && afterRestore.ok, { restore: rs.ok ? rs.v.message : rs.e, productsListAfter: afterRestore.ok ? `${afterRestore.v.length} products` : afterRestore.e })
} catch (err) {
  console.log('\nSCRIPT STOPPED:', err.message)
  process.exitCode = 1
}

const failed = results.filter((r) => !r.pass)
console.log(`\n==== ${results.length} checks: ${results.length - failed.length} passed, ${failed.length} failed ====`)
console.log('Failed:', failed.map((f) => f.id).join(', '))
console.log('Renderer exceptions seen:', exceptions.length ? [...new Set(exceptions)].join(' | ') : 'none')
fs.writeFileSync(path.join(S, 'e2e-results.json'), JSON.stringify({ results, exceptions }, null, 2))
if (failed.length > 0 || exceptions.length > 0) process.exitCode = 1
ws.close()
