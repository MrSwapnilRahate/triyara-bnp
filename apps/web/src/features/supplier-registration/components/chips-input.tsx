'use client'

import { Badge, Input, Label } from '@triyara/ui'
import { X } from 'lucide-react'
import { useId, useState } from 'react'

/**
 * A bounded list of short free-text entries.
 *
 * Enter and comma both commit, because people paste comma-separated lists into
 * fields like this and expect them to split. Backspace on an empty box removes
 * the last entry, which is the one interaction everyone tries.
 */
export function ChipsInput({
  label,
  hint,
  placeholder,
  values,
  onChange,
  maxItems = 50,
  transform,
}: {
  label: string
  hint?: string
  placeholder?: string
  values: string[]
  onChange: (next: string[]) => void
  maxItems?: number
  /** Normalises an entry, e.g. upper-casing a country code. */
  transform?: (value: string) => string
}) {
  const inputId = useId()
  const [text, setText] = useState('')

  function commit(raw: string) {
    const parts = raw
      .split(',')
      .map((part) => (transform ? transform(part.trim()) : part.trim()))
      .filter(Boolean)
    if (parts.length === 0) return
    const next = [...values]
    for (const part of parts) {
      if (next.length >= maxItems) break
      if (!next.includes(part)) next.push(part)
    }
    onChange(next)
    setText('')
  }

  return (
    <div className="space-y-gap-xs">
      <Label htmlFor={inputId}>{label}</Label>
      {hint ? <p className="text-2xs text-content-muted">{hint}</p> : null}

      {values.length > 0 ? (
        <ul className="flex flex-wrap gap-gap-xs" aria-label={`${label} entries`}>
          {values.map((value) => (
            <li key={value}>
              <Badge tone="neutral" size="sm" className="gap-1">
                {value}
                <button
                  type="button"
                  onClick={() => onChange(values.filter((v) => v !== value))}
                  aria-label={`Remove ${value}`}
                  className="focus-ring -mr-0.5 rounded-xs text-content-muted hover:text-content"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}

      <Input
        id={inputId}
        value={text}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => commit(text)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault()
            commit(text)
          } else if (event.key === 'Backspace' && text === '' && values.length > 0) {
            onChange(values.slice(0, -1))
          }
        }}
      />
    </div>
  )
}
