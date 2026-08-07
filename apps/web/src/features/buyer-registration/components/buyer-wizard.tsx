'use client'

import { Alert, Button, Card, Progress } from '@triyara/ui'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useSubmitBuyerRegistration } from '../api/registration'
import { clearDraft, loadDraft, saveDraft } from '../draft'
import { type BuyerDraft, buyerDraftToPayload, EMPTY_BUYER_DRAFT } from '../types'
import {
  BuyerCompanyStep,
  BuyerContactStep,
  BuyerDocumentsStep,
  BuyerLogisticsStep,
  type BuyerPatch,
  BuyerRequirementStep,
} from './buyer-steps'

const STEPS = [
  { id: 'company', title: 'Your company', blurb: 'Who you are and where you are.' },
  { id: 'contact', title: 'Your contact', blurb: 'Who we should speak to.' },
  { id: 'requirement', title: 'What you need', blurb: 'Products, quantities and packaging.' },
  { id: 'logistics', title: 'Destination and terms', blurb: 'Where it lands, and on what terms.' },
  { id: 'documents', title: 'Documents', blurb: 'Anything you can send us now.' },
] as const

/** Only the two answers an enquiry is useless without. */
function validateStep(step: number, draft: BuyerDraft): Record<string, string> {
  const errors: Record<string, string> = {}
  if (step === 0) {
    if (!draft.company.companyName.trim()) {
      errors['company.companyName'] = 'Company name is required.'
    }
    if (!/^[A-Z]{2}$/.test(draft.company.country.trim())) {
      errors['company.country'] = 'Enter a two-letter country code, e.g. AE.'
    }
    if (draft.company.website.trim() && !/^https?:\/\//i.test(draft.company.website.trim())) {
      errors['company.website'] = 'Include https:// at the start.'
    }
  }
  if (step === 1) {
    if (!draft.contact.name.trim()) errors['contact.name'] = 'Contact name is required.'
    const reachable =
      draft.contact.email.trim() || draft.contact.phone.trim() || draft.contact.whatsapp.trim()
    if (!reachable) {
      errors['contact.email'] = 'Give us an email, phone or WhatsApp number so we can reach you.'
    }
    if (draft.contact.email.trim() && !draft.contact.email.includes('@')) {
      errors['contact.email'] = 'That does not look like an email address.'
    }
  }
  return errors
}

/**
 * The public buyer registration wizard (TRY-BNP-BUYER-REG).
 *
 * Five steps rather than the supplier form's six — a buyer has no
 * certifications of their own to declare — but otherwise the same shape, the
 * same draft handling and the same rule about what is required: only the
 * company and a way to reach someone. A buyer who cannot yet name a
 * destination port must still be able to send the enquiry.
 */
export function BuyerRegistrationWizard() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<BuyerDraft>(EMPTY_BUYER_DRAFT)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [restored, setRestored] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const submit = useSubmitBuyerRegistration()

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
    if (draft === EMPTY_BUYER_DRAFT) return
    const timer = setTimeout(() => {
      saveDraft(draft)
      setSavedAt(new Date())
    }, 800)
    return () => clearTimeout(timer)
  }, [draft])

  const patch = useCallback<BuyerPatch>((updater) => {
    setDraft((current) => ({ ...current, ...updater(current) }))
  }, [])

  /**
   * Focus the new step's heading in an effect, not in the click handler. The
   * supplier wizard did the latter via requestAnimationFrame and it landed
   * after typing had begun, pulling focus mid-word and swallowing characters.
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
    // Defensive re-check of the gating steps; Continue already blocks on them.
    for (const index of [0, 1]) {
      const found = validateStep(index, draft)
      if (Object.keys(found).length > 0) {
        setErrors(found)
        goTo(index)
        return
      }
    }
    try {
      await submit.mutateAsync(buyerDraftToPayload(draft))
    } catch {
      // The mutation carries the message for display below. Rethrowing would
      // escape the click handler as an unhandled rejection and lose the form.
      return
    }
    clearDraft()
    router.push('/register/buyer/thank-you')
  }

  const current = STEPS[step]!

  return (
    <div className="mx-auto w-full max-w-3xl space-y-gutter px-gutter py-section">
      <header className="space-y-gap">
        <div>
          <h1 className="text-md font-semibold tracking-tight text-content sm:text-lg">
            Tell us what you are looking to buy
          </h1>
          <p className="mt-gap-xs text-xs text-content-muted">
            Send us your requirement once. Our team reviews every enquiry and comes back to you with
            what we can source.
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
              setDraft(EMPTY_BUYER_DRAFT)
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
              step, and no focus ring: the user did not tab here. */}
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
          {step === 0 ? <BuyerCompanyStep draft={draft} patch={patch} errors={errors} /> : null}
          {step === 1 ? <BuyerContactStep draft={draft} patch={patch} errors={errors} /> : null}
          {step === 2 ? <BuyerRequirementStep draft={draft} patch={patch} /> : null}
          {step === 3 ? <BuyerLogisticsStep draft={draft} patch={patch} /> : null}
          {step === 4 ? <BuyerDocumentsStep draft={draft} patch={patch} /> : null}
        </div>

        {submit.isError ? (
          <div className="px-gutter pb-gutter">
            <Alert tone="danger" title="We could not send your enquiry">
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
              Send enquiry
            </Button>
          ) : (
            <Button type="button" variant="primary" trailingIcon={<ArrowRight />} onClick={next}>
              Continue
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
