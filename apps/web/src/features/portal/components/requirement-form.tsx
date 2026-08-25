'use client'

import { Button, Card, CardContent, CardHeader, CardTitle, Input, Textarea } from '@triyara/ui'
import Link from 'next/link'
import { useActionState } from 'react'

import {
  submitRequirementAction,
  type SubmitRequirementState,
} from '@/app/(portal)/portal/requirements/actions'

/**
 * Where a buyer tells us what they need.
 *
 * Every field here is about the goods. There is no company field, no contact
 * name, no email, no account and no organization - we already know all of that
 * from who is signed in, and asking again would invite a different answer. A
 * form that let a buyer type their own company name is a form that lets them
 * type somebody else's.
 *
 * The submit button disables itself while the action is in flight, which handles
 * the ordinary double-click. It is not the guarantee, though: the server holds a
 * short per-account window so a reload, a second tab or a resent request lands
 * on the reference that already exists rather than creating a second enquiry.
 */
export function RequirementForm() {
  const [state, formAction, pending] = useActionState<SubmitRequirementState, FormData>(
    submitRequirementAction,
    {},
  )

  if (state.reference) return <Submitted state={state} />

  return (
    <div className="space-y-gap-lg">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-content">Tell us what you need</h1>
        <p className="text-content-muted">
          Send us the details and our sourcing team will come back to you. The more you can tell us,
          the faster we can shortlist suppliers.
        </p>
      </div>

      <form action={formAction} className="space-y-gap-lg">
        {state.error ? (
          // `alert` so it is announced: a validation failure that only changes
          // colour is invisible to anyone not looking at that part of the page.
          <p role="alert" className="text-sm font-medium text-danger">
            {state.error}
          </p>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle as="h2">The goods</CardTitle>
          </CardHeader>
          <CardContent className="space-y-gap-lg">
            <Field
              name="product"
              label="Product"
              required
              placeholder="Sona Masoori rice, unpolished"
              error={state.fieldErrors?.product}
            />
            <Field
              name="quantity"
              label="Quantity"
              required
              placeholder="2 x 20ft containers"
              error={state.fieldErrors?.quantity}
            />
            <Field
              name="monthlyVolume"
              label="Monthly volume"
              hint="If this is a recurring requirement."
              placeholder="40 MT per month"
              error={state.fieldErrors?.monthlyVolume}
            />
            <Field
              name="packaging"
              label="Packaging"
              placeholder="25kg PP bags, printed"
              error={state.fieldErrors?.packaging}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Commercial terms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-gap-lg">
            <Field
              name="targetPrice"
              label="Target price"
              hint="Tell us what you are aiming for and we will tell you if it is realistic."
              placeholder="USD 440 / MT CIF"
              error={state.fieldErrors?.targetPrice}
            />
            <Field
              name="destinationPort"
              label="Destination port"
              placeholder="Jebel Ali, UAE"
              error={state.fieldErrors?.destinationPort}
            />
            <Field
              name="timeline"
              label="Timeline"
              placeholder="Shipment within 6 weeks"
              error={state.fieldErrors?.timeline}
            />
            <Field
              name="requirements"
              label="Anything else"
              hint="Certifications, specifications, documentation - whatever matters to you."
              multiline
              error={state.fieldErrors?.requirements}
            />
          </CardContent>
        </Card>

        <div className="flex items-center gap-gap">
          <Button type="submit" disabled={pending}>
            {pending ? 'Sending…' : 'Send requirement'}
          </Button>
          <Link href="/portal/requirements" className="focus-ring text-sm text-content-muted">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}

function Submitted({ state }: { state: SubmitRequirementState }) {
  return (
    <div className="space-y-gap-lg">
      {/* `status` rather than `alert`: this is a successful outcome, and the
          politer live region does not interrupt what a screen reader is saying. */}
      <div role="status" className="space-y-2">
        <h1 className="text-2xl font-semibold text-content">
          {state.alreadySubmitted ? 'We already have this one' : 'Thank you — we have it'}
        </h1>
        <p className="text-content-muted">
          {state.alreadySubmitted
            ? 'It looks like you sent this a moment ago, so we have not created a second copy.'
            : 'Our sourcing team will review your requirement and come back to you.'}
        </p>
      </div>

      <Card>
        <CardContent className="space-y-gap">
          <p className="text-2xs font-semibold uppercase tracking-[0.15em] text-content-subtle">
            Your reference
          </p>
          <p className="text-xl font-semibold text-content">{state.reference}</p>
          <p className="text-sm text-content-muted">
            Quote this if you get in touch with us about it.
          </p>
        </CardContent>
      </Card>

      <Link href="/portal/requirements" className="focus-ring inline-block text-sm text-content">
        Back to your requirements
      </Link>
    </div>
  )
}

function Field({
  name,
  label,
  hint,
  error,
  required,
  multiline,
  placeholder,
}: {
  name: string
  label: string
  hint?: string
  error?: string
  required?: boolean
  multiline?: boolean
  placeholder?: string
}) {
  const hintId = hint ? `${name}-hint` : undefined
  const errorId = error ? `${name}-error` : undefined
  // Both, when both exist. Dropping the hint on error would remove the guidance
  // at exactly the moment it is needed.
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className="space-y-1">
      <label htmlFor={name} className="text-sm font-medium text-content">
        {label}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </label>
      {hint ? (
        <p id={hintId} className="text-sm text-content-muted">
          {hint}
        </p>
      ) : null}
      {multiline ? (
        <Textarea
          id={name}
          name={name}
          rows={4}
          required={required}
          placeholder={placeholder}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
        />
      ) : (
        <Input
          id={name}
          name={name}
          required={required}
          placeholder={placeholder}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
        />
      )}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
