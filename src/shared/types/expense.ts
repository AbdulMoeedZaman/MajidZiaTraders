export interface Expense {
  id: number
  /** Business day the expense belongs to (YYYY-MM-DD). */
  date: string
  name: string
  /** Amount in integer minor units (whole paisa), never negative. */
  price: number
  createdAt: string
  updatedAt: string
}

export interface CreateExpenseDTO {
  date: string
  name: string
  price: number
}

/** One day's expenses, ready for "today's total" and per-day lists. */
export interface ExpenseDaySummary {
  date: string
  total: number
  items: Expense[]
}

/** Expenses across a date range, summed and grouped by day. */
export interface ExpenseRangeSummary {
  from: string
  to: string
  total: number
  byDay: ExpenseDaySummary[]
}