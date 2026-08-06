'use client'

import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@triyara/ui'
import { CERTIFICATION_TYPES, SUPPLIER_BUSINESS_TYPES } from '@triyara/validation'
import { Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'

import type { RegistrationDraft } from '../types'
import { ChipsInput } from './chips-input'
import { UploadField } from './upload-field'

/** The document types a registrant is actually asked for, in the brief's order. */
const REQUESTED_DOCUMENTS = [
  { type: 'COMPANY_PROFILE', label: 'Company profile' },
  { type: 'CATALOG', label: 'Catalogue' },
  { type: 'FACTORY_PHOTOS', label: 'Factory photos' },
  { type: 'IMPORT_EXPORT_LICENSE', label: 'Import / export licence' },
  { type: 'GST', label: 'GST certificate' },
  { type: 'IEC', label: 'IEC certificate' },
] as const

const humanise = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ')

/**
 * Applies an update computed from the CURRENT draft.
 *
 * An updater rather than a plain partial because the steps would otherwise
 * close over the `draft` prop captured at render: React batches keystrokes,
 * so two characters typed inside one batch both build their patch from the
 * same stale snapshot and the second silently loses the first. That drops
 * characters for anyone typing at speed.
 */
export type StepPatch = (
  updater: (current: RegistrationDraft) => Partial<RegistrationDraft>,
) => void

function Field({
  label,
  htmlFor,
  hint,
  required,
  error,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  required?: boolean
  error?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-gap-xs">
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {hint ? <p className="text-2xs text-content-muted">{hint}</p> : null}
      {children}
      {error ? (
        <p role="alert" className="text-2xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

const GRID = 'grid gap-gutter sm:grid-cols-2'

// ---- 1. Company ----

export function CompanyStep({
  draft,
  patch,
  errors,
}: {
  draft: RegistrationDraft
  patch: StepPatch
  errors: Record<string, string>
}) {
  const set = (key: keyof RegistrationDraft['company'], value: string) =>
    patch((d) => ({ company: { ...d.company, [key]: value } }))

  return (
    <div className={GRID}>
      <Field
        label="Company name"
        htmlFor="companyName"
        required
        error={errors['company.companyName']}
      >
        <Input
          id="companyName"
          value={draft.company.companyName}
          onChange={(e) => set('companyName', e.target.value)}
          invalid={Boolean(errors['company.companyName'])}
        />
      </Field>

      <Field
        label="Legal name"
        htmlFor="legalName"
        hint="As registered."
        required
        error={errors['company.legalName']}
      >
        <Input
          id="legalName"
          value={draft.company.legalName}
          onChange={(e) => set('legalName', e.target.value)}
          invalid={Boolean(errors['company.legalName'])}
        />
      </Field>

      <Field
        label="Business type"
        htmlFor="businessType"
        required
        error={errors['company.businessType']}
      >
        <Select
          value={draft.company.businessType}
          onValueChange={(value) => set('businessType', value)}
        >
          <SelectTrigger id="businessType">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            {SUPPLIER_BUSINESS_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {humanise(type)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        label="Country"
        htmlFor="country"
        hint="Two-letter code, e.g. IN."
        required
        error={errors['company.country']}
      >
        <Input
          id="country"
          value={draft.company.country}
          maxLength={2}
          onChange={(e) => set('country', e.target.value.toUpperCase())}
          invalid={Boolean(errors['company.country'])}
        />
      </Field>

      <Field label="State" htmlFor="state">
        <Input
          id="state"
          value={draft.company.state}
          onChange={(e) => set('state', e.target.value)}
        />
      </Field>

      <Field label="City" htmlFor="city">
        <Input id="city" value={draft.company.city} onChange={(e) => set('city', e.target.value)} />
      </Field>

      <Field label="GST number" htmlFor="gstNumber" hint="Optional.">
        <Input
          id="gstNumber"
          value={draft.company.gstNumber}
          onChange={(e) => set('gstNumber', e.target.value.toUpperCase())}
        />
      </Field>

      <Field label="IEC number" htmlFor="iecNumber" hint="Optional.">
        <Input
          id="iecNumber"
          value={draft.company.iecNumber}
          onChange={(e) => set('iecNumber', e.target.value.toUpperCase())}
        />
      </Field>

      <Field
        label="Website"
        htmlFor="website"
        hint="Include https://"
        error={errors['company.website']}
      >
        <Input
          id="website"
          type="url"
          placeholder="https://"
          value={draft.company.website}
          onChange={(e) => set('website', e.target.value)}
          invalid={Boolean(errors['company.website'])}
        />
      </Field>

      <Field label="Year established" htmlFor="establishedYear">
        <Input
          id="establishedYear"
          inputMode="numeric"
          value={draft.company.establishedYear}
          onChange={(e) => set('establishedYear', e.target.value)}
        />
      </Field>

      <Field label="Employee count" htmlFor="employeeCount">
        <Input
          id="employeeCount"
          inputMode="numeric"
          value={draft.company.employeeCount}
          onChange={(e) => set('employeeCount', e.target.value)}
        />
      </Field>
    </div>
  )
}

// ---- 2. Primary contact ----

export function ContactStep({
  draft,
  patch,
  errors,
}: {
  draft: RegistrationDraft
  patch: StepPatch
  errors: Record<string, string>
}) {
  const set = (key: keyof RegistrationDraft['contact'], value: string) =>
    patch((d) => ({ contact: { ...d.contact, [key]: value } }))

  return (
    <div className="space-y-gutter">
      <p className="text-xs text-content-muted">
        We need one way to reach you — email, mobile or WhatsApp. Any one is enough.
      </p>
      <div className={GRID}>
        <Field label="Name" htmlFor="contactName" required error={errors['contact.name']}>
          <Input
            id="contactName"
            value={draft.contact.name}
            onChange={(e) => set('name', e.target.value)}
            invalid={Boolean(errors['contact.name'])}
          />
        </Field>

        <Field label="Designation" htmlFor="designation">
          <Input
            id="designation"
            value={draft.contact.designation}
            onChange={(e) => set('designation', e.target.value)}
          />
        </Field>

        <Field label="Email" htmlFor="email" error={errors['contact.email']}>
          <Input
            id="email"
            type="email"
            value={draft.contact.email}
            onChange={(e) => set('email', e.target.value)}
            invalid={Boolean(errors['contact.email'])}
          />
        </Field>

        <Field label="Mobile" htmlFor="mobile">
          <Input
            id="mobile"
            type="tel"
            value={draft.contact.mobile}
            onChange={(e) => set('mobile', e.target.value)}
          />
        </Field>

        <Field label="WhatsApp" htmlFor="whatsapp" hint="If different from your mobile.">
          <Input
            id="whatsapp"
            type="tel"
            value={draft.contact.whatsapp}
            onChange={(e) => set('whatsapp', e.target.value)}
          />
        </Field>
      </div>
    </div>
  )
}

// ---- 3. Products ----

export function ProductsStep({ draft, patch }: { draft: RegistrationDraft; patch: StepPatch }) {
  const set = (key: 'moq' | 'productionCapacity' | 'leadTimeDays', value: string) =>
    patch((d) => ({ products: { ...d.products, [key]: value } }))

  return (
    <div className="space-y-gutter">
      <ChipsInput
        label="What do you supply?"
        hint="Type a product and press Enter. Add as many as you like."
        placeholder="Turmeric, cumin, basmati rice…"
        values={draft.products.proposedProducts}
        onChange={(next) => patch((d) => ({ products: { ...d.products, proposedProducts: next } }))}
        maxItems={100}
      />

      <div className={GRID}>
        <Field label="Minimum order quantity" htmlFor="moq" hint="e.g. 1 container, 5 MT.">
          <Input id="moq" value={draft.products.moq} onChange={(e) => set('moq', e.target.value)} />
        </Field>

        <Field
          label="Production capacity"
          htmlFor="productionCapacity"
          hint="e.g. 200 MT per month."
        >
          <Input
            id="productionCapacity"
            value={draft.products.productionCapacity}
            onChange={(e) => set('productionCapacity', e.target.value)}
          />
        </Field>

        <Field label="Lead time (days)" htmlFor="leadTimeDays">
          <Input
            id="leadTimeDays"
            inputMode="numeric"
            value={draft.products.leadTimeDays}
            onChange={(e) => set('leadTimeDays', e.target.value)}
          />
        </Field>
      </div>
    </div>
  )
}

// ---- 4. Certifications ----

export function CertificationsStep({
  draft,
  patch,
}: {
  draft: RegistrationDraft
  patch: StepPatch
}) {
  const selected = new Set(draft.certifications.map((c) => c.type))

  function toggle(type: string, on: boolean) {
    patch((d) => ({
      certifications: on
        ? [...d.certifications, { type }]
        : d.certifications.filter((c) => c.type !== type),
    }))
  }

  function attach(type: string, file: { storageKey: string; fileName: string; mimeType: string }) {
    patch((d) => ({
      certifications: d.certifications.map((c) => (c.type === type ? { ...c, ...file } : c)),
    }))
  }

  return (
    <div className="space-y-gutter">
      <p className="text-xs text-content-muted">
        Tick what you hold and attach the certificate if you have it to hand. Our team confirms each
        one during verification.
      </p>

      <ul className="grid gap-gap sm:grid-cols-2">
        {CERTIFICATION_TYPES.map((type) => {
          const on = selected.has(type)
          const entry = draft.certifications.find((c) => c.type === type)
          return (
            <li key={type} className="rounded-sm border border-line p-gap">
              <div className="flex items-center gap-gap">
                <Checkbox
                  id={`cert-${type}`}
                  checked={on}
                  onCheckedChange={(next) => toggle(type, next === true)}
                />
                <Label htmlFor={`cert-${type}`} className="cursor-pointer">
                  {type}
                </Label>
              </div>
              {on ? (
                <div className="mt-gap">
                  <UploadField
                    label={`${type} certificate`}
                    hint="Optional — a scan or photo is fine."
                    {...(entry?.storageKey
                      ? { value: { fileName: entry.fileName, storageKey: entry.storageKey } }
                      : {})}
                    onUploaded={(result) => attach(type, result)}
                    onCleared={() =>
                      patch((d) => ({
                        certifications: d.certifications.map((c) =>
                          c.type === type ? { type: c.type } : c,
                        ),
                      }))
                    }
                  />
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---- 5. Documents ----

export function DocumentsStep({ draft, patch }: { draft: RegistrationDraft; patch: StepPatch }) {
  function setDocument(
    type: string,
    file: { storageKey: string; fileName: string; mimeType: string } | null,
  ) {
    patch((current) => {
      const others = current.documents.filter((doc) => doc.type !== type)
      return { documents: file ? [...others, { type, ...file }] : others }
    })
  }

  const extras = draft.documents.filter((d) => !REQUESTED_DOCUMENTS.some((r) => r.type === d.type))

  return (
    <div className="space-y-gutter">
      <p className="text-xs text-content-muted">
        All optional. Anything you send now is one thing less for us to ask for later.
      </p>

      <div className={GRID}>
        {REQUESTED_DOCUMENTS.map((doc) => {
          const existing = draft.documents.find((d) => d.type === doc.type)
          return (
            <UploadField
              key={doc.type}
              label={doc.label}
              {...(existing
                ? { value: { fileName: existing.fileName, storageKey: existing.storageKey } }
                : {})}
              onUploaded={(result) => setDocument(doc.type, result)}
              onCleared={() => setDocument(doc.type, null)}
            />
          )
        })}
      </div>

      <div className="space-y-gap">
        <p className="text-xs font-medium text-content">Anything else</p>
        {extras.map((doc, index) => (
          <div
            key={`${doc.storageKey}-${index}`}
            className="flex items-center justify-between gap-gap rounded-sm border border-line px-2.5 py-1.5"
          >
            <span className="truncate text-xs text-content">{doc.fileName ?? 'Attachment'}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remove ${doc.fileName ?? 'attachment'}`}
              onClick={() =>
                patch((current) => ({
                  documents: current.documents.filter((existing) => existing !== doc),
                }))
              }
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        ))}
        <UploadField
          label="Add another document"
          onUploaded={(result) =>
            patch((d) => ({ documents: [...d.documents, { type: 'OTHER', ...result }] }))
          }
          onCleared={() => undefined}
        />
      </div>
    </div>
  )
}

// ---- 6. Business details ----

export function BusinessStep({ draft, patch }: { draft: RegistrationDraft; patch: StepPatch }) {
  const set = (key: 'packaging' | 'paymentTerms' | 'containerCapacity', value: string) =>
    patch((d) => ({ business: { ...d.business, [key]: value } }))

  return (
    <div className="space-y-gutter">
      <ChipsInput
        label="Export countries"
        hint="Two-letter codes. Press Enter after each."
        placeholder="AE, US, GB…"
        values={draft.business.exportCountries}
        onChange={(next) => patch((d) => ({ business: { ...d.business, exportCountries: next } }))}
        maxItems={200}
        transform={(v) => v.toUpperCase()}
      />

      <ChipsInput
        label="Shipping ports"
        placeholder="Nhava Sheva, Mundra…"
        values={draft.business.shippingPorts}
        onChange={(next) => patch((d) => ({ business: { ...d.business, shippingPorts: next } }))}
      />

      <ChipsInput
        label="Languages"
        placeholder="English, Hindi…"
        values={draft.business.languages}
        onChange={(next) => patch((d) => ({ business: { ...d.business, languages: next } }))}
        maxItems={30}
      />

      <div className={GRID}>
        <Field label="Packaging" htmlFor="packaging" hint="What you can pack in.">
          <Textarea
            id="packaging"
            rows={3}
            value={draft.business.packaging}
            onChange={(e) => set('packaging', e.target.value)}
          />
        </Field>

        <Field label="Payment terms" htmlFor="paymentTerms" hint="What you normally work on.">
          <Textarea
            id="paymentTerms"
            rows={3}
            value={draft.business.paymentTerms}
            onChange={(e) => set('paymentTerms', e.target.value)}
          />
        </Field>

        <Field
          label="Container capacity"
          htmlFor="containerCapacity"
          hint="e.g. 4 x 20ft per month."
        >
          <Input
            id="containerCapacity"
            value={draft.business.containerCapacity}
            onChange={(e) => set('containerCapacity', e.target.value)}
          />
        </Field>
      </div>

      <Field label="Anything else you want us to know?" htmlFor="notes" hint="Optional.">
        <Textarea
          id="notes"
          rows={4}
          value={draft.notes}
          onChange={(e) => patch(() => ({ notes: e.target.value }))}
        />
      </Field>
    </div>
  )
}
