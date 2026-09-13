import path from 'path'
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { CustomerService } from '../../src/main/services/customer.service'
import { useTestDatabase, seedBasics, routeIdFor } from './helpers'

describe('CustomerService.importFromExcel', () => {
  useTestDatabase()

  const writePath = (name: string): string => path.join(process.env.TEST_USER_DATA!, name)

  it('imports stores from the sheet that has a Store Code column into the given single route', () => {
    const service = new CustomerService()
    const monday = routeIdFor('Monday')
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([['Selected National'], ['Selected Zone'], ['Selected Area']]),
      'Filters'
    )
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Store Code', 'Store Name', 'Filer Status', 'Owner Name', 'Owner Contact #', 'Address'],
        ['N00124303', 'Al Madina Traders', 'Filer', 'Haji Farman', '03006250504', 'Tanda'],
        ['N00124304', 'Cash & Carry', 'Non-Filer', 'Sohail', '03366010782', 'Baghowala'],
        ['N00124305', '', 'Filer', 'Abdul Ghafoor', '03006274413', ''],
        ['N00124306', 'Solo Shop', 'Filer', '', '03049215480', ''],
        ['', 'No Code Shop', 'Filer', 'Someone', '', ''],
        ['N00124307', 'Duplicate Store', 'Filer', 'Bilal', '', ''],
      ]),
      'Stores'
    )
    const fp = writePath('stores.xlsx')
    XLSX.writeFile(wb, fp)

    const result = service.importFromExcel(fp, monday)

    expect(result.created).toBe(5)
    expect(result.skippedInvalid).toBe(1)
    expect(result.skippedDuplicate).toBe(0)

    const byCode = Object.fromEntries(result.customers.map((c) => [c.code, c]))
    expect(byCode['N00124303'].shopName).toBe('Al Madina Traders')
    expect(byCode['N00124303'].ownerName).toBe('Haji Farman')
    expect(byCode['N00124303'].phone).toBe('03006250504')
    expect(byCode['N00124303'].address).toBe('Tanda')
    expect(byCode['N00124303'].routeId).toBe(monday)
    expect(byCode['N00124304'].routeId).toBe(monday)
    expect(byCode['N00124305'].shopName).toBe('')
    expect(byCode['N00124305'].ownerName).toBe('Abdul Ghafoor')
    expect(byCode['N00124306'].ownerName).toBe('')
    expect(service.listByRoute(monday)).toHaveLength(5)
  })

  it('skips rows whose store code already exists and honours the requested route', () => {
    const service = new CustomerService()
    seedBasics() // seeds customer code C-001 on Monday
    const tuesday = routeIdFor('Tuesday')
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Store Code', 'Store Name', 'Owner Name'],
        ['C-001', 'Same Code Shop', 'Duplicator'],
        ['N222', 'New Shop', 'New Owner'],
      ]),
      'Stores'
    )
    const fp = writePath('dup.xlsx')
    XLSX.writeFile(wb, fp)

    const result = service.importFromExcel(fp, tuesday)

    expect(result.created).toBe(1)
    expect(result.skippedDuplicate).toBe(1)
    expect(result.customers[0].code).toBe('N222')
    expect(result.customers[0].routeId).toBe(tuesday)
    expect(service.listByRoute(tuesday)).toHaveLength(1)
  })

  it('fails clearly on a missing file or one without a Store Code column', () => {
    const service = new CustomerService()
    const monday = routeIdFor('Monday')

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Name', 'Phone']]), 'Sheet1')
    const fp = writePath('bad.xlsx')
    XLSX.writeFile(wb, fp)

    expect(() => service.importFromExcel(fp, monday)).toThrow(/Store Code/)
    expect(() =>
      service.importFromExcel(path.join(process.env.TEST_USER_DATA!, 'missing.xlsx'), monday),
    ).toThrow(/ENOENT|no such file/)
  })
})