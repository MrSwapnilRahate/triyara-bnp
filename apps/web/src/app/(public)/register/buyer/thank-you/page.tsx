import { Button, Card } from '@triyara/ui'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Enquiry received · Triyara Exports',
}

// Its own route rather than a state inside the wizard, so a refresh, a back
// button or a shared link all land somewhere sensible instead of resurrecting a
// submitted form.
export default function BuyerThankYouPage() {
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
          <p>Your enquiry has been submitted successfully.</p>
          <p>Our team will review your requirement.</p>
          <p>We will contact you with what we can source.</p>
        </div>
        {/* The next thing a buyer wants to do is describe what they need.
            Offering it here rather than making them wait for an email is the
            difference between an enquiry and a live requirement. */}
        <Button asChild variant="primary" size="lg" className="mt-gutter">
          <Link href="/register/buyer/requirement">
            Submit Your First Requirement
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </Card>
      <p className="mt-gutter text-2xs text-content-subtle">Triyara Exports LLP</p>
    </div>
  )
}
