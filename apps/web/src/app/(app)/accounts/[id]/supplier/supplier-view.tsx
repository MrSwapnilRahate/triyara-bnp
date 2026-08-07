'use client'

import type { SupplierProfileRecord } from '@triyara/db'
import { MANUFACTURING_TYPES } from '@triyara/validation'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useState } from 'react'

import {
  type ActionState,
  addProductAction,
  createSupplierAction,
  deleteSupplierAction,
  removeProductAction,
  restoreSupplierAction,
  updateSupplierAction,
} from './actions'

const field =
  'w-full rounded-lg border border-white/15 bg-navy/50 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-gold/60 focus:outline-none disabled:opacity-50'
const btn =
  'rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-navy hover:bg-gold-light disabled:opacity-50'
const ghost =
  'rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70 hover:text-white disabled:opacity-50'

const TABS = [
  'overview',
  'capabilities',
  'markets',
  'documents',
  'certifications',
  'settings',
] as const
type Tab = (typeof TABS)[number]

function useRefreshOnOk(state: ActionState) {
  const router = useRouter()
  useEffect(() => {
    if (state.ok) router.refresh()
  }, [state, router])
}

export function SupplierProfileView({
  accountId,
  accountName,
  profile,
  canWrite,
}: {
  accountId: string
  accountName: string
  profile: SupplierProfileRecord | null
  canWrite: boolean
}) {
  const [tab, setTab] = useState<Tab>('overview')

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/accounts" className="text-xs text-white/40 hover:text-gold">
        &larr; Accounts
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-gold">{accountName}</h1>
      <p className="text-sm text-white/40">Supplier profile</p>

      {!profile ? (
        <CreatePanel accountId={accountId} canWrite={canWrite} />
      ) : (
        <>
          {profile.deletedAt ? (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
              This supplier profile is deleted.
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-1 border-b border-white/10">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-sm capitalize ${tab === t ? 'border-b-2 border-gold text-gold' : 'text-white/50 hover:text-white'}`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className={tab === 'capabilities' ? 'mt-6' : 'hidden'}>
            <CapabilitiesPanel accountId={accountId} profile={profile} canWrite={canWrite} />
          </div>

          <EditForm
            accountId={accountId}
            profile={profile}
            canWrite={canWrite}
            hidden={tab === 'capabilities'}
            tab={tab}
          />
        </>
      )}
    </div>
  )
}

function CreatePanel({ accountId, canWrite }: { accountId: string; canWrite: boolean }) {
  const [state, action, pending] = useActionState(createSupplierAction, {})
  useRefreshOnOk(state)
  return (
    <div className="mt-8 rounded-xl border border-dashed border-white/15 py-12 text-center">
      <p className="text-sm text-white/50">No supplier profile yet for this account.</p>
      {canWrite ? (
        <form action={action} className="mt-4">
          <input type="hidden" name="accountId" value={accountId} />
          <button className={btn} disabled={pending}>
            {pending ? 'Creating...' : 'Create supplier profile'}
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
  profile: SupplierProfileRecord
  canWrite: boolean
  hidden: boolean
  tab: Tab
}) {
  const [state, action, pending] = useActionState(updateSupplierAction, {})
  useRefreshOnOk(state)
  const ro = !canWrite || !!profile.deletedAt
  const sec = (name: Tab) => (tab === name ? 'space-y-3' : 'hidden')

  return (
    <form action={action} className={hidden ? 'hidden' : 'mt-6'}>
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="version" value={profile.version} />

      <div className={sec('overview')}>
        <Select
          name="manufacturingType"
          label="Manufacturing type"
          defaultValue={profile.manufacturingType ?? ''}
          options={MANUFACTURING_TYPES}
          disabled={ro}
        />
        <Text
          name="businessType"
          label="Business type"
          defaultValue={profile.businessType}
          disabled={ro}
        />
        <div className="grid grid-cols-2 gap-3">
          <Text
            name="factorySizeSqm"
            label="Factory size (sqm)"
            type="number"
            defaultValue={profile.factorySizeSqm}
            disabled={ro}
          />
          <Text
            name="employees"
            label="Employees"
            type="number"
            defaultValue={profile.employees}
            disabled={ro}
          />
        </div>
        <Text
          name="productionCapacity"
          label="Production capacity"
          defaultValue={profile.productionCapacity}
          disabled={ro}
        />
        <div className="grid grid-cols-2 gap-3">
          <Text
            name="annualTurnoverBand"
            label="Annual turnover band"
            defaultValue={profile.annualTurnoverBand}
            disabled={ro}
          />
          <Text
            name="exportExperienceYears"
            label="Export experience (years)"
            type="number"
            defaultValue={profile.exportExperienceYears}
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
          name="primaryMarkets"
          label="Primary markets"
          value={profile.primaryMarkets}
          disabled={ro}
        />
        <Arr
          name="exportCountries"
          label="Export countries (ISO2)"
          value={profile.exportCountries}
          disabled={ro}
        />
        <Arr name="languages" label="Languages" value={profile.languages} disabled={ro} />
        <Arr name="incoterms" label="Incoterms" value={profile.incoterms} disabled={ro} />
        <Arr name="paymentTerms" label="Payment terms" value={profile.paymentTerms} disabled={ro} />
        <div className="grid grid-cols-2 gap-3">
          <Text
            name="leadTimeDays"
            label="Lead time (days)"
            type="number"
            defaultValue={profile.leadTimeDays}
            disabled={ro}
          />
          <Text name="moq" label="MOQ" defaultValue={profile.moq} disabled={ro} />
        </div>
      </div>

      <div className={sec('documents')}>
        <Arr
          name="supportedDocuments"
          label="Supported export documents"
          value={profile.supportedDocuments}
          disabled={ro}
        />
        <Text name="packaging" label="Packaging" defaultValue={profile.packaging} disabled={ro} />
      </div>

      <div className={sec('certifications')}>
        <Arr
          name="certifications"
          label="Certifications"
          value={profile.certifications}
          disabled={ro}
        />
      </div>

      <div className={sec('settings')}>
        <Text name="website" label="Website" defaultValue={profile.website} disabled={ro} />
        <div className="flex gap-6 pt-1">
          <Check name="oem" label="OEM" defaultChecked={profile.oem} disabled={ro} />
          <Check name="odm" label="ODM" defaultChecked={profile.odm} disabled={ro} />
          <Check
            name="privateLabel"
            label="Private label"
            defaultChecked={profile.privateLabel}
            disabled={ro}
          />
        </div>
        <DangerZone accountId={accountId} profile={profile} canWrite={canWrite} />
      </div>

      {!ro && tab !== 'settings' ? (
        <div className="mt-5 flex items-center gap-3">
          <button className={btn} disabled={pending}>
            {pending ? 'Saving...' : 'Save changes'}
          </button>
          {state.error ? <span className="text-sm text-red-400">{state.error}</span> : null}
          {state.ok ? <span className="text-sm text-green-400">Saved</span> : null}
        </div>
      ) : null}
      {!ro && tab === 'settings' ? (
        <div className="mt-5 flex items-center gap-3">
          <button className={btn} disabled={pending}>
            {pending ? 'Saving...' : 'Save changes'}
          </button>
          {state.error ? <span className="text-sm text-red-400">{state.error}</span> : null}
        </div>
      ) : null}
    </form>
  )
}

function DangerZone({
  accountId,
  profile,
  canWrite,
}: {
  accountId: string
  profile: SupplierProfileRecord
  canWrite: boolean
}) {
  const [dState, del, dPending] = useActionState(deleteSupplierAction, {})
  const [rState, restore, rPending] = useActionState(restoreSupplierAction, {})
  useRefreshOnOk(dState)
  useRefreshOnOk(rState)
  if (!canWrite) return null

  return (
    <div className="mt-6 rounded-lg border border-white/10 p-4">
      <p className="text-xs uppercase tracking-widest text-white/40">Danger zone</p>
      <div className="mt-3">
        {profile.deletedAt ? (
          <span onClick={() => void 0}>
            <button
              formAction={restore}
              className={ghost}
              disabled={rPending}
              name="_restore"
              formNoValidate
            >
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

function CapabilitiesPanel({
  accountId,
  profile,
  canWrite,
}: {
  accountId: string
  profile: SupplierProfileRecord
  canWrite: boolean
}) {
  const [state, add, pending] = useActionState(addProductAction, {})
  useRefreshOnOk(state)
  const ro = !canWrite || !!profile.deletedAt

  return (
    <div>
      <h3 className="text-sm font-semibold text-white">Products ({profile.products.length})</h3>
      <ul className="mt-3 space-y-2">
        {profile.products.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm"
          >
            <span className="text-white">
              {p.product}
              {p.capacityPerMonth ? (
                <span className="text-white/40"> &middot; {p.capacityPerMonth}</span>
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
          <p className="text-xs uppercase tracking-widest text-white/40">Add product</p>
          <input
            name="product"
            required
            placeholder="Product (e.g. Onion Powder)"
            className={field}
          />
          <div className="grid grid-cols-3 gap-3">
            <input name="capacityPerMonth" placeholder="Capacity/mo" className={field} />
            <input name="productMoq" placeholder="MOQ" className={field} />
            <input name="productLeadTime" type="number" placeholder="Lead days" className={field} />
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
  const [state, action, pending] = useActionState(removeProductAction, {})
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

/* ---- small field components ---- */
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
function Check({
  name,
  label,
  defaultChecked,
  disabled,
}: {
  name: string
  label: string
  defaultChecked?: boolean
  disabled?: boolean
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-white/70">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} disabled={disabled} />
      {label}
    </label>
  )
}
