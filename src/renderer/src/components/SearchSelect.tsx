import { useEffect, useMemo, useRef, useState } from 'react'

export interface SearchSelectOption<TValue extends string | number = string | number> {
  value: TValue
  label: string
  /** Optional secondary hint line shown beside the label (also searched). */
  hint?: string
}

interface Props<TValue extends string | number> {
  options: SearchSelectOption<TValue>[]
  value: TValue | null
  onChange: (value: TValue | null) => void
  placeholder?: string
  /** Shown when the search returns no options. */
  emptyText?: string
  /** When true (default) a ✕ lets the user reset the selection to null. */
  allowClear?: boolean
}

/**
 * Searchable dropdown / combobox. Clicking the trigger opens a filterable list
 * that supports keyboard navigation (↑/↓ move, Enter selects, Esc closes) and
 * clears on outside click. Replaces native `<select>` everywhere in the app.
 */
export function SearchSelect<TValue extends string | number>({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  emptyText = 'No matches',
  allowClear = true,
}: Props<TValue>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.value === value)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q))
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlight(0)
      inputRef.current?.focus()
    }
  }, [open])

  const toggle = () => setOpen((prev) => !prev)

  const select = (opt: SearchSelectOption<TValue>) => {
    onChange(opt.value)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      const opt = filtered[highlight] ?? filtered[0]
      if (opt) select(opt)
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div className="search-select" ref={rootRef}>
      <button
        type="button"
        className="search-select-trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => toggle()}
      >
        <span className={`search-select-value${selected ? '' : ' muted'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="search-select-caret" aria-hidden="true">▾</span>
      </button>
      {allowClear && value !== null && !open && (
        <button
          type="button"
          className="search-select-clear"
          aria-label="Clear selection"
          onClick={(e) => {
            e.stopPropagation()
            onChange(null)
          }}
        >
          ✕
        </button>
      )}
      {open && (
        <div className="search-select-menu" role="listbox">
          <input
            ref={inputRef}
            className="search-select-input"
            value={query}
            placeholder="Search…"
            onChange={(e) => {
              setQuery(e.target.value)
              setHighlight(0)
            }}
            onKeyDown={onKeyDown}
          />
          <ul className="search-select-options">
            {filtered.length === 0 ? (
              <li className="search-select-empty">{emptyText}</li>
            ) : (
              filtered.map((opt, i) => (
                <li key={String(opt.value)}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === highlight}
                    className={`search-select-option${i === highlight ? ' active' : ''}`}
                    data-value={String(opt.value)}
                    data-label={opt.label}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      select(opt)
                    }}
                    onMouseEnter={() => setHighlight(i)}
                  >
                    <span className="search-select-option-label">{opt.label}</span>
                    {opt.hint && <span className="search-select-option-hint">{opt.hint}</span>}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}