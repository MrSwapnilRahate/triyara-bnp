'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Cat = { id: string; name: string; slug: string; parentId: string | null; version: number }

const field =
  'rounded-lg border border-white/15 bg-navy/50 px-3 py-2 text-sm text-white focus:border-gold/60 focus:outline-none'
const btn =
  'rounded-lg bg-gold px-3 py-1.5 text-sm font-semibold text-navy hover:bg-gold-light disabled:opacity-50'
const ghost =
  'rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:text-white disabled:opacity-50'

async function api(url: string, init?: RequestInit): Promise<void> {
  const res = await fetch(url, { credentials: 'include', ...init })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.success)
    throw new Error(body?.errors?.[0]?.message ?? `Failed (${res.status})`)
}

export function CategoryManager({
  categories,
  canWrite,
}: {
  categories: Cat[]
  canWrite: boolean
}) {
  const router = useRouter()
  const [msg, setMsg] = useState<string | null>(null)
  const byId = new Map(categories.map((c) => [c.id, c]))

  async function run(fn: () => Promise<void>) {
    try {
      await fn()
      router.refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed')
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/products" className="hover:text-gold text-xs text-white/40">
        &larr; Catalog
      </Link>
      <h1 className="text-gold mt-2 text-2xl font-bold">Categories</h1>
      {msg ? <p className="mt-2 text-sm text-red-400">{msg}</p> : null}

      {canWrite ? (
        <form
          className="mt-5 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            const name = String(fd.get('name') ?? '').trim()
            const parentId = String(fd.get('parentId') ?? '') || undefined
            if (name)
              void run(() =>
                api('/api/v1/categories', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ name, parentId }),
                }),
              ).then(() => e.currentTarget?.reset?.())
          }}
        >
          <input name="name" placeholder="New category name" required className={field} />
          <select name="parentId" className={field} defaultValue="">
            <option value="">(top level)</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button className={btn}>Add</button>
        </form>
      ) : null}

      <ul className="mt-6 space-y-2">
        {categories.length === 0 ? (
          <li className="text-sm text-white/40">No categories yet.</li>
        ) : null}
        {categories.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm"
          >
            <span className="text-white">
              {c.parentId ? (
                <span className="text-white/30">{byId.get(c.parentId)?.name} / </span>
              ) : null}
              {c.name} <span className="font-mono text-xs text-white/30">{c.slug}</span>
            </span>
            {canWrite ? (
              <span className="flex gap-2">
                <button
                  className={ghost}
                  onClick={() => {
                    const name = window.prompt('Rename category', c.name)
                    if (name && name.trim())
                      void run(() =>
                        api(`/api/v1/categories/${c.id}`, {
                          method: 'PATCH',
                          headers: {
                            'content-type': 'application/json',
                            'if-match': `v${c.version}`,
                          },
                          body: JSON.stringify({ name: name.trim() }),
                        }),
                      )
                  }}
                >
                  Rename
                </button>
                <button
                  className="text-xs text-red-300 hover:text-red-200"
                  onClick={() =>
                    void run(() =>
                      api(`/api/v1/categories/${c.id}`, {
                        method: 'DELETE',
                        headers: { 'if-match': `v${c.version}` },
                      }),
                    )
                  }
                >
                  Delete
                </button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
