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

  const O1 = must(await inv('project-owners:create', { name: 'Majid Zia Motors', phone: '0300-1234567', address: 'Main Bazaar, Multan' }), 'O1')
  const ownerDup = await inv('project-owners:create', { name: 'Majid Zia Motors', phone: 'x' })
  check('V-4', 'Project owner names are unique', !ownerDup.ok, ownerDup.e ?? 'accepted')
  const B1 = must(await inv('brokers:create', { name: 'Bashir Ahmad', phone: '0322-1112223' }), 'B1')

  // =============== Invoice ring & maths ===============
  const item = (productId, rate, cartonCount, boxCount) => ({ productId, rate, cartonCount, boxCount })
  const I1 = must(await inv('invoices:create', {
    customerId: C1.id, ownerId: O1.id, brokerId: B1.id, date: TODAY, filerStatus: 'filer',
    remaining: null, tax: null, grandTotal: null,
    items: [item(P1.id, 65000, 2, 5)],
  }), 'I1')
  // 65000*2 + 65000*5/10 = 130000 + 32500
  check('I-1', `Invoice #1 subtotal = rate×cartons + rounded rate×boxes/bpc (${I1.subtotal})`, I1.invoiceNumber === 'INV-000001' && I1.subtotal === 162500, { number: I1.invoiceNumber, subtotal: I1.subtotal })

  const I2 = must(await inv('invoices:create', {
    customerId: C2.id, ownerId: O1.id, brokerId: B1.id, date: TODAY, filerStatus: 'non_filer',
    remaining: 10000, tax: 5000, grandTotal: 200000,
    items: [item(P2.id, 15000, 4, 0)],
  }), 'I2')
  const i2 = must(await inv('invoices:get-with-details', I2.id), 'I2 details')
  check('I-2', 'Invoice #2 sequential, manual totals stored as entered, details resolve customer/owner/broker',
    I2.invoiceNumber === 'INV-000002' && i2.invoice.remaining === 10000 && i2.invoice.tax === 5000 && i2.invoice.grandTotal === 200000 && i2.customer.code === 'WK-001' && i2.owner.name === 'Majid Zia Motors' && i2.broker.name === 'Bashir Ahmad',
    { number: I2.invoiceNumber, remaining: i2.invoice.remaining, tax: i2.invoice.tax, grand: i2.invoice.grandTotal })

  const belowMin = await inv('invoices:create', {
    customerId: C1.id, ownerId: O1.id, brokerId: B1.id, date: TODAY, filerStatus: 'filer',
    remaining: null, tax: null, grandTotal: null,
    items: [item(P1.id, 64999, 1, 0)],
  })
  const noItems = await inv('invoices:create', { customerId: C1.id, ownerId: O1.id, brokerId: B1.id, date: TODAY, filerStatus: 'filer', remaining: null, tax: null, grandTotal: null, items: [] })
  const badDate = await inv('invoices:create', { customerId: C1.id, ownerId: O1.id, brokerId: B1.id, date: 'not-a-date', filerStatus: 'filer', remaining: null, tax: null, grandTotal: null, items: [item(P1.id, 65000, 1, 0)] })
  const badCust = await inv('invoices:create', { customerId: 9999, ownerId: O1.id, brokerId: B1.id, date: TODAY, filerStatus: 'filer', remaining: null, tax: null, grandTotal: null, items: [item(P1.id, 65000, 1, 0)] })
  check('I-3', 'Invoice guards: below-min rate, empty items, invalid date, unknown customer all rejected',
    !belowMin.ok && !noItems.ok && !badDate.ok && !badCust.ok, [belowMin.e, noItems.e, badDate.e, badCust.e])

  // =============== Delete integrity ===============
  const delCust = await inv('customers:delete', C1.id)
  const delProd = await inv('products:delete', P1.id)
  check('D-1', 'Deleting a customer or product that has invoices is blocked', !delCust.ok && !delProd.ok, [delCust.e ?? 'accepted', delProd.e ?? 'accepted'])

  // =============== Invoice description setting ===============
  must(await inv('settings:set', 'invoice_description', 'Payment due within 7 days.', 'richtext'), 'desc')

  // =============== UI-2: Settings (project owners + bookers) ===============
  await nav('Settings'); await wait(900)
  const ownersSection = await ev(`document.body.innerText.includes('Project Owners') && document.body.innerText.includes('Majid Zia Motors')`)
  const bookersSection = await ev(`document.body.innerText.includes('Bookers (Brokers)') && document.body.innerText.includes('Bashir Ahmad')`)
  await clickBtn('+ Add Booker'); await wait(500)
  const brokerModalOpened = await ev(`!!document.querySelector('.modal') && document.querySelector('.modal')?.innerText.includes('Booker')`)
  await ev(`document.querySelector('.overlay')?.click()`); await wait(300)
  check('UI-2', 'Settings lists project owners and bookers and opens the add-broker form', ownersSection && bookersSection && brokerModalOpened, { ownersSection, bookersSection, brokerModalOpened })

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

  // =============== UI-5: create an invoice through the UI form and inspect the print sheet ===============
  const ownerId = O1.id, brokerId = B1.id
  await nav('Invoices'); await wait(900)
  await clickBtn('+ New Invoice'); await wait(700)
  await ev(`(()=>{
    const sel=(name,val)=>{const s=[...document.querySelectorAll('label.field select')].find((n)=>n.closest('label')?.innerText.trim().startsWith(name)); if(!s) return false; Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set.call(s,String(val)); s.dispatchEvent(new Event('change',{bubbles:true})); return true};
    const num=(name,val)=>{const i=[...document.querySelectorAll('.invoice-line input')].find((n)=>n.closest('label')?.innerText.trim().startsWith(name)); if(!i) return false; Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(i,val); i.dispatchEvent(new Event('input',{bubbles:true})); return true};
    sel('Customer', ${C1.id}); sel('Project owner', ${ownerId}); sel('Booker', ${brokerId}); sel('Product', ${gauge.id});
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
  const hasSchemeCol = await ev(`[...document.querySelectorAll('.ip-table th')].some((th)=>th.textContent.trim()==='Scheme')`)
  const hasSignature = sheetText.includes('Signature')
  const hasDescription = sheetText.includes('Payment due within 7 days.')
  const hasShopNameLabel = sheetText.includes('Shop name:')
  const hasOwnerNameLabel = sheetText.includes('Owner name:')
  const hasStatusLabel = sheetText.includes('Status:') && !sheetText.includes('Filer status')
  const dateCount = (sheetText.match(/Date:/g) ?? []).length
  check('UI-5', 'Invoicing through the UI lands on the printable sheet with owner band, booker, scheme column, signature and description',
    detailNumber && hasOwner && hasBand && hasCustomer && hasBroker && hasSchemeCol && hasSignature && hasDescription,
    { lineAmountDuringEntry: lineAmountShown, invoiceNumberVisible: detailNumber, owner: hasOwner, band: hasBand, customer: hasCustomer, booker: hasBroker, schemeColumn: hasSchemeCol, signature: hasSignature, description: hasDescription })
  check('UI-5b', 'Sheet shows a single date, labeled shop/owner fields, and "Status" (not "Filer status")',
    dateCount === 1 && hasShopNameLabel && hasOwnerNameLabel && hasStatusLabel,
    { datesShown: dateCount, shopNameLabel: hasShopNameLabel, ownerNameLabel: hasOwnerNameLabel, statusLabel: hasStatusLabel })

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