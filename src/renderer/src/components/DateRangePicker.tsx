import { useState } from 'react'
import { localDate } from '@shared/date'
import { formatDate } from '../lib/format'

export interface DateRangeValue {
  from: string
  to: string
}

interface DateRangePickerProps {
  from: string
  to: string
  onChange: (value: DateRangeValue) => void
  placeholder?: string
  className?: string
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function firstDayOfMonth(iso: string): Date {
  const [y, m] = iso.split('-').map(Number)
  if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
    return new Date(y, m - 1, 1)
  }
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

function isEdgeDay(day: string, edgeA: string, edgeB: string): boolean {
  return day === edgeA || day === edgeB
}

function isBetween(day: string, edgeA: string, edgeB: string): boolean {
  const lo = edgeA < edgeB ? edgeA : edgeB
  const hi = edgeA < edgeB ? edgeB : edgeA
  return day > lo && day < hi
}

/**
 * Single-calendar date range picker.
 *
 * Selection model: the first click marks a temporary "anchor" point. The second
 * click completes the range — if it is earlier than the anchor it becomes `from` and
 * the anchor becomes `to`; if later, the anchor becomes `from` and it becomes `to`.
 * The calendar always highlights the committed range (or the live preview while the
 * second click is pending) so the selection snaps into place on the second click.
 */
export function DateRangePicker({ from, to, onChange, placeholder, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<Date>(() => firstDayOfMonth(from))
  const [anchor, setAnchor] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)

  const openPopover = () => {
    setView(firstDayOfMonth(from))
    setAnchor(null)
    setHover(null)
    setOpen(true)
  }

  const closePopover = () => {
    setOpen(false)
    setAnchor(null)
    setHover(null)
  }

  const handleDayClick = (day: string) => {
    if (anchor === null) {
      setAnchor(day)
      return
    }
    onChange(day < anchor ? { from: day, to: anchor } : { from: anchor, to: day })
    setAnchor(null)
    setHover(null)
  }

  const year = view.getFullYear()
  const month = view.getMonth()
  const monthDays = new Date(year, month + 1, 0).getDate()
  const leadingBlanks = (new Date(year, month, 1).getDay() + 6) % 7 // Monday-first weeks

  const cells: Array<string | null> = []
  for (let i = 0; i < leadingBlanks; i++) cells.push(null)
  for (let d = 1; d <= monthDays; d++) cells.push(localDate(new Date(year, month, d)))

  const today = localDate()
  const hasRange = Boolean(from && to)
  const rangeA = hasRange ? (from < to ? from : to) : null
  const rangeB = hasRange ? (from < to ? to : from) : null

  const cellClass = (day: string | null): string => {
    const cls = ['date-range-day']
    if (!day) {
      cls.push('empty')
      return cls.join(' ')
    }
    const edgeA = anchor ?? rangeA
    const edgeB = anchor ? hover ?? anchor : rangeB
    if (edgeA && edgeB) {
      if (isEdgeDay(day, edgeA, edgeB)) cls.push('start-end')
      else if (isBetween(day, edgeA, edgeB)) cls.push('in-range')
    }
    if (day === today && !cls.includes('start-end')) cls.push('today')
    return cls.join(' ')
  }

  const label =
    from && to
      ? from === to
        ? formatDate(from)
        : `${formatDate(from)} – ${formatDate(to)}`
      : from
        ? `From ${formatDate(from)}`
        : to
          ? `To ${formatDate(to)}`
          : (placeholder ?? 'Select a date range')

  return (
    <div className={`date-range-picker${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="date-range-trigger"
        onClick={open ? closePopover : openPopover}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Pick a date range"
      >
        <span className="date-range-label">{label}</span>
        <span className="date-range-caret">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <>
          <div className="date-range-backdrop" onClick={closePopover} />
          <div className="date-range-popover" role="dialog" aria-label="Pick a date range">
            <div className="date-range-header">
              <div className="date-range-month-label">
                {MONTHS[month]} {year}
              </div>
              <div className="date-range-nav">
                <button
                  type="button"
                  onClick={() => setView(new Date(year, month - 1, 1))}
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => setView(new Date(year, month + 1, 1))}
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>
            </div>

            <div className="date-range-grid">
              {WEEKDAYS.map((w) => (
                <div key={w} className="date-range-weekday">
                  {w}
                </div>
              ))}
              {cells.map((day, i) => (
                <button
                  key={i}
                  type="button"
                  className={cellClass(day)}
                  disabled={day === null}
                  onClick={() => {
                    if (day) handleDayClick(day)
                  }}
                  onMouseEnter={() => {
                    if (day) setHover(day)
                  }}
                >
                  {day ? Number(day.slice(8, 10)) : ''}
                </button>
              ))}
            </div>

            {(from || to) && (
              <div className="date-range-footer">
                <button
                  type="button"
                  className="date-range-clear"
                  onClick={() => {
                    onChange({ from: '', to: '' })
                    setAnchor(null)
                    setHover(null)
                  }}
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}