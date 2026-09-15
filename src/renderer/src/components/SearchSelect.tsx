import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Ref } from 'react'

export interface SearchSelectOption<TValue extends string | number = string | number> {
  value: TValue
  label: string
  /** Optional secondary hint line shown beside the label (also searched). */
  hint?: string
}

/** Imperative API so parent forms can open / focus the search input. */
export interface SearchSelectHandle {
  open: () => void
  close: () => void
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
  /** React 19 ref prop: imperative handle to open/focus this combobox. */
  ref?: Ref<SearchSelectHandle>
}

/**
 * Searchable dropdown / combobox. Clicking the trigger opens a filterable list
 * that supports keyboard navigation (↑/↓ move, Enter selects, Esc closes) and
 * clears on outside click. Replaces native `<select>` everywhere in the app.
 *
 * The option list is rendered via a portal on `document.body` and positioned
 * with `position: fixed`, so it pops out above any modal overlay instead of
 * being clipped by `overflow: auto` containers. If there is not enough room
 * below the trigger the list opens upward instead.
 */
export function SearchSelect<TValue extends string | number>({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  emptyText = 'No matches',
  allowClear = true,
  ref,
}: Props<TValue>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [menuPos, setMenuPos] = useState<{
    top: number
    left: number
    width: number
    maxHeight: number
  } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => setOpen(false),
  }))

  const selected = options.find((o) => o.value === value)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q))
  }, [options, query])

  // Position the list under the trigger; open upward when it would fall off-screen.
  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null)
      return
    }
    const position = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const menuHeight = menuRef.current?.offsetHeight ?? 280
      const spaceBelow = window.innerHeight - rect.bottom - 8
      const spaceAbove = rect.top - 8
      if (spaceBelow < menuHeight && spaceAbove > menuHeight && spaceAbove > 8) {
        setMenuPos({
          top: Math.max(8, rect.top - menuHeight - 4),
          left: rect.left,
          width: rect.width,
          maxHeight: Math.min(spaceAbove - 4, 220),
        })
      } else {
        setMenuPos({
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width,
          maxHeight: Math.min(spaceBelow - 4, 220),
        })
      }
    }
    position()
    // Re-measure once the list has painted so the flip decision uses real height.
    const raf = window.requestAnimationFrame(position)
    return () => window.cancelAnimationFrame(raf)
  }, [open])

  // Close on outside click (the list lives outside `rootRef`, check both).
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (rootRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  // Repositioning breaks on scroll/resize; close instead.
  useEffect(() => {
    if (!open) return
    const dismiss = () => setOpen(false)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
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

  const menu = open ? (
    createPortal(
      <div
        ref={menuRef}
        className="search-select-menu"
        style={
          menuPos
            ? {
                position: 'fixed',
                top: menuPos.top,
                left: menuPos.left,
                width: menuPos.width,
                zIndex: 1000,
              }
            : undefined
        }
        role="listbox"
      >
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
        <ul className="search-select-options" style={menuPos ? { maxHeight: menuPos.maxHeight } : undefined}>
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
      </div>,
      document.body
    )
  ) : null

  return (
    <div className="search-select" ref={rootRef}>
      <button
        ref={triggerRef}
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
      {menu}
    </div>
  )
}