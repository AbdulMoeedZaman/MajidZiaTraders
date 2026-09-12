// End-to-end test of MZTraders through the real renderer -> preload -> IPC -> SQLite path.
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
  const P1 = must(await inv('products:create', { sku: 'P1', name: 'Widget', minSellingPrice: 1200, sellingPrice: 1500 }), 'P1')
  const P2 = must(await inv('products:create', { sku: 'P2', name: 'Gadget', minSellingPrice: 0, sellingPrice: 800 }), 'P2')
  const v2 = await inv('products:create', { sku: 'X1', name: 'x', minSellingPrice: 1000, sellingPrice: 500 })
  const v3 = await inv('products:create', { sku: 'X2', name: 'x', minSellingPrice: -1 })
  const v4 = await inv('products:create', { sku: 'P1', name: 'dup' })
  const v5 = await inv('products:create', { sku: 'X3', name: 'x', piecesPerCarton: 0 })
  check('V-2', 'Product validation (sell<min, negative price, duplicate SKU, carton 0) all rejected', !v2.ok && !v3.ok && !v4.ok && !v5.ok, [v2.e, v3.e, v4.e, v5.e])
  const v6 = await inv('products:create', { sku: 'X4', name: 'fractional cents', sellingPrice: 1234.5 })
  check('V-3', 'Non-whole-cent prices rejected by backend', !v6.ok, v6.ok ? `accepted, stored sellingPrice=${v6.v.sellingPrice}` : v6.e)
  if (v6.ok) await inv('products:delete', v6.v.id)

  const C1 = must(await inv('customers:create', { name: 'Alice', address: '12 Main St' }), 'C1')
  const C2 = must(await inv('customers:create', { name: 'Bob' }), 'C2')
  const c3 = await inv('customers:create', { name: 'Alice' })
  const c4 = await inv('customers:create', { name: 'Carl', address: 'Same address as Alice' })
  const c5 = await inv('customers:create', { name: '' })
  check('V-4', 'Customer validation (dup name and empty name rejected; a shared address is allowed)', !c3.ok && !c5.ok && c4.ok, [c3.e, c4.e, c5.e])

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
  const item = (p, qn, price) => ({ productId: p.id, productName: p.name, productSku: p.sku, quantity: qn, costPriceAtSale: p.minSellingPrice, minSellingPriceAtSale: p.minSellingPrice, actualSellingPrice: price })
  const noProf = await inv('invoices:create', { customerId: C1.id, date: TODAY, items: [item(P2, 1, 800)] })
  check('I-0', 'Invoice can be created on a fresh install (before any business profile exists)', noProf.ok, noProf.e ?? 'ok')
  if (noProf.ok) await inv('invoices:delete', noProf.v.id)
  must(await inv('business-profile:update', { name: 'Test Biz', invoicePrefix: 'INV-', currency: 'PKR' }), 'profile')

  const I1 = must(await inv('invoices:create', { customerId: C1.id, date: TODAY, discount: 1000, items: [item(P1, 10, 1500)] }), 'I1'); expectP1 -= 10
  check('I-1', 'Saved total equals the New-invoice form total (subtotal − discount)', I1.total === 14000,
    { saved: { subtotal: I1.subtotal, discount: I1.discount, total: I1.total } })
  const trueProfit = 15000 - 1000 - 12000
  check('I-2', 'Invoice profit = (subtotal − discount) − cost', I1.totalProfit === trueProfit, { expected: trueProfit, saved: I1.totalProfit })
  q = await qty(P1.id)
  check('S-3', `Invoice reduces stock (expect ${expectP1})`, q.single === expectP1 && q.list === expectP1, q)

  const I2 = must(await inv('invoices:create', { customerId: C2.id, date: TODAY, items: [item(P1, 3, 1500), item(P1, 2, 1500)] }), 'I2'); expectP1 -= 5
  q = await qty(P1.id)
  check('S-4', `Same product on two invoice lines deducts both (expect ${expectP1})`, q.single === expectP1 && q.list === expectP1, q)

  const g1 = await inv('invoices:create', { customerId: C1.id, date: TODAY, items: [item(P1, 100000, 1500)] })
  const g2 = await inv('invoices:create', { customerId: C1.id, date: TODAY, items: [item(P1, 1, 1100)] })
  check('I-3', 'Invoice guards: oversell and below-min price both rejected', !g1.ok && !g2.ok, [g1.e ?? 'ACCEPTED', g2.e ?? 'ACCEPTED'])

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
  // 1 carton of 24 pieces @ 900/piece = 21600 net (payable = net − trade discount, no taxes).
  const ritem = (cartons) => ({ productId: P1.id, qtyCartons: cartons, piecesPerCarton: 24, netSalesValueExcl: cartons * 24 * 900 })
  const R1 = must(await inv('restocks:create', { supplierName: 'Acme', date: TODAY, items: [ritem(1)] }), 'R1')
  const rdup = await inv('restocks:create', { supplierName: 'Acme', date: TODAY, items: [ritem(1), ritem(1)] })
  check('R-1', 'Same product twice in one restock rejected', !rdup.ok, rdup.e ?? 'accepted')
  const R1u = must(await inv('restocks:update', R1.id, { items: [ritem(25)] }), 'R1 update')
  check('R-2', 'Editing a pending restock updates its total cost', R1u.totalCost === 25 * 21600, R1u.totalCost)
  must(await inv('restocks:mark-received', R1.id), 'receive'); expectP1 += 25 * 24
  q = await qty(P1.id)
  check('R-3', `Mark received adds stock (expect ${expectP1})`, q.single === expectP1 && q.list === expectP1, q)
  const rdel = await inv('restocks:delete', R1.id), rcan = await inv('restocks:cancel', R1.id)
  check('R-4', 'Received restock cannot be deleted or cancelled', !rdel.ok && !rcan.ok, [rdel.e, rcan.e])
  const P1after = must(await inv('products:get-by-id', P1.id), 'P1')
  check('R-5', 'Receiving a restock at a new unit cost updates the product min selling price (cost basis)', P1after.minSellingPrice === 900, { unitCostReceived: 900, productMinSellingPrice: P1after.minSellingPrice })

  // =============== Deletion integrity ===============
  const P3 = must(await inv('products:create', { sku: 'P3', name: 'Temp', minSellingPrice: 100, sellingPrice: 200 }), 'P3')
  must(await inv('inventory:set-opening-stock', { productId: P3.id, quantity: 10 }), 'opening P3')
  const I4 = must(await inv('invoices:create', { customerId: C1.id, date: TODAY, items: [item(P3, 2, 200)] }), 'I4')
  const itemsBefore = must(await inv('invoices:get-items', I4.id), 'items').length
  const pdel = await inv('products:delete', P3.id)
  const itemsAfter = must(await inv('invoices:get-items', I4.id), 'items').length
  const i4 = must(await inv('invoices:get-by-id', I4.id), 'I4')
  check('D-1', 'Deleting a sold product is blocked, or at least keeps its past invoice lines', !pdel.ok || itemsAfter === itemsBefore,
    { deleteAllowed: pdel.ok, invoiceLinesBefore: itemsBefore, invoiceLinesAfter: itemsAfter, invoiceTotalStillCharged: i4.total })
  const cdel = await inv('customers:delete', C1.id)
  check('D-2', 'Customer with history cannot be deleted', !cdel.ok, cdel.e ?? 'accepted')

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
  check('RP-4', 'Profit & Loss: revenue is sales after discounts and gross profit = revenue − cost of goods',
    pl.totalRevenue === netRevenue && pl.grossProfit === pl.totalRevenue - pl.totalCostOfGoods,
    { expectedNetRevenue: netRevenue, revenue: pl.totalRevenue, cogs: pl.totalCostOfGoods, gross: pl.grossProfit, expenses: pl.expenses, net: pl.netProfit })

  // =============== More UI checks ===============
  // UI-2 no tax rate field in the new invoice form
  await nav('Invoices'); await wait(900)
  await clickBtn('+ New invoice'); await wait(700)
  const taxField = await ev(`[...document.querySelectorAll('label.field')].some((l) => l.textContent.includes('Tax rate'))`)
  check('UI-2', 'New invoice form has no tax rate field (sales tax fully removed)', taxField === false, { taxRateFieldPresent: taxField })
  await clickBtn('Cancel'); await wait(300)
  const rupees = await ev(`document.body.innerText.includes('Rs.')`)
  const dollars = await ev(`document.body.innerText.includes('$')`)
  check('UI-3', 'Money is shown in rupees ("Rs."), with no "$"', rupees && !dollars, { rupeeSignShown: rupees, dollarSignShown: dollars })

  // UI-4 product detail: simplified panel with top-right header icon buttons
  await nav('Products'); await wait(900)
  await clickRowWith('Widget'); await wait(500)
  const addStockHeader = await ev(`!!document.querySelector('.detail .detail-header button[title="Add stock"]')`)
  const historyHeader = await ev(`!!document.querySelector('.detail .detail-header button[title="Stock history"]')`)
  const hasCategory = await ev(`document.querySelector('.detail')?.innerText.includes('Category') ?? false`)
  const hasStatus = await ev(`document.querySelector('.detail')?.innerText.includes('Status') ?? false`)
  const hasDeactivate = await ev(`document.querySelector('.detail')?.innerText.includes('Deactivate') ?? false`)
  const panelText = await ev(`document.querySelector('.detail')?.innerText ?? ''`)
  check('UI-4', 'Product detail: Add stock + History live in the header as icon buttons, panel has no category/status/deactivate rows',
    addStockHeader && historyHeader && !hasCategory && !hasStatus && !hasDeactivate,
    { addStockHeader, historyHeader, panelHasCategory: hasCategory, panelHasStatus: hasStatus, panelHasDeactivate: hasDeactivate })
  await ev(`document.querySelector('.detail .detail-header button[title="Close"]')?.click()`); await wait(300)

  // UI-5 time display in stock history (opened from the header icon)
  await nav('Products'); await wait(900)
  await clickRowWith('Widget'); await wait(900)
  await ev(`document.querySelector('.detail .detail-header button[title="Stock history"]')?.click()`); await wait(900)
  const firstTime = await ev(`document.querySelector('.history tbody tr td')?.innerText`)
  const nowLocal = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  check('UI-5', 'Stock history shows local time (movement just created ≈ now)', !!firstTime && firstTime.includes(nowLocal.slice(0, 2)),
    { shown: firstTime, localTimeNow: nowLocal })
  await ev(`document.querySelector('.overlay')?.click()`); await wait(300)

  // UI-8 create a product through the UI form
  await nav('Products'); await wait(900)
  await clickBtn('+ Add product'); await wait(700)
  await ev(`(()=>{
    const set=(name,val)=>{const i=[...document.querySelectorAll('.modal input')].find((n)=>n.closest('label')?.innerText.trim().startsWith(name)); if(i){Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(i,val); i.dispatchEvent(new Event('input',{bubbles:true}));}};
    set('Name','GAUGE2026'); set('SKU','GAUGE-SKU'); set('Pieces per carton','12'); set('Min selling price','1.50'); set('Selling price','2.25'); return true
  })()`)
  await clickBtn('Create product'); await wait(1200)
  const gauge = await inv('products:get-by-sku', 'GAUGE-SKU')
  const gaugeRow = await ev(`[...document.querySelectorAll('tbody tr')].some((r)=>r.textContent.includes('GAUGE2026'))`)
  check('UI-8', 'Create a product through the UI form', !!gauge.ok && gauge.v.sellingPrice === 225 && gaugeRow,
    { id: gauge.ok ? gauge.v.id : null, sellingPriceStored: gauge.ok ? gauge.v.sellingPrice : null, rowVisible: gaugeRow })

  // UI-9 edit a product through the UI form
  await nav('Products'); await wait(900)
  await clickRowWith('GAUGE2026'); await wait(500)
  await clickBtn('Edit'); await wait(700)
  await ev(`(()=>{
    const set=(name,val)=>{const i=[...document.querySelectorAll('.modal input')].find((n)=>n.closest('label')?.innerText.trim().startsWith(name)); if(i){Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(i,val); i.dispatchEvent(new Event('input',{bubbles:true}));}};
    set('Name','GAUGE2026 PRO'); set('Selling price','3.00'); return true
  })()`)
  await clickBtn('Save changes'); await wait(1200)
  const gauge2 = await inv('products:get-by-sku', 'GAUGE-SKU')
  const editedDetail = await ev(`document.querySelector('.detail')?.innerText ?? ''`)
  check('UI-9', 'Edit a product through the UI form (rename + repricing)', gauge2.ok && gauge2.v.sellingPrice === 300 && editedDetail.includes('GAUGE2026 PRO'),
    { sellingPriceStored: gauge2.ok ? gauge2.v.sellingPrice : null, detailShows: editedDetail.match(/GAUGE2026 PRO|GAUGE2026/)?.[0] ?? null })
  await ev(`document.querySelector('.detail .detail-header button[title="Close"]')?.click()`); await wait(300)
  if (gauge2.ok) await inv('products:delete', gauge2.v.id)

  // UI-6 reports default range (reports live inside Dashboard)
  await nav('Dashboard'); await wait(1500)
  const range = await ev(`[...document.querySelectorAll('input[type=date]')].map(i=>i.value)`)
  const monthStart = TODAY.slice(0, 8) + '01'
  check('UI-6', `Reports on the Dashboard default "From" date is the 1st of this month (${monthStart})`, range?.[0] === monthStart, { from: range?.[0], to: range?.[1] })

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
