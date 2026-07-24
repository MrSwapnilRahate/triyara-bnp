'use client'

import type { BuyerProfileRecord } from '@triyara/db'
import { BUYER_TYPES, IMPORT_EXPERIENCES } from '@triyara/validation'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useState } from 'react'

import {
  type ActionState,
  addBuyerProductAction,
  createBuyerAction,
  deleteBuyerAction,
  removeBuyerProductAction,
  restoreBuyerAction,
  updateBuyerAction,
} from './actions'

const field =
  'w-full rounded-lg border border-white/15 bg-navy/50 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-gold/60 focus:outline-none disabled:opacity-50'
const btn =
  'rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-navy hover:bg-gold-light disabled:opacity-50'
const ghost =
  'rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70 hover:text-white disabled:opacity-50'

const TABS = ['overview', 'products', 'markets', 'certifications', 'settings'] as const
type Tab = (typeof TABS)[number]

function useRefreshOnOk(state: ActionState) {
  const router = useRouter()
  useEffect(() => {
    if (state.ok) router.refresh()
  }, [state, router])
}

export function BuyerProfileView({
  accountId,
  accountName,
  profile,
  canWrite,
}: {
  accountId: string
  accountName: string
  profile: BuyerProfileRecord | null
  canWrite: boolean
}) {
  const [tab, setTab] = useState<Tab>('overview')

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/accounts" className="hover:text-gold text-xs text-white/40">
        &larr; Accounts
      </Link>
      <h1 className="text-gold mt-2 text-2xl font-bold">{accountName}</h1>
      <p className="text-sm text-white/40">Buyer profile</p>

      {!profile ? (
        <CreatePanel accountId={accountId} canWrite={canWrite} />
      ) : (
        <>
          {profile.deletedAt ? (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
              This buyer profile is deleted.
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-1 border-b border-white/10">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-sm capitalize ${tab === t ? 'border-gold text-gold border-b-2' : 'text-white/50 hover:text-white'}`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className={tab === 'products' ? 'mt-6' : 'hidden'}>
            <ProductsPanel accountId={accountId} profile={profile} canWrite={canWrite} />
          </div>
          <EditForm
            accountId={accountId}
            profile={profile}
            canWrite={canWrite}
            hidden={tab === 'products'}
            tab={tab}
          />
        </>
      )}
    </div>
  )
}

function CreatePanel({ accountId, canWrite }: { accountId: string; canWrite: boolean }) {
  const [state, action, pending] = useActionState(createBuyerAction, {})
  useRefreshOnOk(state)
  return (
    <div className="mt-8 rounded-xl border border-dashed border-white/15 py-12 text-center">
      <p className="text-sm text-white/50">No buyer profile yet for this account.</p>
      {canWrite ? (
        <form action={action} className="mt-4">
          <input type="hidden" name="accountId" value={accountId} />
          <button className={btn} disabled={pending}>
            {pending ? 'Creating...' : 'Create buyer profile'}
          </button>
          {state.error ? <p className="mt-2 text-sm text-red-400">{state.error}</p> : null}
        </form>
      ) : null}
    </div>
  )
}

function EditForm({
  accountId,
  profile,
  canWrite,
  hidden,
  tab,
}: {
  accountId: string
  profile: BuyerProfileRecord
  canWrite: boolean
  hidden: boolean
  tab: Tab
}) {
  const [state, action, pending] = useActionState(updateBuyerAction, {})
  useRefreshOnOk(state)
  const ro = !canWrite || !!profile.deletedAt
  const sec = (name: Tab) => (tab === name ? 'space-y-3' : 'hidden')

  return (
    <form action={action} className={hidden ? 'hidden' : 'mt-6'}>
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="version" value={profile.version} />

      <div className={sec('overview')}>
        <Select
          name="businessType"
          label="Business type"
          defaultValue={profile.businessType ?? ''}
          options={BUYER_TYPES}
          disabled={ro}
        />
        <Select
          name="importExperience"
          label="Import experience"
          defaultValue={profile.importExperience ?? ''}
          options={IMPORT_EXPERIENCES}
          disabled={ro}
        />
        <div className="grid grid-cols-2 gap-3">
          <Text
            name="annualRequirement"
            label="Annual requirement"
            defaultValue={profile.annualRequirement}
            disabled={ro}
          />
          <Text
            name="annualBudgetBand"
            label="Annual budget band"
            defaultValue={profile.annualBudgetBand}
            disabled={ro}
          />
        </div>
        <TextArea
          name="description"
          label="Description"
          defaultValue={profile.description}
          disabled={ro}
        />
      </div>

      <div className={sec('markets')}>
        <Arr
          name="destinationCountries"
          label="Destination countries (ISO2)"
          value={profile.destinationCountries}
          disabled={ro}
        />
        <Text
          name="destinationPort"
          label="Destination port"
          defaultValue={profile.destinationPort}
          disabled={ro}
        />
        <Arr name="incoterms" label="Incoterms" value={profile.incoterms} disabled={ro} />
        <Arr name="paymentTerms" label="Payment terms" value={profile.paymentTerms} disabled={ro} />
        <Arr name="languages" label="Languages" value={profile.languages} disabled={ro} />
      </div>

      <div className={sec('certifications')}>
        <Arr
          name="certificationsRequired"
          label="Certifications required"
          value={profile.certificationsRequired}
          disabled={ro}
        />
      </div>

      <div className={sec('settings')}>
        <Text name="website" label="Website" defaultValue={profile.website} disabled={ro} />
        <DangerZone profile={profile} canWrite={canWrite} />
      </div>

      {!ro ? (
        <div className="mt-5 flex items-center gap-3">
          <button className={btn} disabled={pending}>
            {pending ? 'Saving...' : 'Save changes'}
          </button>
          {state.error ? <span className="text-sm text-red-400">{state.error}</span> : null}
          {state.ok ? <span className="text-sm text-green-400">Saved</span> : null}
        </div>
      ) : null}
    </form>
  )
}

function DangerZone({ profile, canWrite }: { profile: BuyerProfileRecord; canWrite: boolean }) {
  const [dState, del, dPending] = useActionState(deleteBuyerAction, {})
  const [rState, restore, rPending] = useActionState(restoreBuyerAction, {})
  useRefreshOnOk(dState)
  useRefreshOnOk(rState)
  if (!canWrite) return null

  return (
    <div className="mt-6 rounded-lg border border-white/10 p-4">
      <p className="text-xs uppercase tracking-widest text-white/40">Danger zone</p>
      <div className="mt-3">
        {profile.deletedAt ? (
          <span>
            <button formAction={restore} className={ghost} disabled={rPending} formNoValidate>
              {rPending ? 'Restoring...' : 'Restore profile'}
            </button>
            {rState.error ? (
              <span className="ml-2 text-sm text-red-400">{rState.error}</span>
            ) : null}
          </span>
        ) : (
          <span>
            <button
              formAction={del}
              className="rounded-lg border border-red-500/40 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50"
              disabled={dPending}
              formNoValidate
            >
              {dPending ? 'Deleting...' : 'Delete profile'}
            </button>
            {dState.error ? (
              <span className="ml-2 text-sm text-red-400">{dState.error}</span>
            ) : null}
          </span>
        )}
      </div>
    </div>
  )
}

function ProductsPanel({
  accountId,
  profile,
  canWrite,
}: {
  accountId: string
  profile: BuyerProfileRecord
  canWrite: boolean
}) {
  const [state, add, pending] = useActionState(addBuyerProductAction, {})
  useRefreshOnOk(state)
  const ro = !canWrite || !!profile.deletedAt
  return (
    <div>
      <h3 className="text-sm font-semibold text-white">
        Products of interest ({profile.products.length})
      </h3>
      <ul className="mt-3 space-y-2">
        {profile.products.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm"
          >
            <span className="text-white">
              {p.product}
              {p.targetVolume ? (
                <span className="text-white/40"> &middot; {p.targetVolume}</span>
              ) : null}
            </span>
            {ro ? null : (
              <RemoveProduct accountId={accountId} version={profile.version} productId={p.id} />
            )}
          </li>
        ))}
        {profile.products.length === 0 ? (
          <li className="text-sm text-white/40">No products listed yet.</li>
        ) : null}
      </ul>
      {ro ? null : (
        <form action={add} className="mt-5 space-y-3 rounded-lg border border-white/10 p-4">
          <input type="hidden" name="accountId" value={accountId} />
          <input type="hidden" name="version" value={profile.version} />
          <p className="text-xs uppercase tracking-widest text-white/40">Add product of interest</p>
          <input
            name="product"
            required
            placeholder="Product (e.g. Onion Powder)"
            className={field}
          />
          <div className="grid grid-cols-3 gap-3">
            <input name="targetVolume" placeholder="Target volume" className={field} />
            <input name="targetPrice" placeholder="Target price" className={field} />
            <input name="frequency" placeholder="Frequency" className={field} />
          </div>
          <button className={btn} disabled={pending}>
            {pending ? 'Adding...' : 'Add product'}
          </button>
          {state.error ? <span className="ml-2 text-sm text-red-400">{state.error}</span> : null}
        </form>
      )}
    </div>
  )
}

function RemoveProduct({
  accountId,
  version,
  productId,
}: {
  accountId: string
  version: number
  productId: string
}) {
  const [state, action, pending] = useActionState(removeBuyerProductAction, {})
  useRefreshOnOk(state)
  return (
    <form action={action}>
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="productId" value={productId} />
      <button
        className="text-xs text-red-300 hover:text-red-200 disabled:opacity-50"
        disabled={pending}
      >
        Remove
      </button>
    </form>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-xs uppercase tracking-wide text-white/40">{children}</label>
  )
}
function Text({
  name,
  label,
  defaultValue,
  type = 'text',
  disabled,
}: {
  name: string
  label: string
  defaultValue?: string | number | null
  type?: string
  disabled?: boolean
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ''}
        disabled={disabled}
        className={field}
      />
    </div>
  )
}
function TextArea({
  name,
  label,
  defaultValue,
  disabled,
}: {
  name: string
  label: string
  defaultValue?: string | null
  disabled?: boolean
}) {
  return (
    <div>
      <Label>{label}</Label>
      <textarea
        name={name}
        defaultValue={defaultValue ?? ''}
        disabled={disabled}
        rows={3}
        className={field}
      />
    </div>
  )
}
function Arr({
  name,
  label,
  value,
  disabled,
}: {
  name: string
  label: string
  value: string[]
  disabled?: boolean
}) {
  return (
    <div>
      <Label>{label} (comma-separated)</Label>
      <input name={name} defaultValue={value.join(', ')} disabled={disabled} className={field} />
    </div>
  )
}
function Select({
  name,
  label,
  defaultValue,
  options,
  disabled,
}: {
  name: string
  label: string
  defaultValue: string
  options: readonly string[]
  disabled?: boolean
}) {
  return (
    <div>
      <Label>{label}</Label>
      <select name={name} defaultValue={defaultValue} disabled={disabled} className={field}>
        <option value="">-</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}
