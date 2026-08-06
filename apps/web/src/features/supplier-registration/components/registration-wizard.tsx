'use client'

import { Alert, Button, Card, Progress } from '@triyara/ui'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useSubmitRegistration } from '../api/registration'
import { clearDraft, loadDraft, saveDraft } from '../draft'
import { draftToPayload, EMPTY_DRAFT, type RegistrationDraft } from '../types'
import {
  BusinessStep,
  CertificationsStep,
  CompanyStep,
  ContactStep,
  DocumentsStep,
  ProductsStep,
  type StepPatch,
} from './registration-steps'

const STEPS = [
  { id: 'company', title: 'Your company', blurb: 'Who you are and where you operate.' },
  { id: 'contact', title: 'Primary contact', blurb: 'Who we should speak to.' },
  { id: 'products', title: 'Products', blurb: 'What you supply, and on what terms.' },
  { id: 'certifications', title: 'Certifications', blurb: 'What you hold.' },
  { id: 'documents', title: 'Documents', blurb: 'Anything you can send us now.' },
  { id: 'business', title: 'Business details', blurb: 'How you trade.' },
] as const

/** Only the two answers a registration is useless without. */
function validateStep(step: number, draft: RegistrationDraft): Record<string, string> {
  const errors: Record<string, string> = {}
  if (step === 0) {
    if (!draft.company.companyName.trim())
      errors['company.companyName'] = 'Company name is required.'
    if (!draft.company.legalName.trim()) errors['company.legalName'] = 'Legal name is required.'
    if (!draft.company.businessType) errors['company.businessType'] = 'Select a business type.'
    if (!/^[A-Z]{2}$/.test(draft.company.country.trim())) {
      errors['company.country'] = 'Enter a two-letter country code, e.g. IN.'
    }
    if (draft.company.website.trim() && !/^https?:\/\//i.test(draft.company.website.trim())) {
      errors['company.website'] = 'Include https:// at the start.'
    }
  }
  if (step === 1) {
    if (!draft.contact.name.trim()) errors['contact.name'] = 'Contact name is required.'
    const reachable =
      draft.contact.email.trim() || draft.contact.mobile.trim() || draft.contact.whatsapp.trim()
    if (!reachable) {
      errors['contact.email'] = 'Give us an email, mobile or WhatsApp number so we can reach you.'
    }
    if (draft.contact.email.trim() && !draft.contact.email.includes('@')) {
      errors['contact.email'] = 'That does not look like an email address.'
    }
  }
  return errors
}

/**
 * The public supplier registration wizard (TRY-BNP-SUPPLIER-REG).
 *
 * Six steps, because one page of forty fields is what makes a supplier close
 * the tab. Only the first two steps validate: a company that cannot yet answer
 * a question about packaging must still be able to reach us, and the review
 * team can ask for the rest. Over-validating a public form does not improve
 * data quality, it loses suppliers.
 */
export function RegistrationWizard() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<RegistrationDraft>(EMPTY_DRAFT)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [restored, setRestored] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const submit = useSubmitRegistration()

  // Restore once, after mount. Reading localStorage during render would
  // disagree with the server-rendered markup and trip hydration.
  useEffect(() => {
    const existing = loadDraft()
    if (existing) {
      setDraft(existing)
      setRestored(true)
    }
  }, [])

  // Auto-save, debounced. Every keystroke would serialise the whole form.
  useEffect(() => {
    if (draft === EMPTY_DRAFT) return
    const timer = setTimeout(() => {
      saveDraft(draft)
      setSavedAt(new Date())
    }, 800)
    return () => clearTimeout(timer)
  }, [draft])

  const patch = useCallback<StepPatch>((updater) => {
    setDraft((current) => ({ ...current, ...updater(current) }))
  }, [])

  /**
   * Moves focus to the new step's heading, so a keyboard or screen-reader user
   * is not left on a button that now belongs to a different step.
   *
   * In an effect keyed on `step`, NOT in the click handler. Scheduling it with
   * requestAnimationFrame there meant the focus landed after React had already
   * painted the new step and the person had begun typing — it then pulled focus
   * out of the field mid-word and silently swallowed the rest of what they
   * typed. Here it runs once, right after the step commits, before any input.
   */
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    headingRef.current?.focus()
  }, [step])

  const isLast = step === STEPS.length - 1
  const percent = useMemo(() => Math.round(((step + 1) / STEPS.length) * 100), [step])

  function goTo(next: number) {
    setStep(next)
    setErrors({})
  }

  function next() {
    const found = validateStep(step, draft)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    goTo(step + 1)
  }

  async function finish() {
    // Defensive re-check of the gating steps. Not reachable through the
    // buttons today, because Continue already blocks on them — kept because
    // the cost is nothing and any future way to jump steps (a clickable
    // progress bar, a deep link) would otherwise submit an invalid form.
    for (const index of [0, 1]) {
      const found = validateStep(index, draft)
      if (Object.keys(found).length > 0) {
        setErrors(found)
        goTo(index)
        return
      }
    }
    try {
      await submit.mutateAsync(draftToPayload(draft))
    } catch {
      // The mutation carries the message for display below. Rethrowing would
      // escape the click handler as an unhandled rejection and lose the form.
      return
    }
    clearDraft()
    router.push('/register/supplier/thank-you')
  }

  const current = STEPS[step]!

  return (
    <div className="mx-auto w-full max-w-3xl space-y-gutter px-gutter py-section">
      <header className="space-y-gap">
        <div>
          <h1 className="text-md font-semibold tracking-tight text-content sm:text-lg">
            Register as a Triyara supplier
          </h1>
          <p className="mt-gap-xs text-xs text-content-muted">
            Tell us about your company once. Our verification team reviews every application and
            comes back to you.
          </p>
        </div>

        <div className="space-y-gap-xs">
          <Progress value={percent} label={`Step ${step + 1} of ${STEPS.length}`} className="h-1" />
          <div className="flex items-center justify-between text-2xs text-content-muted">
            <span>
              Step {step + 1} of {STEPS.length}
            </span>
            {savedAt ? <span aria-live="polite">Draft saved</span> : null}
          </div>
        </div>
      </header>

      {restored ? (
        <Alert tone="info" title="We kept what you had already filled in">
          Your answers are saved on this device as you type.{' '}
          <button
            type="button"
            className="focus-ring rounded-xs underline"
            onClick={() => {
              clearDraft()
              setDraft(EMPTY_DRAFT)
              setRestored(false)
              goTo(0)
            }}
          >
            Start again
          </button>
        </Alert>
      ) : null}

      <Card className="p-0">
        <div className="border-b border-line px-gutter py-gap-lg">
          {/* Focused on each step change so screen readers announce the new
              step, and no focus ring: the user did not tab here, and a ring on
              a heading reads as "this is interactive" when it is not. */}
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-base font-medium text-content outline-none"
          >
            {current.title}
          </h2>
          <p className="text-xs text-content-muted">{current.blurb}</p>
        </div>

        <div className="px-gutter py-gutter">
          {step === 0 ? <CompanyStep draft={draft} patch={patch} errors={errors} /> : null}
          {step === 1 ? <ContactStep draft={draft} patch={patch} errors={errors} /> : null}
          {step === 2 ? <ProductsStep draft={draft} patch={patch} /> : null}
          {step === 3 ? <CertificationsStep draft={draft} patch={patch} /> : null}
          {step === 4 ? <DocumentsStep draft={draft} patch={patch} /> : null}
          {step === 5 ? <BusinessStep draft={draft} patch={patch} /> : null}
        </div>

        {submit.isError ? (
          <div className="px-gutter pb-gutter">
            <Alert tone="danger" title="We could not submit your registration">
              <span role="alert">
                {submit.error instanceof Error
                  ? submit.error.message
                  : 'Something went wrong. Please try again.'}
              </span>
            </Alert>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-gap border-t border-line px-gutter py-gap-lg">
          <Button
            type="button"
            variant="ghost"
            leadingIcon={<ArrowLeft />}
            disabled={step === 0 || submit.isPending}
            onClick={() => goTo(step - 1)}
          >
            Back
          </Button>

          {isLast ? (
            <Button
              type="button"
              variant="primary"
              leadingIcon={<Check />}
              loading={submit.isPending}
              onClick={() => void finish()}
            >
              Submit registration
            </Button>
          ) : (
            <Button type="button" variant="primary" trailingIcon={<ArrowRight />} onClick={next}>
              Continue
            </Button>
          )}
        </div>
      </Card>

      <p className="text-center text-2xs text-content-subtle">
        Already registered with us? Nothing to do — we will be in touch.
      </p>
    </div>
  )
}
