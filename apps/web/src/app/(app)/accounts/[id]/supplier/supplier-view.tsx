'use client'

import type { SupplierProfileRecord } from '@triyara/db'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  cn,
  EmptyState,
  Input,
  Label,
  NativeSelect,
  PageHeader,
  Textarea,
} from '@triyara/ui'
import { MANUFACTURING_TYPES } from '@triyara/validation'
import { ChevronLeft, Factory, Package } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createContext, useActionState, useContext, useEffect, useId, useState } from 'react'

import {
  type ActionState,
  addProductAction,
  createSupplierAction,
  deleteSupplierAction,
  removeProductAction,
  restoreSupplierAction,
  updateSupplierAction,
} from './actions'

const TABS = [
  'overview',
  'capabilities',
  'markets',
  'documents',
  'certifications',
  'settings',
] as const
type Tab = (typeof TABS)[number]

/**
 * The rendered label for each tab.
 *
 * Spelled out rather than produced by a `capitalize` class, because the browser
 * exposes a CSS-transformed label to the accessibility tree inconsistently and
 * the end-to-end suite matches these names exactly (`/^overview$/i`,
 * `/^capabilities$/i`). The array above stays the source of order and of the
 * state value; this only decides what a reader sees.
 */
const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview',
  capabilities: 'Capabilities',
  markets: 'Markets',
  documents: 'Documents',
  certifications: 'Certifications',
  settings: 'Settings',
}

/**
 * Where a panel publishes the row its action just wrote. Mirrors the buyer
 * screen: every mutation returns the updated profile and the screen settles on
 * that, rather than on a re-rendered tree arriving inside the action response.
 */
const ProfileSink = createContext<(profile: SupplierProfileRecord) => void>(() => {})

/** Publishes the action's result, then refreshes to reconcile with the server. */
function useSettleOnOk(state: ActionState) {
  const router = useRouter()
  const publish = useContext(ProfileSink)
  useEffect(() => {
    if (!state.ok) return
    if (state.profile) publish(state.profile)
    router.refresh()
  }, [state, router, publish])
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

  // The row the last successful action returned. The server prop wins again as
  // soon as a refresh lands with an equal or newer version; the accountId check
  // keeps a row from one account from ever rendering under another.
  const [written, setWritten] = useState<SupplierProfileRecord | null>(null)
  const fresh =
    written && written.accountId === accountId && (!profile || written.version >= profile.version)
  const currentProfile = fresh ? written : profile

  // One prefix for every section on the screen, so each tab can name the region
  // it reveals without those ids colliding with another instance of this view.
  const sections = useId()

  return (
    <ProfileSink.Provider value={setWritten}>
      <PageHeader
        title={accountName}
        description="Supplier profile"
        breadcrumb={
          <Link
            href="/accounts"
            className="focus-ring inline-flex items-center gap-gap-xs text-xs text-content-muted hover:text-content"
          >
            <ChevronLeft aria-hidden="true" className="size-3.5" />
            Accounts
          </Link>
        }
        {...(currentProfile
          ? { tabs: <TabStrip tab={tab} onSelect={setTab} sections={sections} /> }
          : {})}
      />

      <div className="p-gutter">
        <div className="mx-auto max-w-3xl space-y-gap-lg">
          {!currentProfile ? (
            <CreatePanel accountId={accountId} canWrite={canWrite} />
          ) : (
            <>
              {currentProfile.deletedAt ? (
                <Alert tone="warning" title="This supplier profile is deleted." />
              ) : null}

              <div
                id={`${sections}-capabilities`}
                className={tab === 'capabilities' ? undefined : 'hidden'}
              >
                <CapabilitiesPanel
                  accountId={accountId}
                  profile={currentProfile}
                  canWrite={canWrite}
                />
              </div>

              <EditForm
                accountId={accountId}
                profile={currentProfile}
                canWrite={canWrite}
                hidden={tab === 'capabilities'}
                tab={tab}
                sections={sections}
              />
            </>
          )}
        </div>
      </div>
    </ProfileSink.Provider>
  )
}

/**
 * The tab strip, still plain buttons.
 *
 * Deliberately NOT `Tabs` from the design system, for the reason Wave B
 * established on the buyer screen: Radix renders each trigger with `role="tab"`
 * and unmounts the panel that is not selected - but every section behind these
 * tabs is part of ONE form, and a field that is unmounted is a field that is not
 * submitted. Saving from the settings tab would post a different payload than
 * saving from overview.
 *
 * So the buttons stay buttons and the sections stay CSS-hidden. What is borrowed
 * is the appearance: the same classes `TabsTrigger` carries, driven by a
 * `data-state` this component sets itself. `aria-current` and `aria-controls`
 * do the work `role="tab"` would otherwise have done. Six tabs is one more than
 * the buyer screen carries, which is why the strip scrolls rather than wraps.
 */
function TabStrip({
  tab,
  onSelect,
  sections,
}: {
  tab: Tab
  onSelect: (tab: Tab) => void
  sections: string
}) {
  return (
    <div
      role="group"
      aria-label="Supplier profile sections"
      className="flex items-center gap-gap-lg overflow-x-auto border-b border-line"
    >
      {TABS.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onSelect(t)}
          data-state={tab === t ? 'active' : 'inactive'}
          aria-current={tab === t ? 'page' : undefined}
          aria-controls={`${sections}-${t}`}
          className={cn(
            'focus-ring -mb-px inline-flex items-center gap-gap whitespace-nowrap border-b-2 border-transparent',
            'px-1 pb-2.5 pt-2 text-base font-medium text-content-muted',
            'transition-colors duration-fast hover:text-content',
            'data-[state=active]:border-accent data-[state=active]:text-content',
          )}
        >
          {TAB_LABELS[t]}
        </button>
      ))}
    </div>
  )
}

function CreatePanel({ accountId, canWrite }: { accountId: string; canWrite: boolean }) {
  const [state, action, pending] = useActionState(createSupplierAction, {})
  useSettleOnOk(state)
  return (
    <div className="rounded-md border border-line bg-surface">
      <EmptyState
        icon={<Factory />}
        title="No supplier profile yet for this account."
        {...(canWrite
          ? {
              action: (
                <form action={action} className="space-y-gap">
                  <input type="hidden" name="accountId" value={accountId} />
                  <Button type="submit" variant="primary" disabled={pending} loading={pending}>
                    {pending ? 'Creating...' : 'Create supplier profile'}
                  </Button>
                  {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
                </form>
              ),
            }
          : {})}
      />
    </div>
  )
}

function EditForm({
  accountId,
  profile,
  canWrite,
  hidden,
  tab,
  sections,
}: {
  accountId: string
  profile: SupplierProfileRecord
  canWrite: boolean
  hidden: boolean
  tab: Tab
  sections: string
}) {
  const [state, action, pending] = useActionState(updateSupplierAction, {})
  useSettleOnOk(state)
  const ro = !canWrite || !!profile.deletedAt
  const sec = (name: Tab) => (tab === name ? 'space-y-3' : 'hidden')

  return (
    <form action={action} className={hidden ? 'hidden' : undefined}>
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="version" value={profile.version} />

      <div id={`${sections}-overview`} className={sec('overview')}>
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
        <div className="grid grid-cols-1 gap-gap sm:grid-cols-2">
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
        <div className="grid grid-cols-1 gap-gap sm:grid-cols-2">
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

      <div id={`${sections}-markets`} className={sec('markets')}>
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
        <div className="grid grid-cols-1 gap-gap sm:grid-cols-2">
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

      <div id={`${sections}-documents`} className={sec('documents')}>
        <Arr
          name="supportedDocuments"
          label="Supported export documents"
          value={profile.supportedDocuments}
          disabled={ro}
        />
        <Text name="packaging" label="Packaging" defaultValue={profile.packaging} disabled={ro} />
      </div>

      <div id={`${sections}-certifications`} className={sec('certifications')}>
        <Arr
          name="certifications"
          label="Certifications"
          value={profile.certifications}
          disabled={ro}
        />
      </div>

      <div id={`${sections}-settings`} className={sec('settings')}>
        <Text name="website" label="Website" defaultValue={profile.website} disabled={ro} />
        <div className="flex flex-wrap items-center gap-gap-lg pt-gap-xs">
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

      {/* Two branches, kept separate on purpose. The settings tab has never
          shown the "Saved" confirmation the other tabs show; that asymmetry
          predates this migration and unifying the blocks would change what a
          user sees, which is outside a restyle. */}
      {!ro && tab !== 'settings' ? (
        <div className="mt-gap-lg space-y-gap">
          <Button type="submit" variant="primary" disabled={pending} loading={pending}>
            {pending ? 'Saving...' : 'Save changes'}
          </Button>
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? <Alert tone="success">Saved</Alert> : null}
        </div>
      ) : null}
      {!ro && tab === 'settings' ? (
        <div className="mt-gap-lg space-y-gap">
          <Button type="submit" variant="primary" disabled={pending} loading={pending}>
            {pending ? 'Saving...' : 'Save changes'}
          </Button>
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
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
  useSettleOnOk(dState)
  useSettleOnOk(rState)
  if (!canWrite) return null

  return (
    <Card className="mt-gap-lg">
      <CardHeader>
        <CardTitle as="h3">Danger zone</CardTitle>
      </CardHeader>
      {/* Both controls stay submit buttons of the SURROUNDING edit form, driven
          by `formAction`. `formNoValidate` is what lets them skip the form's own
          constraints - a profile you are removing does not have to be valid
          first. `Button` forwards both, because it spreads its props onto a real
          `<button>` and sets no `type` of its own. `name="_restore"` is carried
          over unchanged: no action reads it today, but it is part of the payload
          this button posts and a restyle is no place to drop it. */}
      <CardContent className="space-y-gap">
        {profile.deletedAt ? (
          <>
            <Button
              variant="secondary"
              formAction={restore}
              formNoValidate
              name="_restore"
              disabled={rPending}
              loading={rPending}
            >
              {rPending ? 'Restoring...' : 'Restore profile'}
            </Button>
            {rState.error ? <Alert tone="danger">{rState.error}</Alert> : null}
          </>
        ) : (
          <>
            <Button
              variant="danger"
              formAction={del}
              formNoValidate
              disabled={dPending}
              loading={dPending}
            >
              {dPending ? 'Deleting...' : 'Delete profile'}
            </Button>
            {dState.error ? <Alert tone="danger">{dState.error}</Alert> : null}
          </>
        )}
      </CardContent>
    </Card>
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
  useSettleOnOk(state)
  const ro = !canWrite || !!profile.deletedAt

  return (
    <div className="space-y-gap-lg">
      <Card>
        <CardHeader>
          <CardTitle as="h3">Products ({profile.products.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {profile.products.length === 0 ? (
            <EmptyState icon={<Package />} size="sm" title="No products listed yet." />
          ) : (
            <ul className="divide-y divide-line">
              {profile.products.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-gap px-gutter py-gap"
                >
                  <span className="text-base text-content">
                    {p.product}
                    {p.capacityPerMonth ? (
                      <span className="text-content-subtle"> &middot; {p.capacityPerMonth}</span>
                    ) : null}
                  </span>
                  {ro ? null : (
                    <RemoveProduct
                      accountId={accountId}
                      version={profile.version}
                      productId={p.id}
                      product={p.product}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {ro ? null : (
        <Card>
          <CardHeader>
            {/* Stays a heading, never a button: the end-to-end suite reaches the
                submit control with an unanchored /add product/i, and a second
                button carrying the same words would make that ambiguous. */}
            <CardTitle as="h3">Add product</CardTitle>
          </CardHeader>
          <CardContent>
            {/* A SIBLING of the edit form, never nested inside it: two forms
                inside one another is invalid markup, and the browser would drop
                the inner one - taking this action with it. */}
            <form action={add} className="space-y-gap">
              <input type="hidden" name="accountId" value={accountId} />
              <input type="hidden" name="version" value={profile.version} />
              {/* Named by `aria-label` rather than a visible label, because the
                  placeholder is the end-to-end suite's handle on this field and
                  a placeholder is not an accessible name - it disappears the
                  moment somebody types. */}
              <Input
                name="product"
                required
                aria-label="Product"
                placeholder="Product (e.g. Onion Powder)"
              />
              <div className="grid grid-cols-1 gap-gap sm:grid-cols-3">
                <Input
                  name="capacityPerMonth"
                  aria-label="Capacity per month"
                  placeholder="Capacity/mo"
                />
                <Input name="productMoq" aria-label="Minimum order quantity" placeholder="MOQ" />
                <Input
                  name="productLeadTime"
                  type="number"
                  aria-label="Lead days"
                  placeholder="Lead days"
                />
              </div>
              <Button type="submit" variant="primary" disabled={pending} loading={pending}>
                {pending ? 'Adding...' : 'Add product'}
              </Button>
              {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function RemoveProduct({
  accountId,
  version,
  productId,
  product,
}: {
  accountId: string
  version: number
  productId: string
  /** Only to name the button: every row used to offer an identical "Remove". */
  product: string
}) {
  const [state, action, pending] = useActionState(removeProductAction, {})
  useSettleOnOk(state)
  return (
    <form action={action}>
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="productId" value={productId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        className="text-danger hover:text-danger"
        aria-label={`Remove ${product}`}
        disabled={pending}
        loading={pending}
      >
        Remove
      </Button>
    </form>
  )
}

/* ---- small field components ---- */

/**
 * Label above control, with the two tied together by id.
 *
 * The pairing is the point. These fields previously rendered a bare `<label>`
 * with no `htmlFor` against an input with no `id`, so not one of the nineteen
 * text, array, select and textarea fields had an accessible name. Nothing about
 * what is submitted changes: `name` is untouched.
 */
function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-gap-xs">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
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
  const id = useId()
  return (
    <Field id={id} label={label}>
      <Input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ''}
        disabled={disabled}
      />
    </Field>
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
  const id = useId()
  return (
    <Field id={id} label={label}>
      <Textarea
        id={id}
        name={name}
        defaultValue={defaultValue ?? ''}
        disabled={disabled}
        rows={3}
      />
    </Field>
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
  const id = useId()
  return (
    <Field id={id} label={`${label} (comma-separated)`}>
      <Input id={id} name={name} defaultValue={value.join(', ')} disabled={disabled} />
    </Field>
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
  const id = useId()
  return (
    <Field id={id} label={label}>
      <NativeSelect id={id} name={name} defaultValue={defaultValue} disabled={disabled}>
        <option value="">-</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </NativeSelect>
    </Field>
  )
}

/**
 * A boolean the server reads by PRESENCE, not by value.
 *
 * `actions.ts` decides these three with `fd.get(key) != null`, which is the
 * plain HTML contract: a checked box submits, an unchecked one is simply absent.
 * That is why this control has to keep putting a real `<input type="checkbox">`
 * into the form - a widget that only looks like a checkbox would post nothing
 * and silently turn OEM, ODM and private label off on every save.
 *
 * The design system's `Checkbox` is safe here: Radix renders the styled control
 * as a button and bubbles a hidden native checkbox alongside it, carrying the
 * `name`, `defaultChecked` and `disabled` given here. Verified in the browser
 * rather than taken on trust - see the Wave C checkbox probe.
 *
 * The label was previously implicit, wrapping the input. Radix's control is a
 * separate element, so the association is explicit now.
 */
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
  const id = useId()
  return (
    <div className="flex items-center gap-gap-xs">
      <Checkbox id={id} name={name} defaultChecked={defaultChecked} disabled={disabled} />
      <Label htmlFor={id} className="text-content">
        {label}
      </Label>
    </div>
  )
}
