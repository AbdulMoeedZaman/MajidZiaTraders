/** Date printed on invoice sheets as DD-MM-YYYY (falls back to the raw ISO string). */
export function printDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso
}

/** Money printed on invoice sheets as "Rs.<value>" with no decimal part. */
export function printMoney(cents: number | null | undefined): string {
  return (
    'Rs.' +
    Math.trunc((cents ?? 0) / 100).toLocaleString(undefined, {
      maximumFractionDigits: 0,
    })
  )
}