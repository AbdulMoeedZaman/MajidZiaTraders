const KEY = 'mztraders:selected-route'

/** The route selected in the Customers page, persisted across views. */
export function getSelectedRoute(): number | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const id = Number(raw)
    return Number.isInteger(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

export function setSelectedRoute(id: number): void {
  try {
    localStorage.setItem(KEY, String(id))
  } catch {
    // Storage can be unavailable (private mode); the selection is cosmetic.
  }
}