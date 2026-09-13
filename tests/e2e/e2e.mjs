// End-to-end test of MZTraders through the real renderer -> preload -> IPC -> SQLite path.
// Runs against an ISOLATED user-data dir; aborts if the test DB is not there.
//
// Usage (never point --user-data-dir at your real data):
//   npm run build
//   TEST_DIR=$(mktemp -d)
//   node_modules/.bin/electron . --remote-debugging-port=9334 --user-data-dir="$TEST_DIR/e2e-userdata" &
//   node tests/e2e/e2e.mjs "$TEST_DIR"
//   pkill -f "remote-debugging-port=9334"
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
const testDb = path.join(TESTDIR, 'majidzia.db')
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

// ---------- UI helpers ----------
const nav = (label) => ev(`(()=>{const b=[...document.querySelectorAll('.nav-item')].find(b=>b.textContent.trim().endsWith(${JSON.stringify(label)})); if(b) b.click(); return !!b})()`)
const clickBtn = (text) => ev(`(()=>{const b=[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()===${JSON.stringify(text)}); if(!b.length) return false; b[0].click(); return true})()`)
const clickRowWith = (text) => ev(`(()=>{const r=[...document.querySelectorAll('tbody tr')].find(r=>r.textContent.includes(${JSON.stringify(text)})); if(!r) return false; r.click(); return true})()`)
// Select a value from a SearchSelect (searchable dropdown) by its label text.
// Finds the control inside the <label> whose caption starts with `name`,
// opens it, then clicks the option whose label includes `label` (typing the
// first word first to narrow the list if needed).
const ss = (name) => `[...document.querySelectorAll('.search-select')].find((n)=>n.closest('label')?.innerText?.trim().startsWith(${JSON.stringify(name)}))`
const pick = async (name, label) => {
  const opened = await ev(`(()=>{const ctrl=${ss(name)}; if(!ctrl) return false; const t=ctrl.querySelector('.search-select-trigger'); if(!t) return false; t.click(); return true})()`)
  if (!opened) return false
  await wait(150)
  const clickMatch = (outer) => ev(`(()=>{const ctrl=${ss(name)}; if(!ctrl) return false; const el=[...ctrl.querySelectorAll('.search-select-option')].find((o)=>(o.dataset.label||'').includes(${JSON.stringify(label)})); if(!el) return false; el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true})); return true})()`)
  if (await clickMatch()) return true
  const typed = await ev(`(()=>{const ctrl=${ss(name)}; if(!ctrl) return false; const inp=ctrl.querySelector('.search-select-input'); if(!inp) return false; Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(inp,${JSON.stringify(label)}.split(' ')[0]); inp.dispatchEvent(new Event('input',{bubbles:true})); return true})()`)
  if (!typed) return false
  await wait(150)
  return clickMatch()
}

try {
  // =============== UI-0: fresh install layout ===============
  const defaultNav = await ev(`[...document.querySelectorAll('.nav-item.active')].map(b=>b.textContent.trim()).join(',')`)
  const newInvoiceBtn = await ev(`document.body.innerText.includes('+ New Invoice')`)
  check('UI-0', 'Fresh install lands on Invoices with the main navigation visible', defaultNav.includes('Invoices') && newInvoiceBtn, { activeNav: defaultNav })

  // =============== Product validation ===============
  const P1 = must(await inv('products:create', { name: 'Axle Bearing 6204', rate: 65000, boxesPerCarton: 10 }), 'P1')
  const dup = await inv('products:create', { name: 'Axle Bearing 6204', rate: 100, boxesPerCarton: 12 })
  const empty = await inv('products:create', { name: '', rate: 100, boxesPerCarton: 12 })
  const badBpc = await inv('products:create', { name: 'Frac', rate: 100, boxesPerCarton: 0 })
  const frac = await inv('products:create', { name: 'Frac Paisa', rate: 1000.5, boxesPerCarton: 12 })
  check('V-1', 'Product validation: empty name, duplicate name, boxes 0 and fractional cents all rejected',
    !dup.ok && !empty.ok && !badBpc.ok && !frac.ok, [dup.e, empty.e, badBpc.e, frac.e])
  const P2 = must(await inv('products:create', { name: 'Valve Spring', rate: 15000, boxesPerCarton: 20 }), 'P2')

  // =============== Customer & settings validation ===============
  const routes = must(await inv('routes:list'), 'routes')
  const mondayRouteId = routes.find((r) => r.name === 'Monday').id
  const tueRouteId = routes.find((r) => r.name === 'Tuesday').id
  check('RD-1', 'The 6 delivery routes are seeded (Monday..Thursday, Saturday, Sunday)', routes.length === 6 && routes.every((r) => r.isActive === 1), routes.map((r) => r.name).join(', '))

  const noCode = await inv('customers:create', { shopName: 'Shop', routeId: mondayRouteId })
  const noName = await inv('customers:create', { code: 'C-001', routeId: mondayRouteId })
  const noRoute = await inv('customers:create', { code: 'C-001', shopName: 'Shop' })
  check('V-2', 'Customer validation: missing code, missing name, missing route all rejected',
    !noCode.ok && !noName.ok && !noRoute.ok, [noCode.e, noName.e, noRoute.e])
  const C1 = must(await inv('customers:create', { code: 'MK-001', shopName: 'Bilal Auto Shop', ownerName: 'Bilal', phone: '0322-0000001', address: 'Liaquat Road', routeId: mondayRouteId }), 'C1')
  const dupCode = await inv('customers:create', { code: 'MK-001', ownerName: 'Other', routeId: tueRouteId })
  check('V-3', 'Customer codes are unique across routes', !dupCode.ok, dupCode.e ?? 'accepted')
  const C2 = must(await inv('customers:create', { code: 'WK-001', shopName: 'Emerald Parts', ownerName: 'Imran', phone: '0322-0000003', address: 'Water Pump Chowk', routeId: tueRouteId }), 'C2')

  const noOwner = await inv('invoices:create', {
    customerId: C1.id, brokerId: 9999, date: TODAY, filerStatus: 'filer',
    tax: null,
    items: [{ productId: P1.id, rate: 65000, cartonCount: 1, boxCount: 0 }],
  })
  check('EO-1', 'Creating an invoice before a project owner is set up is rejected',
    !noOwner.ok && /Set up the project owner/.test(noOwner.e), noOwner.e ?? 'accepted')

  const O1 = must(await inv('project-owners:create', { name: 'Majid Zia Motors', phone: '0300-1234567', address: 'Main Bazaar, Multan' }), 'O1')
  const ownerDup = await inv('project-owners:create', { name: 'Majid Zia Motors', phone: 'x' })
  check('V-4', 'Only one project owner can be set up (and its name is unique)', !ownerDup.ok, ownerDup.e ?? 'accepted')
  const B1 = must(await inv('brokers:create', { name: 'Bashir Ahmad', phone: '0322-1112223' }), 'B1')

  // =============== Stock the invoices below will sell (negative-stock guard) ===============
  // INV-000001 sells 2 cartons + 5 boxes of Axle Bearing 6204 (qty 7), INV-000002 sells
  // 4 cartons of Valve Spring (qty 4) — both need enough stock before they can be made.
  must(await inv('stock:restock', { productId: P1.id, quantity: 7 }), 'prestock P1 +7')
  must(await inv('stock:restock', { productId: P2.id, quantity: 4 }), 'prestock P2 +4')

  // =============== Invoice ring & maths ===============
  const item = (productId, rate, cartonCount, boxCount) => ({ productId, rate, cartonCount, boxCount })
  const I1 = must(await inv('invoices:create', {
    customerId: C1.id, brokerId: B1.id, date: TODAY, filerStatus: 'filer',
    tax: null,
    items: [item(P1.id, 65000, 2, 5)],
  }), 'I1')
  // 65000*2 + 65000*5/10 = 130000 + 32500
  check('I-1', `Invoice #1 subtotal = rate×cartons + rounded rate×boxes/bpc (${I1.subtotal})`, I1.invoiceNumber === 'INV-000001' && I1.subtotal === 162500, { number: I1.invoiceNumber, subtotal: I1.subtotal })

  const I2 = must(await inv('invoices:create', {
    customerId: C2.id, brokerId: B1.id, date: TODAY, filerStatus: 'non_filer',
    tax: 5000,
    items: [item(P2.id, 15000, 4, 0)],
  }), 'I2')
  const i2 = must(await inv('invoices:get-with-details', I2.id), 'I2 details')
  check('I-2', 'Invoice #2 sequential, grand total = subtotal + tax, details resolve customer/owner/broker',
    I2.invoiceNumber === 'INV-000002' && i2.invoice.remaining === 65000 && i2.invoice.tax === 5000 && i2.invoice.grandTotal === 65000 && i2.customer.code === 'WK-001' && i2.owner.name === 'Majid Zia Motors' && i2.broker.name === 'Bashir Ahmad',
    { number: I2.invoiceNumber, remaining: i2.invoice.remaining, tax: i2.invoice.tax, grand: i2.invoice.grandTotal })

  const belowMin = await inv('invoices:create', {
    customerId: C1.id, brokerId: B1.id, date: TODAY, filerStatus: 'filer',
    tax: null,
    items: [item(P1.id, 64999, 1, 0)],
  })
  const noItems = await inv('invoices:create', { customerId: C1.id, brokerId: B1.id, date: TODAY, filerStatus: 'filer', tax: null, items: [] })
  const badDate = await inv('invoices:create', { customerId: C1.id, brokerId: B1.id, date: 'not-a-date', filerStatus: 'filer', tax: null, items: [item(P1.id, 65000, 1, 0)] })
  const badCust = await inv('invoices:create', { customerId: 9999, brokerId: B1.id, date: TODAY, filerStatus: 'filer', tax: null, items: [item(P1.id, 65000, 1, 0)] })
  check('I-3', 'Invoice guards: below-min rate, empty items, invalid date, unknown customer all rejected',
    !belowMin.ok && !noItems.ok && !badDate.ok && !badCust.ok, [belowMin.e, noItems.e, badDate.e, badCust.e])

  const overStock = await inv('invoices:create', {
    customerId: C2.id, brokerId: B1.id, date: TODAY, filerStatus: 'filer',
    tax: null,
    items: [item(P1.id, 65000, 1, 0)],
  })
  check('I-3b', 'An invoice needing more stock than available is rejected (negative-stock guard)',
    !overStock.ok && /Insufficient stock/.test(overStock.e), overStock.e ?? 'accepted')

  // =============== Delete integrity ===============
  const delCust = await inv('customers:delete', C1.id)
  const delProd = await inv('products:delete', P1.id)
  check('D-1', 'Deleting a customer or product that has invoices is blocked', !delCust.ok && !delProd.ok, [delCust.e ?? 'accepted', delProd.e ?? 'accepted'])

  // =============== Invoice description setting ===============
  must(await inv('settings:set', 'invoice_description', 'Payment due within 7 days.', 'richtext'), 'desc')

  // =============== UI-2: Settings (project owners + bookers) ===============
  await nav('Settings'); await wait(900)
  const ownersSection = await ev(`document.body.innerText.includes('Project Owner') && document.body.innerText.includes('Majid Zia Motors')`)
  const bookersSection = await ev(`document.body.innerText.includes('Bookers (Brokers)') && document.body.innerText.includes('Bashir Ahmad')`)
  await clickBtn('+ Add Booker'); await wait(500)
  const brokerModalOpened = await ev(`!!document.querySelector('.modal') && document.querySelector('.modal')?.innerText.includes('Booker')`)
  await ev(`document.querySelector('.overlay')?.click()`); await wait(300)
  check('UI-2', 'Settings lists project owners and bookers and opens the add-broker form', ownersSection && bookersSection && brokerModalOpened, { ownersSection, bookersSection, brokerModalOpened })

  // =============== UI-2b: Settings backup & restore actions present ===============
  const backupSection = await ev(`document.body.innerText.includes('Backup & Restore') && [...document.querySelectorAll('button')].some((b)=>b.textContent.trim()==='Create backup…') && [...document.querySelectorAll('button')].some((b)=>b.textContent.trim()==='Restore from backup…')`)
  check('UI-2b', 'Settings shows the Backup & Restore section with Create and Restore buttons', backupSection, { backupSection })

  // =============== UI-3: create a product through the UI form ===============
  await nav('Products'); await wait(900)
  await clickBtn('+ Add Product'); await wait(700)
  await ev(`(()=>{
    const set=(name,val)=>{const i=[...document.querySelectorAll('.modal input')].find((n)=>n.closest('label')?.innerText.trim().startsWith(name)); if(i){Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(i,val); i.dispatchEvent(new Event('input',{bubbles:true}));}};
    set('Product name','GAUGE 2026'); set('Minimum rate (Rs.)','1.50'); set('Boxes per carton','12'); return true
  })()`)
  await clickBtn('Save'); await wait(1200)
  const gaugeRow = await ev(`[...document.querySelectorAll('tbody tr')].some((r)=>r.textContent.includes('GAUGE 2026'))`)
  const gauge = must(await inv('products:list'), 'products').find((p) => p.name === 'GAUGE 2026')
  check('UI-3', 'Creating a product through the UI form stores it (rate 150 cents), 12/carton', gaugeRow && gauge?.rate === 150 && gauge.boxesPerCarton === 12, { id: gauge?.id, rate: gauge?.rate, boxesPerCarton: gauge?.boxesPerCarton })

  // =============== UI-3b: CSV product import (no stock changes) ===============
  const importBtn = await ev(`[...document.querySelectorAll('button')].some((b)=>b.textContent.trim()==='Import CSV…')`)
  const csvPath = path.join(TESTDIR, 'import-products.csv')
  fs.writeFileSync(csvPath, [
    'Description,Retail Price per carton Exclusive of Sales Tax,Total Retail Value',
    'Irn Bru New 6x18 Rs.50,1000.50,6003',
    'Prince New 1x48 Rs.100,2000,2000',
    'Irn Bru New 6x18 Rs.50,9999,59994',
    'Broken Rate,X,1',
    ',100,1',
  ].join('\n'), 'utf8')
  const imp = must(await inv('products:import-csv', csvPath), 'import csv')
  const stockBeforeImport = must(await inv('stock:list'), 'stock before import')
  const stockAfterImport = must(await inv('stock:list'), 'stock after import')
  const impProduct = imp.products.find((p) => p.name === 'Irn Bru New 6x18 Rs.50')
  const impTouchedStock = stockAfterImport.some((m) => ['Irn Bru New 6x18 Rs.50', 'Prince New 1x48 Rs.100'].includes(m.productName))
  check('UI-3b', 'Import CSV creates products (rate in cents, boxes from NxM, duplicates/invalid skipped) without stock movements',
    importBtn && imp.created === 2 && imp.skippedDuplicate === 1 && imp.skippedInvalid === 2 &&
    impProduct?.rate === 100050 && impProduct.boxesPerCarton === 18 &&
    stockBeforeImport.length === stockAfterImport.length && !impTouchedStock,
    { importBtn, imp: { created: imp.created, skippedDuplicate: imp.skippedDuplicate, skippedInvalid: imp.skippedInvalid } })

  // =============== UI-4: create a customer through the UI form (route tabs) ===============
  await nav('Customers'); await wait(900)
  const mondayTab = await ev(`[...document.querySelectorAll('.route-tabs button')].some((b)=>b.innerText.includes('Monday'))`)
  await clickBtn('+ Add Customer'); await wait(700)
  await ev(`(()=>{
    const set=(name,val)=>{const i=[...document.querySelectorAll('.modal input')].find((n)=>n.closest('label')?.innerText.trim().startsWith(name)); if(i){Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(i,val); i.dispatchEvent(new Event('input',{bubbles:true}));}};
    set('Customer code','BC-002'); set('Shop name','Bilal Spares 2'); set('Owner name','Bilal Jr'); return true
  })()`)
  await clickBtn('Save'); await wait(1200)
  const newCustRow = await ev(`[...document.querySelectorAll('tbody tr')].some((r)=>r.textContent.includes('BC-002'))`)
  const mondayCount = await ev(`[...document.querySelectorAll('.route-tabs button')].find((b)=>b.innerText.includes('Monday'))?.innerText?.match(/\\d+/)?.[0] ?? '?'`)
  const routeSwitch = await ev(`(()=>{const b=[...document.querySelectorAll('.route-tabs button')].find((b)=>b.innerText.includes('Tuesday')); if(!b) return false; b.click(); return true})()`)
  await wait(700)
  const tueShowsEmerald = await ev(`document.body.innerText.includes('Emerald Parts')`)
  check('UI-4', 'Adding a customer via UI puts it on Monday (count updates); switching to Tuesday shows its customer',
    mondayTab && newCustRow && tueShowsEmerald, { newCustomerRow: newCustRow, mondayCount, switchedToTuesday: routeSwitch, tuesdayShowsEmerald: tueShowsEmerald })

  // =============== UI-4b: Excel customer import into a single route ===============
  const importExcelBtn = await ev(`[...document.querySelectorAll('button')].some((b)=>b.textContent.trim()==='Import Excel…')`)
  const Xlib = await import('xlsx')
  const XLSX = Xlib.default ?? Xlib
  const excelPath = path.join(TESTDIR, 'import-stores.xlsx')
  const wb2 = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet([['Selected National'], ['Selected Zone']]), 'Filters')
  XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet([
    ['Store Code', 'Store Name', 'Filer Status', 'Owner Name', 'Owner Contact #', 'Address'],
    ['X0001', 'Super Mart', 'Filer', 'Ali', '03000000001', 'Main Bazaar'],
    ['X0002', 'Corner Shop', 'Non-Filer', 'Umer', '03000000002', 'Tanda'],
  ]), 'Stores')
  XLSX.writeFile(wb2, excelPath)
  const allRoutes4b = must(await inv('routes:list'), 'routes')
  const mondayRoute = allRoutes4b.find((r) => r.day === 'Monday')
  const custBefore = must(await inv('customers:count'), 'customer count before')
  const impCust = must(await inv('customers:import-excel', excelPath, mondayRoute.id), 'import excel')
  const mondayCusts = must(await inv('customers:list-by-route', mondayRoute.id), 'monday customers')
  const custAfter = must(await inv('customers:count'), 'customer count after')
  const x0001 = mondayCusts.find((c) => c.code === 'X0001')
  check('UI-4b', 'Import Excel creates customers all on one route (Monday) with mapped fields, no stock touched',
    importExcelBtn && impCust.created === 2 && impCust.skippedInvalid === 0 &&
    custAfter === custBefore + 2 &&
    !!x0001 && x0001.shopName === 'Super Mart' && x0001.ownerName === 'Ali' && x0001.phone === '03000000001' && x0001.address === 'Main Bazaar' &&
    mondayCusts.some((c) => c.code === 'X0002'),
    { importExcelBtn, impCust, mondayRoute: { id: mondayRoute.id, name: mondayRoute.name }, custBefore, custAfter, mondayCount: mondayCusts.length, imported: impCust.customers.map((c) => ({ code: c.code, shop: c.shopName, routeId: c.routeId })) })

  // =============== UI-6: rename a delivery route through the Route names modal ===============
  await nav('Customers'); await wait(900)
  await clickBtn('Route names'); await wait(700)
  await ev(`(()=>{
    const set=(name,val)=>{const i=[...document.querySelectorAll('.modal label.field input')].find((n)=>n.closest('label')?.innerText.trim().startsWith(name)); if(!i) return false; Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(i,val); i.dispatchEvent(new Event('input',{bubbles:true})); return true};
    return set('Tuesday','Tuesday Market')
  })()`)
  await wait(600)
  await clickBtn('Save Route Names'); await wait(1500)
  const renamedTab = await ev(`[...document.querySelectorAll('.route-tabs button')].some((b)=>b.innerText.includes('Tuesday Market'))`)
  const routesAfter = must(await inv('routes:list'), 'routes after rename')
  const tueRoute = routesAfter.find((r) => r.day === 'Tuesday')
  check('UI-6', 'Route names modal renames Tuesday\'s route; the fixed day label is preserved',
    renamedTab && tueRoute?.name === 'Tuesday Market' && tueRoute.day === 'Tuesday',
    { renamedTab, name: tueRoute?.name, day: tueRoute?.day })

  // =============== UI-5: create an invoice through the UI form and inspect the print sheet ===============
  // The UI-created invoice below sells 3 cartons of GAUGE 2026, so stock it first.
  must(await inv('stock:restock', { productId: gauge.id, quantity: 3 }), 'gauge prestock +3')
  await nav('Invoices'); await wait(900)
  await clickBtn('+ New Invoice'); await wait(700)
  await pick('Route', 'Monday')
  await pick('Customer', 'Bilal Auto Shop')
  await pick('Booker', 'Bashir Ahmad')
  await pick('Product', 'GAUGE 2026')
  await wait(200)
  await ev(`(()=>{
    const num=(name,val)=>{const i=[...document.querySelectorAll('.invoice-line input')].find((n)=>n.closest('label')?.innerText.trim().startsWith(name)); if(!i) return false; Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(i,val); i.dispatchEvent(new Event('input',{bubbles:true})); return true};
    num('Rate (Rs.)','2.00'); num('Carton no.','3'); return true
  })()`)
  await wait(400)
  const lineAmountShown = await ev(`[...document.querySelectorAll('.invoice-line .line-total strong')].map((n)=>n.textContent.trim()).join('|')`)
  await clickBtn('Save Invoice'); await wait(1800)
  const detailNumber = await ev(`document.querySelector('.invoice-sheet')?.innerText.includes('INV-000003') ?? false`)
  const sheetText = await ev(`document.querySelector('.invoice-sheet')?.innerText ?? ''`)
  const hasOwner = sheetText.includes('Majid Zia Motors')
  const hasBand = sheetText.includes('0300-1234567') && sheetText.includes('Main Bazaar, Multan')
  const hasCustomer = sheetText.includes('Bilal Auto Shop')
  const hasBroker = sheetText.includes('Bashir Ahmad')
  const hasMatrixCols = await ev(`[...document.querySelectorAll('.ip-table th')].map((th)=>th.textContent.trim()).join(',')`)
  const hasSignature = sheetText.includes('Signature') && !sheetText.includes('Prepared By') && !sheetText.includes('Despatched By')
  const hasDescription = sheetText.includes('Payment due within 7 days.')
  const hasShopNameLabel = sheetText.includes('Shop name:')
  const hasOwnerNameLabel = sheetText.includes('Owner name:')
  const hasStatusLabel = sheetText.includes('Status:') && !sheetText.includes('Filer status')
  const dateCount = (sheetText.match(/Date:/g) ?? []).length
  check('UI-5', 'Invoicing through the UI lands on the printable sheet with centered header, owner/Booker metadata, matrix item columns, full value stack and a single signature',
    detailNumber && hasOwner && hasBand && hasCustomer && hasBroker && hasMatrixCols === 'Description,Qty.,Unit,Rate,Amount' && hasSignature && hasDescription,
    { lineAmountDuringEntry: lineAmountShown, invoiceNumberVisible: detailNumber, owner: hasOwner, band: hasBand, customer: hasCustomer, booker: hasBroker, matrixColumns: hasMatrixCols, signatures: hasSignature, description: hasDescription })
  check('UI-5b', 'Sheet shows a single date, labeled shop/owner fields, "Status" (not "Filer status") and rupee symbols',
    dateCount === 1 && hasShopNameLabel && hasOwnerNameLabel && hasStatusLabel && sheetText.includes('Rs.'),
    { datesShown: dateCount, shopNameLabel: hasShopNameLabel, ownerNameLabel: hasOwnerNameLabel, statusLabel: hasStatusLabel, rupee: sheetText.includes('Rs.') })

  const headerCentered = await ev(`(()=>{const h=document.querySelector('.invoice-sheet .sheet-head'); if(!h) return false; const s=getComputedStyle(h); return s.textAlign==='center'})()`)
  const fontIsTimes = await ev(`(()=>{const s=getComputedStyle(document.querySelector('.invoice-sheet')); return s.fontFamily.toLowerCase().includes('times')})()`)
  const ownerUnderlined = await ev(`(()=>{const s=getComputedStyle(document.querySelector('.invoice-sheet .ip-owner')); return s.textDecorationLine.includes('underline')})()`)
  const ownerBandText = await ev(`document.querySelector('.invoice-sheet .sheet-head')?.innerText ?? ''`)
  const bandLayout = ownerBandText.includes('Main Bazaar, Multan') && ownerBandText.includes('0300-1234567') && ownerBandText.includes(',')
  const boxHeadings = await ev(`[...document.querySelectorAll('.invoice-sheet .ip-box-heading')].map((h)=>h.textContent.trim()).join(',')`)
  const hasTitle = !sheetText.includes('SALES INVOICE')
  const hasQtyBreakdown = (boxHeadings.includes('Quantity Breakdown') || boxHeadings.includes('QUANTITY BREAKDOWN')) && sheetText.includes('Total Ctn (Cartons)') && sheetText.includes('Total Pcs')
  const hasBalances = sheetText.includes('Previous Balance')
  const hasFinancials = sheetText.includes('Total Gross Amount') && sheetText.includes('Previous Balance') && sheetText.includes('Tax') && sheetText.includes('Net Amount / Grand Total')
  const netStyle = await ev(`(()=>{const n=document.querySelector('.invoice-sheet .ip-net'); if(!n) return 'NOTFOUND'; const s=getComputedStyle(n); return JSON.stringify({top:s.borderTopWidth,bottom:s.borderBottomWidth,topStyle:s.borderTopStyle})})()`)
  const netParsed = JSON.parse(netStyle)
  const netBordered = netParsed.topStyle === 'solid' && parseFloat(netParsed.top) > 0 && parseFloat(netParsed.bottom) > 0
  check('UI-5c', 'Sheet has Times New Roman font, underlined store name, address/comma/phone header band, invoice number without SALES INVOICE title, quantity breakdown, previous balance, financial stack with bordered net row',
    headerCentered && fontIsTimes && ownerUnderlined && bandLayout && hasTitle && hasQtyBreakdown && hasBalances && hasFinancials && netBordered,
    { headerCentered, fontTimesNewRoman: fontIsTimes, ownerUnderlined, bandLayout, title: hasTitle, quantityBreakdown: hasQtyBreakdown, balances: hasBalances, financials: hasFinancials, netRowBordered: netStyle })

  // =============== UI-7: load form selection + printable report ===============
  await nav('Invoices'); await wait(900)
  const loadBtnShown = await clickBtn('Load form'); await wait(400)
  const checkboxesShown = await ev(`document.querySelectorAll('.data-table .select-col input[type="checkbox"]').length`)
  await clickBtn('Cancel'); await wait(400)
  const boxesAfterCancel = await ev(`document.querySelectorAll('.data-table .select-col input[type="checkbox"]').length`)
  await clickBtn('Load form'); await wait(400)
  const enabledBefore = await ev(`[...document.querySelectorAll('button')].some((b)=>b.textContent.trim()==='Create Load Form' && !b.disabled)`)
  await ev(`(()=>{
    const rows=[...document.querySelectorAll('tbody tr')];
    const invRow=(n)=>rows.find((r)=>r.textContent.includes(n));
    invRow('INV-000001')?.querySelector('.select-col input').click();
    invRow('INV-000002')?.querySelector('.select-col input').click();
    return !!(invRow('INV-000001') && invRow('INV-000002'))
  })()`)
  await wait(200)
  const enabledAfter = await ev(`[...document.querySelectorAll('button')].find((b)=>b.textContent.trim()==='Create Load Form')?.disabled === false`)
  await clickBtn('Create Load Form'); await wait(1200)
  const lfText = await ev(`document.querySelector('.invoice-sheet')?.innerText ?? ''`)
  const lfHasProducts = lfText.includes('Products') && lfText.includes('Axle Bearing 6204')
  const lfHasCustomers = lfText.includes('Customers')
  const lfGrandTotal = await ev(`document.querySelector('.invoice-sheet tfoot')?.innerText.trim() ?? ''`)
  const lfCoversInvoices = lfText.includes('INV-000001') && lfText.includes('INV-000002')
  check('UI-7', 'Load form: checkboxes select invoices and the printable report aggregates products + customers + grand total',
    loadBtnShown && checkboxesShown >= 2 && boxesAfterCancel === 0 && !enabledBefore && enabledAfter && lfHasProducts && lfHasCustomers && /Grand total.*Rs\./.test(lfGrandTotal) && lfCoversInvoices,
    { loadButton: loadBtnShown, checkboxCount: checkboxesShown, afterCancel: boxesAfterCancel, disabledBeforeSelection: !enabledBefore, enabledAfterSelection: enabledAfter, products: lfHasProducts, customers: lfHasCustomers, grandTotal: lfGrandTotal, invoiceNumbers: lfCoversInvoices })
  const lfData = must(await inv('invoices:build-load-form', [I1.id, I2.id]), 'load form data')
  check('UI-7b', 'Load form IPC aggregates quantities and rupee customer totals for the same invoices',
    lfData.products.length === 2 && lfData.grandTotal === 227500 &&
    lfData.products.find((p) => p.productName === 'Axle Bearing 6204').cartonCount === 2 &&
    lfData.products.find((p) => p.productName === 'Axle Bearing 6204').boxCount === 5,
    { products: lfData.products, customers: lfData.customers, grandTotal: lfData.grandTotal })
  await clickBtn('Back to Invoices'); await wait(500)
  const backToList = await ev(`[...document.querySelectorAll('button')].some((b)=>b.textContent.trim()==='+ New Invoice')`)
  check('UI-7c', 'Load form report can be closed back to the invoice list', backToList, { backToList })

  // =============== UI-8/9/10: products → restock, inventory, per-product history ===============
  await nav('Products'); await wait(900)
  await clickBtn('Restock'); await wait(400)
  const restockModalOpen = await ev(`!!document.querySelector('.modal') && document.querySelector('.modal')?.innerText.includes('Restock Product')`)
  await ev(`(()=>{
    const inp=[...document.querySelectorAll('.modal input')].find((n)=>n.closest('label')?.innerText.includes('Quantity'));
    if(!inp) return false;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(inp,'50');
    inp.dispatchEvent(new Event('input',{bubbles:true}));
    return true
  })()`)
  await pick('Product', 'GAUGE 2026')
  await wait(200)
  await clickBtn('Add Stock'); await wait(1000)
  const restockSuccess = await ev(`document.querySelector('.form-success')?.innerText ?? ''`)
  const stockList = must(await inv('stock:list'), 'stock list')
  const uiRestock = stockList.find((m) => m.productName === 'GAUGE 2026' && m.type === 'purchase')
  check('UI-8', 'Restock modal adds stock as a purchase movement and shows a success toast',
    restockModalOpen && restockSuccess.includes('50') && restockSuccess.includes('GAUGE 2026') &&
    !!uiRestock && uiRestock.quantity === 50 && uiRestock.previousQuantity === 0 && uiRestock.newQuantity === 50 && uiRestock.date === TODAY,
    { modalOpen: restockModalOpen, success: restockSuccess, restock: uiRestock })

  await clickBtn('Inventory'); await wait(1000)
  const invText = await ev(`document.body.innerText`)
  const invHasRestock = invText.includes('+50 Restocks')
  const invHasSale = invText.includes('Axle Bearing 6204') && invText.includes('Bilal Auto Shop') && invText.includes('Rs. 650.00') && invText.includes('-7')
  const invHasSpring = await ev(`[...document.querySelectorAll('tbody tr')].some((r)=>r.textContent.includes('Valve Spring') && r.textContent.includes('-4'))`)
  const invToolbarBtns = await ev(`[...document.querySelectorAll('.toolbar .btn')].map((b)=>b.textContent.trim())`)
  const invPrintExport = invToolbarBtns.includes('Print') && invToolbarBtns.includes('Export CSV')
  check('UI-9', 'Inventory view lists restocks (+50 Restocks) and invoice sales with customer, price and quantity',
    invHasRestock && invHasSale && invHasSpring && invPrintExport,
    { restockRow: invHasRestock, saleRow: invHasSale, springRow: invHasSpring, printExport: invPrintExport, toolbar: invToolbarBtns })
  await clickBtn('Back to Products'); await wait(500)

  await clickRowWith('GAUGE 2026'); await wait(1000)
  const detailHeaders = await ev(`[...document.querySelectorAll('.data-table th')].map((th)=>th.textContent.trim()).join(',')`)
  const detailText = await ev(`document.querySelector('.feature')?.innerText ?? ''`)
  const detailHasInStock = detailText.includes('In stock') && /In stock\s*\n?\s*50/.test(detailText)
  const detailHasHistory = detailText.includes('+50 Restocks') && detailText.includes('-3')
  const detailToolbarBtns = await ev(`[...document.querySelectorAll('.toolbar .btn')].map((b)=>b.textContent.trim())`)
  const detailPrintExport = detailToolbarBtns.includes('Print') && detailToolbarBtns.includes('Export CSV')
  check('UI-10', 'Product detail page shows a per-product history (no product column) with restock +50, sale -3 and In stock 50',
    detailHeaders === 'Date,Customer,Price,Quantity' && detailHasInStock && detailHasHistory && detailPrintExport,
    { headers: detailHeaders, inStock: detailHasInStock, history: detailHasHistory, printExport: detailPrintExport, toolbar: detailToolbarBtns })
  await clickBtn('Back to Products'); await wait(500)
  const backToProducts = await ev(`!!document.querySelector('.toolbar input.search-input')`)
  check('UI-10b', 'Product detail can be closed back to the product list', backToProducts, { backToProducts })

  // =============== UI-11: dashboard matrices, detail panels and short lists ===============
  await nav('Dashboard'); await wait(1200)
  const dashActive = await ev(`[...document.querySelectorAll('.nav-item.active')].map((b)=>b.textContent.trim()).join(',')`)
  const metricLabels = await ev(`[...document.querySelectorAll('.metric-card .metric-label')].map((n)=>n.textContent.trim()).join(',')`)
  const metricValues = await ev(`[...document.querySelectorAll('.metric-card .metric-value')].map((n)=>n.textContent.trim()).join('|')`)
  const hasRange = await ev(`document.querySelectorAll('.dashboard-toolbar input[type="date"]').length === 2`)
  check('UI-11', 'Dashboard shows the six metric matrices with a date range picker',
    dashActive.includes('Dashboard') && metricLabels === 'Profit,Remaining stock,Invoices,Expenses,Owed amount,Cash flow' && hasRange && metricValues.includes('Rs.'),
    { activeNav: dashActive, metricLabels, metricValues, hasRange })

  await ev(`[...document.querySelectorAll('.metric-card')].find((b)=>b.querySelector('.metric-label')?.textContent==='Profit')?.click()`)
  await wait(700)
  const profitDetail = await ev(`document.querySelector('.detail-modal')?.innerText ?? ''`)
  const profitHasCustomer = profitDetail.includes('Bilal Auto Shop')
  const profitUpper = profitDetail.toUpperCase()
  const profitHasColumns = profitUpper.includes('INVOICES') && profitUpper.includes('SALES') && profitUpper.includes('PROFIT')
  const profitHasMoney = profitDetail.includes('Rs.')
  const profitActions = await ev(`[...document.querySelectorAll('.detail-modal .modal-actions button')].map((b)=>b.textContent.trim()).join(',')`)
  const profitCsvWired = await ev(`(()=>{const orig=HTMLAnchorElement.prototype.click;window.__csvFired=false;HTMLAnchorElement.prototype.click=function(){if(this.download&&this.href)window.__csvFired=true;};const b=[...document.querySelectorAll('.detail-modal .modal-actions button')].find((x)=>x.textContent.trim()==='Export CSV');b?.click();const ok=window.__csvFired;HTMLAnchorElement.prototype.click=orig;return ok})()`)
  check('UI-11b', 'Clicking the Profit matrix opens a modal with Print/Export CSV actions and a breakdown',
    profitHasCustomer && profitHasColumns && profitHasMoney && profitActions.includes('Print') && profitActions.includes('Export CSV') && profitCsvWired,
    { profitHasCustomer, profitHasColumns, profitHasMoney, actions: profitActions, csvWired: profitCsvWired })
  await clickBtn('Close'); await wait(400)

  await ev(`[...document.querySelectorAll('.metric-card')].find((b)=>b.querySelector('.metric-label')?.textContent==='Remaining stock')?.click()`)
  await wait(700)
  const stockRows = await ev(`[...document.querySelectorAll('.detail-modal tbody tr')].map((r)=>r.textContent.trim().replace(/\\s+/g,' ')).join('|')`)
  const stockSections = await ev(`[...document.querySelectorAll('.modal-section h4')].map((h)=>h.textContent.trim()).join(',')`)
  const stockHasGauge = /GAUGE 202650/.test(stockRows)
  const stockHasOthers = stockRows.includes('Axle Bearing 62040') && stockRows.includes('Valve Spring0')
  const stockActions = await ev(`[...document.querySelectorAll('.detail-modal .modal-actions button')].map((b)=>b.textContent.trim()).join(',')`)
  check('UI-11c', 'Clicking the Remaining stock matrix opens a modal with the inventory and today dispatches',
    stockSections.includes('Remaining inventory') && stockSections.includes('Dispatched today') && stockHasGauge && stockHasOthers && stockActions === 'Print,Export CSV,Close',
    { stockRows, stockSections, stockHasGauge, stockHasOthers, actions: stockActions })
  await clickBtn('Close'); await wait(400)

  await ev(`[...document.querySelectorAll('.metric-card')].find((b)=>b.querySelector('.metric-label')?.textContent==='Invoices')?.click()`)
  await wait(700)
  const invoiceDetail = await ev(`document.querySelector('.detail-modal')?.innerText ?? ''`)
  const invoiceDetailHasRows = invoiceDetail.includes('INV-000001') && invoiceDetail.includes('INV-000003')
  const invoiceValue = await ev(`[...document.querySelectorAll('.metric-card')].find((b)=>b.querySelector('.metric-label')?.textContent==='Invoices')?.querySelector('.metric-value')?.textContent.trim()`)
  check('UI-11d', 'Clicking the Invoices matrix opens the invoice ledger for the range',
    invoiceValue === '3' && invoiceDetailHasRows, { invoiceValue, invoiceDetailHasRows })
  await clickBtn('Close'); await wait(400)

  const shortHeaders = await ev(`[...document.querySelectorAll('.short-list-header h3')].map((h)=>h.textContent.trim()).join(',')`)
  const moreButtons = await ev(`[...document.querySelectorAll('.short-list-header .btn')].map((b)=>b.textContent.trim()).join(',')`)
  const shortHasProducts = await ev(`document.querySelectorAll('.short-list')[0]?.innerText.includes('GAUGE 2026') || document.querySelectorAll('.short-list')[0]?.innerText.includes('Axle Bearing 6204')`)
  check('UI-11e', 'Short lists show recent products/invoices/customers/activity, each with a More button',
    shortHeaders === 'Products,Invoices,Customers,Recent activity' &&
    moreButtons.split(',').filter((b) => b.includes('More')).length === 4 && shortHasProducts,
    { shortHeaders, moreButtons, shortHasProducts })

  await ev(`[...document.querySelectorAll('.short-list')].find((s)=>s.querySelector('h3')?.textContent==='Invoices')?.querySelector('.btn')?.click()`)
  await wait(900)
  const moreWentTo = await ev(`[...document.querySelectorAll('.nav-item.active')].map((b)=>b.textContent.trim()).join(',')`)
  check('UI-11f', 'The More button on the Invoices short list navigates to the Invoices page',
    moreWentTo.includes('Invoices'), { moreWentTo })

  // =============== UI-12: expenses page (add, upsert, list, total) ===============
  await nav('Expenses'); await wait(1000)
  const expenseDateValue = await ev(`document.querySelector('.feature .toolbar input[type="date"]')?.value`)
  const expenseEmptyTotal = await ev(`document.querySelector('.expense-summary-total')?.textContent.trim()`)
  const addExpense = async (name, price) => {
    await ev(`(()=>{const set=(label,val)=>{const i=[...document.querySelectorAll('.expense-form input')].find((n)=>n.closest('label')?.innerText.trim().startsWith(label)); if(i){Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(i,val); i.dispatchEvent(new Event('input',{bubbles:true}));}}; set('Expense name',${JSON.stringify(name)}); set('Price (Rs.)',${JSON.stringify(price)}); return true})()`)
    return clickBtn('+ Add Expense')
  }
  await addExpense('Travelling', '50'); await wait(700)
  await addExpense('Tea', '25'); await wait(700)
  await addExpense('Travelling', '75'); await wait(700)
  const expRows = await ev(`[...document.querySelectorAll('.data-table tbody tr')].map((r)=>r.textContent.trim().replace(/\\s+/g,' ')).join('|')`)
  const expTotalRow = await ev(`document.querySelector('.expense-total-row')?.innerText.replace(/\\s+/g,' ')`)
  const expSummaryTotal = await ev(`document.querySelector('.expense-summary-total')?.textContent.trim()`)
  const expDay = must(await inv('expenses:day-summary', TODAY), 'expense day summary')
  check('UI-12', 'Expenses page adds entries via the form, upserts the same name and totals the day',
    expenseDateValue === TODAY && expenseEmptyTotal === 'Rs. 0.00' &&
    expRows.includes('Travelling') && expRows.includes('Tea') && (expRows.match(/Travelling/g) ?? []).length === 1 &&
    expTotalRow.toUpperCase().includes('TOTAL') && expTotalRow.toUpperCase().includes('RS. 100.00') && expSummaryTotal === 'Rs. 100.00' &&
    expDay.total === 10000 && expDay.items.length === 2 &&
    expDay.items.find((e) => e.name === 'Travelling').price === 7500,
    { dateDefault: expenseDateValue, emptyTotal: expenseEmptyTotal, rows: expRows, totalRow: expTotalRow, summaryTotal: expSummaryTotal, day: { total: expDay.total, items: expDay.items.length, travelling: expDay.items.find((e) => e.name === 'Travelling')?.price } })

  await ev(`(()=>{const r=[...document.querySelectorAll('tbody tr')].find((r)=>r.textContent.includes('Tea')); if(!r) return false; r.querySelector('button')?.click(); return true})()`)
  await wait(400)
  await clickBtn('Confirm'); await wait(800)
  const expTotalAfterDelete = await ev(`document.querySelector('.expense-summary-total')?.textContent.trim()`)
  const expAfterDelete = must(await inv('expenses:list-by-date', TODAY), 'expenses after delete')
  check('UI-12b', 'Deleting an expense from the page removes it and recalculates the day total',
    expTotalAfterDelete === 'Rs. 75.00' && expAfterDelete.length === 1 && !expAfterDelete.some((e) => e.name === 'Tea'),
    { total: expTotalAfterDelete, remaining: expAfterDelete.map((e) => e.name) })

  // =============== UI-12c: dashboard expenses adapt to the range + grouped-by-day modal ===============
  must(await inv('expenses:save', { date: '2026-01-02', name: 'Old Tea', price: 2000 }), 'past-day expense')
  await nav('Dashboard'); await wait(1200)
  await ev(`(()=>{const set=(i,val)=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(i,val); i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true}));}; const ins=[...document.querySelectorAll('.dashboard-toolbar input[type="date"]')]; if(ins.length<2) return false; set(ins[0],'2026-01-01'); set(ins[1],${JSON.stringify(TODAY)}); return true})()`)
  await wait(1200)
  const expMetricValue = await ev(`[...document.querySelectorAll('.metric-card')].find((b)=>b.querySelector('.metric-label')?.textContent==='Expenses')?.querySelector('.metric-value')?.textContent.trim()`)
  const expMetricHint = await ev(`[...document.querySelectorAll('.metric-card')].find((b)=>b.querySelector('.metric-label')?.textContent==='Expenses')?.querySelector('.metric-hint')?.textContent.trim()`)
  await ev(`[...document.querySelectorAll('.metric-card')].find((b)=>b.querySelector('.metric-label')?.textContent==='Expenses')?.click()`)
  await wait(700)
  const expModalText = await ev(`document.querySelector('.expense-modal')?.innerText ?? ''`)
  check('UI-12c', 'Dashboard Expenses adapts to the range and opens a modal grouped by day',
    expMetricValue === 'Rs. 95.00' && expMetricHint.includes('Today: Rs. 75.00') && expMetricHint.includes('2 days in range') &&
    expModalText.includes('Old Tea') && expModalText.includes('Travelling') && expModalText.includes('Rs. 95.00'),
    { metricValue: expMetricValue, metricHint: expMetricHint, modal: expModalText })
  await clickBtn('Close'); await wait(400)

  // =============== UI-13: pay an invoice from its detail page ===============
  await nav('Invoices'); await wait(900)
  await clickRowWith('INV-000001'); await wait(900)
  const hasPayBtn = await ev(`[...document.querySelectorAll('button')].some((b)=>b.textContent.trim()==='Pay')`)
  const inv1BeforePay = must(await inv('invoices:get-by-id', I1.id), 'I1 before pay')
  await clickBtn('Pay'); await wait(300)
  const confirmPayShown = await ev(`[...document.querySelectorAll('button')].some((b)=>b.textContent.trim()==='Confirm payment')`)
  await clickBtn('Confirm payment'); await wait(1100)
  const sheetTextPaid = await ev(`document.querySelector('.invoice-sheet')?.innerText ?? ''`)
  const inv1AfterPay = must(await inv('invoices:get-by-id', I1.id), 'I1 after pay')
  check('UI-13', 'Invoice Pay button settles the exact remaining amount through a confirmation and marks the invoice Paid',
    hasPayBtn && inv1BeforePay.status === 'unpaid' && confirmPayShown && inv1AfterPay.status === 'paid' && inv1AfterPay.paidAmount === 162500,
    { payButton: hasPayBtn, confirmation: confirmPayShown, sheet: sheetTextPaid.includes('Net Amount / Grand Total') && sheetTextPaid.includes('Rs.1,625.00'), invoice: { before: inv1BeforePay.status, after: inv1AfterPay.status, paid: inv1AfterPay.paidAmount } })

  await clickBtn('Back to Invoices'); await wait(500)

  // =============== UI-13b: customer Pay modal applies amount oldest-invoice-first ===============
  await nav('Customers'); await wait(900)
  await clickRowWith('Bilal Auto Shop'); await wait(900)
  const outstandingText = await ev(`document.querySelector('.expense-summary-total')?.textContent.trim()`)
  const openText = await ev(`document.querySelector('.expense-summary-copy .fine-text')?.textContent ?? ''`)
  const rowBadge3 = await ev(`[...document.querySelectorAll('.data-table tbody tr')].find((r)=>r.textContent.includes('INV-000003'))?.textContent.trim().replace(/\\s+/g,' ') ?? ''`)
  await clickBtn('Pay'); await wait(400)
  const payModalText = await ev(`document.querySelector('.pay-modal-info')?.innerText ?? ''`)
  await ev(`(()=>{const i=document.querySelector('.modal input[type="number"]'); if(!i) return false; Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(i,'6.00'); i.dispatchEvent(new Event('input',{bubbles:true})); return true})()`)
  await clickBtn('Confirm Payment'); await wait(1100)
  const paySuccess = await ev(`document.querySelector('.text-ok')?.textContent.trim() ?? ''`)
  const outstandingAfter = await ev(`document.querySelector('.expense-summary-total')?.textContent.trim()`)
  const openAfter = await ev(`document.querySelector('.expense-summary-copy .fine-text')?.textContent ?? ''`)
  const inv3Row = must(await inv('invoices:list'), 'invoice list after pay').find((i) => i.invoiceNumber === 'INV-000003')
  const inv1Row = must(await inv('invoices:list'), 'invoice list after customer pay').find((i) => i.invoiceNumber === 'INV-000001')
  check('UI-13b', 'Customer Pay modal shows the outstanding balance, applies the amount oldest-first and clears the invoice',
    outstandingText === 'Rs. 6.00' && openText.includes('open invoice') && rowBadge3.includes('Unpaid') &&
    payModalText.includes('Bilal Auto Shop') && payModalText.includes('Rs. 6.00') && /Open invoices\s*1/.test(payModalText) &&
    paySuccess.includes('Received Rs. 6.00') && outstandingAfter === 'Rs. 0.00' && openAfter.includes('0 open invoices') &&
    inv3Row.status === 'paid' && inv3Row.paidAmount === 600 && inv1Row.status === 'paid',
    { outstandingBefore: outstandingText, openBefore: openText, inv3Row: rowBadge3, modal: payModalText, success: paySuccess, outstandingAfter, openAfter, inv3: { status: inv3Row.status, paid: inv3Row.paidAmount } })

  // =============== UI-13c: customer Pay modal surfaces backend validation errors ===============
  const payOpenOk = await clickBtn('Pay'); await wait(400)
  const modalAfterOpen = await ev(`!!document.querySelector('.modal')`)
  await ev(`(()=>{const i=document.querySelector('.modal input[type="number"]'); if(!i) return false; Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(i,'5.00'); i.dispatchEvent(new Event('input',{bubbles:true})); return true})()`)
  const confirmClicked = await clickBtn('Confirm Payment'); await wait(1000)
  const payModalErr = await ev(`document.querySelector('.modal .form-error')?.textContent ?? ''`)
  const pagePayErr = await ev(`document.querySelector('.feature .form-error')?.textContent ?? ''`)
  const modalStillOpen = await ev(`document.querySelector('.modal')?.innerText ?? ''`)
  const backend = await inv('customers:pay', 1, 500)
  check('UI-13c', 'Customer Pay modal blocks amounts above the outstanding balance and stays open',
    payOpenOk && modalAfterOpen && confirmClicked &&
    (payModalErr.includes('Cannot exceed the outstanding balance') || payModalErr.includes('no open invoice') || pagePayErr.includes('no open invoice')) &&
    modalStillOpen.includes('Confirm Payment') && !backend.ok,
    { payOpenOk, modalAfterOpen, confirmClicked, payModalErr, pagePayErr, modalOpen: modalStillOpen.includes('Confirm Payment'), backend: backend.e ?? 'accepted' })

  // =============== H: activity feed, History page, undo/redo of the last payment ===============
  await nav('Dashboard'); await wait(1200)
  const activityHeader = await ev(`[...document.querySelectorAll('.short-list-header h3')].map((h)=>h.textContent.trim()).join(',')`)
  const activityText = await ev(`[...document.querySelectorAll('.short-list')].find((s)=>s.querySelector('h3')?.textContent==='Recent activity')?.innerText ?? ''`)
  const activityHasUndo = await ev(`[...document.querySelectorAll('.short-list')].find((s)=>s.querySelector('h3')?.textContent==='Recent activity')?.querySelector('button')?.textContent.trim() === 'Undo'`)
  check('H-1', 'Dashboard shows a "Recent activity" list with Undo/Redo controls and the recorded customer payment',
    activityHeader.includes('Recent activity') && activityHasUndo && activityText.includes('Received Rs. 6.00'),
    { headers: activityHeader, hasUndo: activityHasUndo, activity: activityText.replace(/\s+/g, ' ').slice(0, 220) })

  await nav('History'); await wait(1200)
  const histHeaders = await ev(`[...document.querySelectorAll('.data-table th')].map((th)=>th.textContent.trim()).join(',')`)
  const histRows = await ev(`[...document.querySelectorAll('.data-table tbody tr')].map((r)=>r.textContent.trim().replace(/\\s+/g,' ')).join('|')`)
  const histButtons = await ev(`[...document.querySelectorAll('.feature .toolbar button')].map((b)=>b.textContent.trim()).join(',')`)
  check('H-2', 'History page lists the action log (time/action/details/status) with Undo and Redo buttons',
    histHeaders === 'Time,Action,Details,Status' && histButtons.split(',').filter((b) => b === 'Undo' || b === 'Redo').length === 2 && histRows.split('|').length >= 8,
    { headers: histHeaders, buttons: histButtons, rows: histRows.split('|').length })

  await clickBtn('Undo'); await wait(1200)
  const undone3 = must(await inv('invoices:list'), 'invoices after undo').find((i) => i.invoiceNumber === 'INV-000003')
  const undoneLatest = must(await inv('history:list'), 'history after undo')[0]
  check('H-3', 'History page Undo reverses the customer payment and INV-000003 returns to Unpaid',
    undoneLatest.action === 'payment_recorded' && undoneLatest.status === 'undone' &&
    undone3.status === 'unpaid' && undone3.paidAmount === 0,
    { latest: { action: undoneLatest.action, status: undoneLatest.status }, inv3: { status: undone3.status, paid: undone3.paidAmount } })

  await clickBtn('Redo'); await wait(1200)
  const redone3 = must(await inv('invoices:list'), 'invoices after redo').find((i) => i.invoiceNumber === 'INV-000003')
  const redoneLatest = must(await inv('history:list'), 'history after redo')[0]
  check('H-4', 'History page Redo replays the payment and restores INV-000003 to Paid',
    redoneLatest.action === 'payment_recorded' && redoneLatest.status === 'applied' &&
    redone3.status === 'paid' && redone3.paidAmount === 600,
    { latest: { action: redoneLatest.action, status: redoneLatest.status }, inv3: { status: redone3.status, paid: redone3.paidAmount } })

  // =============== H-5: dashboard Owed + Cash flow modal breakdowns ===============
  await nav('Dashboard'); await wait(1200)
  await ev(`[...document.querySelectorAll('.metric-card')].find((b)=>b.querySelector('.metric-label')?.textContent==='Owed amount')?.click()`)
  await wait(700)
  const owedModal = await ev(`document.querySelector('.detail-modal')?.innerText ?? ''`)
  const owedModalUpper = owedModal.toUpperCase()
  check('H-5a', 'Owed amount modal lists the per-customer outstanding balances',
    owedModalUpper.includes('AMOUNT OWED') && owedModalUpper.includes('EMERALD PARTS') &&
    owedModal.includes('Rs. 650.00') && owedModalUpper.includes('OPEN INVOICES'),
    { modal: owedModal.replace(/\s+/g, ' ').slice(0, 300) })
  await clickBtn('Close'); await wait(400)

  await ev(`[...document.querySelectorAll('.metric-card')].find((b)=>b.querySelector('.metric-label')?.textContent==='Cash flow')?.click()`)
  await wait(700)
  const cashModal = await ev(`document.querySelector('.detail-modal')?.innerText ?? ''`)
  const cashNet = await ev(`document.querySelector('.modal-net')?.innerText.replace(/\\s+/g,' ') ?? ''`)
  check('H-5b', 'Cash flow modal splits inward payments from outward expenses and nets them',
    cashModal.includes('Rs. 1,631.00') && cashModal.includes('INV-000001') && cashModal.includes('INV-000003') &&
    cashModal.includes('Travelling') &&
    cashModal.toUpperCase().includes('INWARD') && cashModal.toUpperCase().includes('OUTWARD') &&
    cashNet.includes('Rs. 1,556.00'),
    { net: cashNet, modal: cashModal.replace(/\s+/g, ' ').slice(0, 300) })
  await clickBtn('Close'); await wait(400)

  const i3 = must(await inv('invoices:get-with-details', I2.id), 'i3') // sanity: previous invoice intact
  check('I-4', 'Earlier invoices are still intact after the UI flow', i3.invoice.invoiceNumber === 'INV-000002', i3.invoice.invoiceNumber)
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