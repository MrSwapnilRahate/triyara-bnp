'use client'

import type { ProductListItem } from '@triyara/db'
import { PRODUCT_STATUSES } from '@triyara/validation'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

type Opt = {
  id: string
  name?: string
  code?: string
  description?: string
  key?: string
  label?: string
  dataType?: string
  unit?: string | null
}
type Ref = {
  categories: { id: string; name: string }[]
  units: Opt[]
  packaging: Opt[]
  origins: Opt[]
  hsCodes: Opt[]
  attributes: Opt[]
}

const field =
  'rounded-lg border border-white/15 bg-navy/50 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-gold/60 focus:outline-none'
const btn =
  'rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-navy hover:bg-gold-light disabled:opacity-50'
const ghost =
  'rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:text-white disabled:opacity-50'

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.success)
    throw new Error(body?.errors?.[0]?.message ?? `Failed (${res.status})`)
  return body.data as T
}

interface ProductDetail {
  id: string
  sku: string
  slug: string
  name: string
  shortDescription: string | null
  description: string | null
  categoryId: string | null
  hsCodeId: string | null
  originCountryId: string | null
  defaultUnitId: string | null
  status: string
  version: number
  attributes: { attributeId: string; value: string }[]
  packaging: { packagingTypeId: string }[]
}

export function ProductsView({
  items,
  nextCursor,
  canWrite,
  ref,
}: {
  items: ProductListItem[]
  nextCursor: string | null
  canWrite: boolean
  ref: Ref
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const [editing, setEditing] = useState<ProductDetail | 'new' | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('cursor')
    router.push(`/products?${next.toString()}`)
  }
  const refresh = () => router.refresh()

  async function openEdit(id: string) {
    try {
      const detail = await api<ProductDetail>(`/api/v1/products/${id}`)
      setEditing(detail)
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed' })
    }
  }

  async function rowAction(fn: () => Promise<void>, okText: string) {
    try {
      await fn()
      setMsg({ kind: 'ok', text: okText })
      refresh()
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed' })
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-gold text-2xl font-bold">Product catalog</h1>
        <div className="flex gap-2">
          <Link href="/products/categories" className={ghost}>
            Categories
          </Link>
          {canWrite ? (
            <button className={btn} onClick={() => setEditing('new')}>
              New product
            </button>
          ) : null}
        </div>
      </div>
      {msg ? (
        <p className={`mt-2 text-sm ${msg.kind === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
          {msg.text}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <input
          className={field}
          placeholder="Search name / SKU..."
          defaultValue={sp.get('q') ?? ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setParam('q', (e.target as HTMLInputElement).value)
          }}
        />
        <select
          className={field}
          defaultValue={sp.get('categoryId') ?? ''}
          onChange={(e) => setParam('categoryId', e.target.value)}
        >
          <option value="">All categories</option>
          {ref.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className={field}
          defaultValue={sp.get('status') ?? ''}
          onChange={(e) => setParam('status', e.target.value)}
        >
          <option value="">All statuses</option>
          {PRODUCT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-5 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-white/40">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-white/40">
                  No products yet.{canWrite ? ' Create the first one.' : ''}
                </td>
              </tr>
            ) : (
              items.map((p) => (
                <tr
                  key={p.id}
                  className={`border-t border-white/5 ${p.deletedAt ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-white/70">{p.sku}</td>
                  <td className="px-4 py-3 text-white">{p.name}</td>
                  <td className="px-4 py-3 text-white/50">{p.category?.name ?? '-'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        p.status === 'ACTIVE'
                          ? 'text-green-400'
                          : p.status === 'ARCHIVED'
                            ? 'text-white/40'
                            : 'text-amber-400'
                      }
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canWrite ? (
                      p.deletedAt ? (
                        <button
                          className={ghost}
                          onClick={() =>
                            void rowAction(
                              () =>
                                api(`/api/v1/products/${p.id}/restore`, {
                                  method: 'POST',
                                  headers: { 'if-match': `v${p.version}` },
                                }),
                              'Restored',
                            )
                          }
                        >
                          Restore
                        </button>
                      ) : (
                        <span className="flex justify-end gap-2">
                          <button className={ghost} onClick={() => void openEdit(p.id)}>
                            Edit
                          </button>
                          <button
                            className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                            onClick={() =>
                              void rowAction(
                                () =>
                                  api(`/api/v1/products/${p.id}`, {
                                    method: 'DELETE',
                                    headers: { 'if-match': `v${p.version}` },
                                  }),
                                'Deleted',
                              )
                            }
                          >
                            Delete
                          </button>
                        </span>
                      )
                    ) : (
                      <Link
                        className={ghost}
                        href="#"
                        onClick={(e) => {
                          e.preventDefault()
                          void openEdit(p.id)
                        }}
                      >
                        View
                      </Link>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {nextCursor ? (
        <div className="mt-4 text-center">
          <Link
            href={`/products?${new URLSearchParams({ ...Object.fromEntries(sp), cursor: nextCursor }).toString()}`}
            className="hover:text-gold text-sm text-white/60"
          >
            Load more
          </Link>
        </div>
      ) : null}

      {editing ? (
        <ProductEditor
          product={editing === 'new' ? null : editing}
          ref={ref}
          canWrite={canWrite}
          onClose={() => setEditing(null)}
          onSaved={(m) => {
            setEditing(null)
            setMsg(m)
            refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function ProductEditor({
  product,
  ref,
  canWrite,
  onClose,
  onSaved,
}: {
  product: ProductDetail | null
  ref: Ref
  canWrite: boolean
  onClose: () => void
  onSaved: (m: { kind: 'ok' | 'err'; text: string }) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isNew = product === null
  const attrValues = new Map((product?.attributes ?? []).map((a) => [a.attributeId, a.value]))
  const selectedPackaging = new Set((product?.packaging ?? []).map((p) => p.packagingTypeId))

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    const str = (k: string) => {
      const v = String(fd.get(k) ?? '').trim()
      return v === '' ? undefined : v
    }
    const attributes = ref.attributes
      .map((a) => ({ attributeId: a.id, value: String(fd.get(`attr_${a.id}`) ?? '').trim() }))
      .filter((a) => a.value !== '')
    const packagingTypeIds = ref.packaging
      .filter((p) => fd.get(`pkg_${p.id}`) != null)
      .map((p) => p.id)
    const payload: Record<string, unknown> = {
      name: str('name'),
      sku: str('sku'),
      slug: str('slug'),
      shortDescription: str('shortDescription'),
      description: str('description'),
      categoryId: str('categoryId') ?? null,
      hsCodeId: str('hsCodeId') ?? null,
      originCountryId: str('originCountryId') ?? null,
      defaultUnitId: str('defaultUnitId') ?? null,
      status: str('status'),
      attributes,
      packagingTypeIds,
    }
    setBusy(true)
    try {
      if (isNew) {
        await api('/api/v1/products', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
        onSaved({ kind: 'ok', text: `Created "${payload.name}"` })
      } else {
        await api(`/api/v1/products/${product!.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', 'if-match': `v${product!.version}` },
          body: JSON.stringify(payload),
        })
        onSaved({ kind: 'ok', text: `Saved "${payload.name}"` })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
      setBusy(false)
    }
  }

  const ro = !canWrite
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10"
      onClick={onClose}
    >
      <div
        className="bg-navy-elevated w-full max-w-lg rounded-2xl border border-white/10 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-gold text-lg font-bold">{isNew ? 'New product' : product!.name}</h2>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <L label="SKU">
              <input
                name="sku"
                required
                defaultValue={product?.sku}
                disabled={ro || !isNew}
                className={`${field} w-full`}
              />
            </L>
            <L label="Status">
              <select
                name="status"
                defaultValue={product?.status ?? 'DRAFT'}
                disabled={ro}
                className={`${field} w-full`}
              >
                {PRODUCT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </L>
          </div>
          <L label="Name">
            <input
              name="name"
              required
              defaultValue={product?.name}
              disabled={ro}
              className={`${field} w-full`}
            />
          </L>
          <L label="Slug (optional)">
            <input
              name="slug"
              defaultValue={product?.slug}
              disabled={ro}
              placeholder="auto from name"
              className={`${field} w-full`}
            />
          </L>
          <L label="Short description">
            <input
              name="shortDescription"
              defaultValue={product?.shortDescription ?? ''}
              disabled={ro}
              className={`${field} w-full`}
            />
          </L>
          <L label="Description">
            <textarea
              name="description"
              defaultValue={product?.description ?? ''}
              disabled={ro}
              rows={2}
              className={`${field} w-full`}
            />
          </L>
          <div className="grid grid-cols-2 gap-3">
            <L label="Category">
              <Sel
                name="categoryId"
                value={product?.categoryId}
                disabled={ro}
                opts={ref.categories.map((c) => ({ v: c.id, t: c.name }))}
              />
            </L>
            <L label="HS code">
              <Sel
                name="hsCodeId"
                value={product?.hsCodeId}
                disabled={ro}
                opts={ref.hsCodes.map((c) => ({ v: c.id, t: `${c.code}` }))}
              />
            </L>
            <L label="Origin">
              <Sel
                name="originCountryId"
                value={product?.originCountryId}
                disabled={ro}
                opts={ref.origins.map((c) => ({ v: c.id, t: c.name ?? '' }))}
              />
            </L>
            <L label="Default unit">
              <Sel
                name="defaultUnitId"
                value={product?.defaultUnitId}
                disabled={ro}
                opts={ref.units.map((c) => ({ v: c.id, t: c.code ?? '' }))}
              />
            </L>
          </div>

          <fieldset className="rounded-lg border border-white/10 p-3">
            <legend className="px-1 text-xs uppercase tracking-widest text-white/40">
              Attributes
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {ref.attributes.map((a) => (
                <L key={a.id} label={`${a.label ?? a.key}${a.unit ? ` (${a.unit})` : ''}`}>
                  <input
                    name={`attr_${a.id}`}
                    defaultValue={attrValues.get(a.id) ?? ''}
                    disabled={ro}
                    className={`${field} w-full`}
                  />
                </L>
              ))}
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-white/10 p-3">
            <legend className="px-1 text-xs uppercase tracking-widest text-white/40">
              Packaging
            </legend>
            <div className="flex flex-wrap gap-3">
              {ref.packaging.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm text-white/70">
                  <input
                    type="checkbox"
                    name={`pkg_${p.id}`}
                    defaultChecked={selectedPackaging.has(p.id)}
                    disabled={ro}
                  />
                  {p.name ?? p.code}
                </label>
              ))}
            </div>
          </fieldset>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={ghost} onClick={onClose}>
              Close
            </button>
            {canWrite ? (
              <button type="submit" className={btn} disabled={busy}>
                {busy ? 'Saving...' : isNew ? 'Create' : 'Save'}
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  )
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs text-white/40">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  )
}
function Sel({
  name,
  value,
  opts,
  disabled,
}: {
  name: string
  value?: string | null
  opts: { v: string; t: string }[]
  disabled?: boolean
}) {
  return (
    <select
      name={name}
      defaultValue={value ?? ''}
      disabled={disabled}
      className={`${field} w-full`}
    >
      <option value="">-</option>
      {opts.map((o) => (
        <option key={o.v} value={o.v}>
          {o.t}
        </option>
      ))}
    </select>
  )
}
