'use client'

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@triyara/ui'
import { BUYER_TYPES, IMPORT_EXPERIENCES } from '@triyara/validation'
import { Plus, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'

// Reused from the supplier form rather than reimplemented: an upload field and
// a chips input behave identically on both, and two copies would drift.
import { ChipsInput } from '@/features/supplier-registration/components/chips-input'
import { UploadField } from '@/features/supplier-registration/components/upload-field'

import { uploadBuyerFile } from '../api/registration'
import { type BuyerDraft, EMPTY_BUYER_PRODUCT } from '../types'

/** The documents a buyer is actually asked for. */
const REQUESTED_DOCUMENTS = [
  { type: 'COMPANY_REGISTRATION', label: 'Company registration' },
  { type: 'COMPANY_PROFILE', label: 'Company profile' },
  { type: 'IMPORT_EXPORT_LICENSE', label: 'Import licence' },
] as const

const humanise = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ')

const IMPORT_EXPERIENCE_LABELS: Record<string, string> = {
  NEW: 'New to importing',
  YEARS_1_3: '1–3 years',
  YEARS_3_PLUS: '3+ years',
}

export type BuyerPatch = (updater: (current: BuyerDraft) => Partial<BuyerDraft>) => void

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

export function BuyerCompanyStep({
  draft,
  patch,
  errors,
}: {
  draft: BuyerDraft
  patch: BuyerPatch
  errors: Record<string, string>
}) {
  const set = (key: keyof BuyerDraft['company'], value: string) =>
    patch((d) => ({ company: { ...d.company, [key]: value } }))

  return (
    <div className={GRID}>
      <Field
        label="Company name"
        htmlFor="buyerCompanyName"
        required
        error={errors['company.companyName']}
      >
        <Input
          id="buyerCompanyName"
          value={draft.company.companyName}
          onChange={(e) => set('companyName', e.target.value)}
          invalid={Boolean(errors['company.companyName'])}
        />
      </Field>

      <Field label="Legal name" htmlFor="buyerLegalName" hint="If different.">
        <Input
          id="buyerLegalName"
          value={draft.company.legalName}
          onChange={(e) => set('legalName', e.target.value)}
        />
      </Field>

      <Field label="Business type" htmlFor="buyerBusinessType">
        <Select
          value={draft.company.businessType}
          onValueChange={(value) => set('businessType', value)}
        >
          <SelectTrigger id="buyerBusinessType">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            {BUYER_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {humanise(type)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        label="Country"
        htmlFor="buyerCountry"
        hint="Two-letter code, e.g. AE."
        required
        error={errors['company.country']}
      >
        <Input
          id="buyerCountry"
          value={draft.company.country}
          maxLength={2}
          onChange={(e) => set('country', e.target.value.toUpperCase())}
          invalid={Boolean(errors['company.country'])}
        />
      </Field>

      <Field label="City" htmlFor="buyerCity">
        <Input
          id="buyerCity"
          value={draft.company.city}
          onChange={(e) => set('city', e.target.value)}
        />
      </Field>

      <Field
        label="Website"
        htmlFor="buyerWebsite"
        hint="Include https://"
        error={errors['company.website']}
      >
        <Input
          id="buyerWebsite"
          type="url"
          placeholder="https://"
          value={draft.company.website}
          onChange={(e) => set('website', e.target.value)}
          invalid={Boolean(errors['company.website'])}
        />
      </Field>

      <Field label="Import experience" htmlFor="buyerImportExperience">
        <Select
          value={draft.company.importExperience}
          onValueChange={(value) => set('importExperience', value)}
        >
          <SelectTrigger id="buyerImportExperience">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            {IMPORT_EXPERIENCES.map((value) => (
              <SelectItem key={value} value={value}>
                {IMPORT_EXPERIENCE_LABELS[value] ?? humanise(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  )
}

// ---- 2. Contact ----

export function BuyerContactStep({
  draft,
  patch,
  errors,
}: {
  draft: BuyerDraft
  patch: BuyerPatch
  errors: Record<string, string>
}) {
  const set = (key: keyof BuyerDraft['contact'], value: string) =>
    patch((d) => ({ contact: { ...d.contact, [key]: value } }))

  return (
    <div className="space-y-gutter">
      <p className="text-xs text-content-muted">
        We need one way to reach you — email, phone or WhatsApp. Any one is enough.
      </p>
      <div className={GRID}>
        <Field label="Name" htmlFor="buyerContactName" required error={errors['contact.name']}>
          <Input
            id="buyerContactName"
            value={draft.contact.name}
            onChange={(e) => set('name', e.target.value)}
            invalid={Boolean(errors['contact.name'])}
          />
        </Field>

        <Field label="Designation" htmlFor="buyerDesignation">
          <Input
            id="buyerDesignation"
            value={draft.contact.designation}
            onChange={(e) => set('designation', e.target.value)}
          />
        </Field>

        <Field label="Email" htmlFor="buyerEmail" error={errors['contact.email']}>
          <Input
            id="buyerEmail"
            type="email"
            value={draft.contact.email}
            onChange={(e) => set('email', e.target.value)}
            invalid={Boolean(errors['contact.email'])}
          />
        </Field>

        <Field label="Phone" htmlFor="buyerPhone">
          <Input
            id="buyerPhone"
            type="tel"
            value={draft.contact.phone}
            onChange={(e) => set('phone', e.target.value)}
          />
        </Field>

        <Field label="WhatsApp" htmlFor="buyerWhatsapp" hint="If different from your phone.">
          <Input
            id="buyerWhatsapp"
            type="tel"
            value={draft.contact.whatsapp}
            onChange={(e) => set('whatsapp', e.target.value)}
          />
        </Field>
      </div>
    </div>
  )
}

// ---- 3. Requirement ----

export function BuyerRequirementStep({ draft, patch }: { draft: BuyerDraft; patch: BuyerPatch }) {
  function setProduct(index: number, key: keyof typeof EMPTY_BUYER_PRODUCT, value: string) {
    patch((d) => ({
      requirement: {
        ...d.requirement,
        products: d.requirement.products.map((item, i) =>
          i === index ? { ...item, [key]: value } : item,
        ),
      },
    }))
  }

  return (
    <div className="space-y-gutter">
      <p className="text-xs text-content-muted">
        What do you want to buy, and how much? One line per product.
      </p>

      <ul className="space-y-gutter">
        {draft.requirement.products.map((item, index) => (
          <li key={index} className="rounded-sm border border-line p-gutter">
            <div className="flex items-center justify-between gap-gap">
              <p className="text-xs font-medium text-content">Product {index + 1}</p>
              {draft.requirement.products.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove product ${index + 1}`}
                  onClick={() =>
                    patch((d) => ({
                      requirement: {
                        ...d.requirement,
                        products: d.requirement.products.filter((_, i) => i !== index),
                      },
                    }))
                  }
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              ) : null}
            </div>

            <div className="mt-gap grid gap-gap sm:grid-cols-2">
              <Field label="Product" htmlFor={`product-${index}`}>
                <Input
                  id={`product-${index}`}
                  value={item.product}
                  placeholder="Turmeric fingers"
                  onChange={(e) => setProduct(index, 'product', e.target.value)}
                />
              </Field>
              <Field
                label="Required quantity"
                htmlFor={`volume-${index}`}
                hint="e.g. 2 x 20ft per month."
              >
                <Input
                  id={`volume-${index}`}
                  value={item.targetVolume}
                  onChange={(e) => setProduct(index, 'targetVolume', e.target.value)}
                />
              </Field>
              <Field label="Target price" htmlFor={`price-${index}`} hint="Optional.">
                <Input
                  id={`price-${index}`}
                  value={item.targetPrice}
                  placeholder="$1800 CIF Jebel Ali"
                  onChange={(e) => setProduct(index, 'targetPrice', e.target.value)}
                />
              </Field>
              <Field label="How often" htmlFor={`frequency-${index}`} hint="Optional.">
                <Input
                  id={`frequency-${index}`}
                  value={item.frequency}
                  placeholder="Monthly"
                  onChange={(e) => setProduct(index, 'frequency', e.target.value)}
                />
              </Field>
            </div>
          </li>
        ))}
      </ul>

      <Button
        type="button"
        variant="secondary"
        size="sm"
        leadingIcon={<Plus />}
        onClick={() =>
          patch((d) => ({
            requirement: {
              ...d.requirement,
              products: [...d.requirement.products, { ...EMPTY_BUYER_PRODUCT }],
            },
          }))
        }
      >
        Add another product
      </Button>

      <div className={GRID}>
        <Field
          label="Annual requirement"
          htmlFor="annualRequirement"
          hint="Across everything, if you know it."
        >
          <Input
            id="annualRequirement"
            value={draft.requirement.annualRequirement}
            onChange={(e) =>
              patch((d) => ({
                requirement: { ...d.requirement, annualRequirement: e.target.value },
              }))
            }
          />
        </Field>

        <Field label="Preferred packaging" htmlFor="buyerPackaging" hint="How it must arrive.">
          <Textarea
            id="buyerPackaging"
            rows={3}
            value={draft.requirement.packaging}
            onChange={(e) =>
              patch((d) => ({ requirement: { ...d.requirement, packaging: e.target.value } }))
            }
          />
        </Field>
      </div>
    </div>
  )
}

// ---- 4. Destination and terms ----

export function BuyerLogisticsStep({ draft, patch }: { draft: BuyerDraft; patch: BuyerPatch }) {
  return (
    <div className="space-y-gutter">
      <ChipsInput
        label="Destination countries"
        hint="Two-letter codes. Press Enter after each."
        placeholder="AE, SA, GB…"
        values={draft.logistics.destinationCountries}
        onChange={(next) =>
          patch((d) => ({ logistics: { ...d.logistics, destinationCountries: next } }))
        }
        maxItems={200}
        transform={(v) => v.toUpperCase()}
      />

      <Field label="Destination port" htmlFor="destinationPort">
        <Input
          id="destinationPort"
          placeholder="Jebel Ali"
          value={draft.logistics.destinationPort}
          onChange={(e) =>
            patch((d) => ({ logistics: { ...d.logistics, destinationPort: e.target.value } }))
          }
        />
      </Field>

      <ChipsInput
        label="Incoterms"
        placeholder="CIF, FOB…"
        values={draft.logistics.incoterms}
        onChange={(next) => patch((d) => ({ logistics: { ...d.logistics, incoterms: next } }))}
        maxItems={20}
        transform={(v) => v.toUpperCase()}
      />

      <ChipsInput
        label="Payment terms"
        hint="What you normally work on."
        placeholder="30% advance, LC at sight…"
        values={draft.logistics.paymentTerms}
        onChange={(next) => patch((d) => ({ logistics: { ...d.logistics, paymentTerms: next } }))}
        maxItems={20}
      />

      <ChipsInput
        label="Certifications required"
        hint="What your market demands of us."
        placeholder="FSSAI, HALAL, ORGANIC…"
        values={draft.logistics.certificationsRequired}
        onChange={(next) =>
          patch((d) => ({ logistics: { ...d.logistics, certificationsRequired: next } }))
        }
        maxItems={30}
        transform={(v) => v.toUpperCase()}
      />

      <ChipsInput
        label="Languages"
        placeholder="English, Arabic…"
        values={draft.logistics.languages}
        onChange={(next) => patch((d) => ({ logistics: { ...d.logistics, languages: next } }))}
        maxItems={30}
      />
    </div>
  )
}

// ---- 5. Documents and notes ----

export function BuyerDocumentsStep({ draft, patch }: { draft: BuyerDraft; patch: BuyerPatch }) {
  function setDocument(
    type: string,
    file: { storageKey: string; fileName: string; mimeType: string } | null,
  ) {
    patch((current) => {
      const others = current.documents.filter((doc) => doc.type !== type)
      return { documents: file ? [...others, { type, ...file }] : others }
    })
  }

  const extras = draft.documents.filter(
    (doc) => !REQUESTED_DOCUMENTS.some((r) => r.type === doc.type),
  )

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
              upload={uploadBuyerFile}
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
          upload={uploadBuyerFile}
          onUploaded={(result) =>
            patch((d) => ({
              documents: [...d.documents, { type: 'OTHER', ...result }],
            }))
          }
          onCleared={() => undefined}
        />
      </div>

      <Field label="Anything else you want us to know?" htmlFor="buyerNotes" hint="Optional.">
        <Textarea
          id="buyerNotes"
          rows={4}
          value={draft.notes}
          onChange={(e) => patch(() => ({ notes: e.target.value }))}
        />
      </Field>
    </div>
  )
}
