'use client'

import type { BuyerProfileRecord } from '@triyara/db'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  EmptyState,
  Input,
  Label,
  NativeSelect,
  PageHeader,
  Textarea,
} from '@triyara/ui'
import { BUYER_TYPES, IMPORT_EXPERIENCES } from '@triyara/validation'
import { ChevronLeft, Package, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createContext, useActionState, useContext, useEffect, useId, useState } from 'react'

import {
  BuyerReviewPanel,
  type BuyerReviewSubject,
} from '@/features/buyer-registration/components/buyer-review-panel'

import {
  type ActionState,
  addBuyerProductAction,
  createBuyerAction,
  deleteBuyerAction,
  removeBuyerProductAction,
  restoreBuyerAction,
  updateBuyerAction,
} from './actions'

const TABS = ['overview', 'products', 'markets', 'certifications', 'settings'] as const
type Tab = (typeof TABS)[number]

/**
 * The rendered label for each tab.
 *
 * Spelled out rather than produced by a `capitalize` class, because the browser
 * exposes a CSS-transformed label to the accessibility tree inconsistently and
 * the end-to-end suite matches these names exactly (`/^overview$/i`,
 * `/^products$/i`). The array above stays the source of order and of the state
 * value; this only decides what a reader sees.
 */
const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview',
  products: 'Products',
  markets: 'Markets',
  certifications: 'Certifications',
  settings: 'Settings',
}

/**
 * Where a panel publishes the row its action just wrote.
 *
 * Every mutation here returns the updated profile, and the screen settles on
 * that rather than on a re-rendered tree. See `createBuyerAction` for the
 * measured reason: a Server Action that revalidates puts the new tree inside its
 * own response, React applies it in the transition that owns `useActionState`'s
 * pending flag, and if that apply suspends the transition is parked - leaving
 * the button on "Creating..." forever with the row already written.
 */
const ProfileSink = createContext<(profile: BuyerProfileRecord) => void>(() => {})

/**
 * Publishes the action's result, then refreshes.
 *
 * The refresh is still here, so the server remains the source of truth and any
 * change this screen did not make shows up. It is no longer the only way the
 * user sees their own write.
 */
function useSettleOnOk(state: ActionState) {
  const router = useRouter()
  const publish = useContext(ProfileSink)
  useEffect(() => {
    if (!state.ok) return
    if (state.profile) publish(state.profile)
    router.refresh()
  }, [state, router, publish])
}

export function BuyerProfileView({
  accountId,
  accountName,
  profile,
  canWrite,
  review,
}: {
  accountId: string
  accountName: string
  profile: BuyerProfileRecord | null
  canWrite: boolean
  /** Onboarding review state; the panel renders itself away unless pending. */
  review: BuyerReviewSubject
}) {
  const [tab, setTab] = useState<Tab>('overview')

  // The row the last successful action returned. The server prop wins again as
  // soon as a refresh lands with an equal or newer version. The accountId check
  // is belt-and-braces: nothing currently navigates client-side from one
  // account's buyer page to another's, so this state is torn down in between -
  // but that is a routing fact, not an invariant of this component, and a stale
  // row from a different account must never be able to render.
  const [written, setWritten] = useState<BuyerProfileRecord | null>(null)
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
        description="Buyer profile"
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
          {/* Review sits above everything: on a self-registered account it is the
            only thing anyone should be doing here until a decision is taken. */}
          <BuyerReviewPanel account={review} />

          {!currentProfile ? (
            <CreatePanel accountId={accountId} canWrite={canWrite} />
          ) : (
            <>
              {currentProfile.deletedAt ? (
                <Alert tone="warning" title="This buyer profile is deleted." />
              ) : null}
              <div
                id={`${sections}-products`}
                className={tab === 'products' ? undefined : 'hidden'}
              >
                <ProductsPanel accountId={accountId} profile={currentProfile} canWrite={canWrite} />
              </div>
              <EditForm
                accountId={accountId}
                profile={currentProfile}
                canWrite={canWrite}
                hidden={tab === 'products'}
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
 * Deliberately NOT `Tabs` from the design system, and this is the one place on
 * the platform where that is the right call. Radix renders each trigger with
 * `role="tab"` and unmounts the panel that is not selected - but every section
 * behind these tabs is part of ONE form, and a field that is unmounted is a
 * field that is not submitted. Saving from the settings tab would silently post
 * a different payload than saving from overview.
 *
 * So the buttons stay buttons and the sections stay CSS-hidden. What is borrowed
 * is the appearance: the same classes `TabsTrigger` carries, driven by a
 * `data-state` this component sets itself. `aria-current` and `aria-controls`
 * do the work `role="tab"` would otherwise have done.
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
      aria-label="Buyer profile sections"
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
  const [state, action, pending] = useActionState(createBuyerAction, {})
  useSettleOnOk(state)
  return (
    <div className="rounded-md border border-line bg-surface">
      <EmptyState
        icon={<UserPlus />}
        title="No buyer profile yet for this account."
        {...(canWrite
          ? {
              action: (
                <form action={action} className="space-y-gap">
                  <input type="hidden" name="accountId" value={accountId} />
                  <Button type="submit" variant="primary" disabled={pending} loading={pending}>
                    {pending ? 'Creating...' : 'Create buyer profile'}
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
  profile: BuyerProfileRecord
  canWrite: boolean
  hidden: boolean
  tab: Tab
  sections: string
}) {
  const [state, action, pending] = useActionState(updateBuyerAction, {})
  useSettleOnOk(state)
  const ro = !canWrite || !!profile.deletedAt
  const sec = (name: Tab) => (tab === name ? 'space-y-3' : 'hidden')

  return (
    <form action={action} className={hidden ? 'hidden' : undefined}>
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="version" value={profile.version} />

      <div id={`${sections}-overview`} className={sec('overview')}>
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
        <div className="grid grid-cols-1 gap-gap sm:grid-cols-2">
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

      <div id={`${sections}-markets`} className={sec('markets')}>
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

      <div id={`${sections}-certifications`} className={sec('certifications')}>
        <Arr
          name="certificationsRequired"
          label="Certifications required"
          value={profile.certificationsRequired}
          disabled={ro}
        />
      </div>

      <div id={`${sections}-settings`} className={sec('settings')}>
        <Text name="website" label="Website" defaultValue={profile.website} disabled={ro} />
        <DangerZone profile={profile} canWrite={canWrite} />
      </div>

      {!ro ? (
        <div className="mt-gap-lg space-y-gap">
          <Button type="submit" variant="primary" disabled={pending} loading={pending}>
            {pending ? 'Saving...' : 'Save changes'}
          </Button>
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? <Alert tone="success">Saved</Alert> : null}
        </div>
      ) : null}
    </form>
  )
}

function DangerZone({ profile, canWrite }: { profile: BuyerProfileRecord; canWrite: boolean }) {
  const [dState, del, dPending] = useActionState(deleteBuyerAction, {})
  const [rState, restore, rPending] = useActionState(restoreBuyerAction, {})
  useSettleOnOk(dState)
  useSettleOnOk(rState)
  if (!canWrite) return null

  return (
    <Card className="mt-gap-lg">
      <CardHeader>
        <CardTitle as="h3">Danger zone</CardTitle>
      </CardHeader>
      {/* Both controls stay submit buttons of the SURROUNDING edit form, driven
          by `formAction`. `formNoValidate` is what lets deleting a profile skip
          the form's own constraints - a profile you are removing does not have
          to be valid first. `Button` forwards both, because it spreads its props
          onto a real `<button>` and sets no `type` of its own. */}
      <CardContent className="space-y-gap">
        {profile.deletedAt ? (
          <>
            <Button
              variant="secondary"
              formAction={restore}
              formNoValidate
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
  useSettleOnOk(state)
  const ro = !canWrite || !!profile.deletedAt
  return (
    <div className="space-y-gap-lg">
      <Card>
        <CardHeader>
          <CardTitle as="h3">Products of interest ({profile.products.length})</CardTitle>
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
                    {p.targetVolume ? (
                      <span className="text-content-subtle"> &middot; {p.targetVolume}</span>
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
            <CardTitle as="h3">Add product of interest</CardTitle>
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
                <Input name="targetVolume" aria-label="Target volume" placeholder="Target volume" />
                <Input name="targetPrice" aria-label="Target price" placeholder="Target price" />
                <Input name="frequency" aria-label="Frequency" placeholder="Frequency" />
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
  const [state, action, pending] = useActionState(removeBuyerProductAction, {})
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

/**
 * Label above control, with the two tied together by id.
 *
 * The pairing is the point. These fields previously rendered a bare `<label>`
 * with no `htmlFor` and inputs with no `id`, so not one of them had an
 * accessible name - a screen reader read the whole form as eight unlabelled
 * boxes. Nothing about what is submitted changes: `name` is untouched.
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
