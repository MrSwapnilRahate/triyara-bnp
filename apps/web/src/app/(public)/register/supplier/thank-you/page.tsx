import { Card } from '@triyara/ui'
import { CheckCircle2 } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Registration received · Triyara Exports',
}

// The confirmation the brief specifies, word for word. It is its own route
// rather than a state inside the wizard so that a refresh, a back button or a
// shared link all land somewhere sensible instead of resurrecting a submitted
// form.
export default function RegistrationThankYouPage() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center px-gutter py-section">
      <Card className="w-full text-center">
        <CheckCircle2
          className="mx-auto size-10 text-success"
          aria-hidden="true"
          strokeWidth={1.5}
        />
        <h1 className="mt-gap-lg text-md font-semibold tracking-tight text-content">Thank you.</h1>
        <div className="mt-gap space-y-gap-xs text-base leading-relaxed text-content-muted">
          <p>Your company has been submitted successfully.</p>
          <p>Our verification team will review your application.</p>
          <p>We will contact you after verification.</p>
        </div>
      </Card>
      <p className="mt-gutter text-2xs text-content-subtle">Triyara Exports LLP</p>
    </div>
  )
}
