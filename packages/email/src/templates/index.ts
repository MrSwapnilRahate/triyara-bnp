import { esc, paras, renderLayout, renderText } from './layout'

/** A template produces exactly what a transport needs, and nothing else. */
export interface Rendered {
  subject: string
  html: string
  text: string
}

/** Trims a trailing slash so `${appUrl}/path` never doubles up. */
export function joinUrl(appUrl: string, path: string): string {
  return `${appUrl.replace(/\/+$/, '')}${path}`
}

// ---------------------------------------------------------------------------
// 1. Supplier registration confirmation
// ---------------------------------------------------------------------------

export function supplierRegistrationConfirmation(input: {
  contactName: string
  companyName: string
  supplierCode: string
}): Rendered {
  const heading = 'We have your registration'
  const html = renderLayout({
    heading,
    bodyHtml: paras(
      `Hello ${esc(input.contactName)},`,
      `Thank you for registering <strong>${esc(input.companyName)}</strong> with the TRIYARA Business Network.`,
      `Your reference is <strong>${esc(input.supplierCode)}</strong>. Please quote it in any correspondence.`,
      `Our sourcing team now reviews the details and documents you submitted. We will write again once that review is complete. Nothing further is needed from you in the meantime.`,
    ),
    footnote: 'Reviews normally complete within a few working days.',
  })
  return {
    subject: `Registration received — ${input.companyName} (${input.supplierCode})`,
    html,
    text: renderText([
      `Hello ${input.contactName},`,
      '',
      `Thank you for registering ${input.companyName} with the TRIYARA Business Network.`,
      `Your reference is ${input.supplierCode}. Please quote it in any correspondence.`,
      '',
      'Our sourcing team now reviews the details and documents you submitted.',
      'We will write again once that review is complete. Nothing further is needed from you in the meantime.',
    ]),
  }
}

// ---------------------------------------------------------------------------
// 2. Buyer registration confirmation
// ---------------------------------------------------------------------------

export function buyerRegistrationConfirmation(input: {
  contactName: string
  companyName: string
}): Rendered {
  const html = renderLayout({
    heading: 'We have your enquiry',
    bodyHtml: paras(
      `Hello ${esc(input.contactName)},`,
      `Thank you for registering <strong>${esc(input.companyName)}</strong> with the TRIYARA Business Network.`,
      `Our team is reviewing your requirement and will come back to you with sourcing options. If we need anything clarified, we will reply to this address.`,
    ),
  })
  return {
    subject: `Enquiry received — ${input.companyName}`,
    html,
    text: renderText([
      `Hello ${input.contactName},`,
      '',
      `Thank you for registering ${input.companyName} with the TRIYARA Business Network.`,
      '',
      'Our team is reviewing your requirement and will come back to you with sourcing options.',
      'If we need anything clarified, we will reply to this address.',
    ]),
  }
}

// ---------------------------------------------------------------------------
// 3. Staff notification - a new registration needs review
// ---------------------------------------------------------------------------

export function staffNewRegistration(input: {
  kind: 'supplier' | 'buyer'
  companyName: string
  country?: string
  reference?: string
  reviewUrl: string
}): Rendered {
  const noun = input.kind === 'supplier' ? 'supplier' : 'buyer'
  const details = [
    `Company: ${esc(input.companyName)}`,
    input.country ? `Country: ${esc(input.country)}` : undefined,
    input.reference ? `Reference: ${esc(input.reference)}` : undefined,
  ]
    .filter((d): d is string => d !== undefined)
    .join('<br>')

  const html = renderLayout({
    heading: `New ${noun} registration`,
    bodyHtml: paras(`A new ${noun} has registered and is waiting for review.`, details),
    cta: { label: 'Open the review queue', url: input.reviewUrl },
  })
  return {
    subject: `New ${noun} registration — ${input.companyName}`,
    html,
    text: renderText([
      `A new ${noun} has registered and is waiting for review.`,
      '',
      `Company: ${input.companyName}`,
      input.country ? `Country: ${input.country}` : undefined,
      input.reference ? `Reference: ${input.reference}` : undefined,
      '',
      `Review: ${input.reviewUrl}`,
    ]),
  }
}

// ---------------------------------------------------------------------------
// 4 & 6. Approved - supplier and buyer
// ---------------------------------------------------------------------------

export function registrationApproved(input: {
  kind: 'supplier' | 'buyer'
  contactName: string
  companyName: string
  comments?: string
}): Rendered {
  const next =
    input.kind === 'supplier'
      ? 'You are now part of our verified supplier network, and our sourcing team will contact you when a matching requirement comes in.'
      : 'Our team will be in touch with sourcing options for your requirement.'

  const html = renderLayout({
    heading: 'Your registration has been approved',
    bodyHtml: paras(
      `Hello ${esc(input.contactName)},`,
      `<strong>${esc(input.companyName)}</strong> has been approved on the TRIYARA Business Network.`,
      next,
      ...(input.comments ? [`Note from our team: ${esc(input.comments)}`] : []),
    ),
  })
  return {
    subject: `Approved — ${input.companyName}`,
    html,
    text: renderText([
      `Hello ${input.contactName},`,
      '',
      `${input.companyName} has been approved on the TRIYARA Business Network.`,
      '',
      next,
      ...(input.comments ? ['', `Note from our team: ${input.comments}`] : []),
    ]),
  }
}

// ---------------------------------------------------------------------------
// 5 & 7. Rejected - supplier and buyer
// ---------------------------------------------------------------------------

export function registrationRejected(input: {
  kind: 'supplier' | 'buyer'
  contactName: string
  companyName: string
  comments?: string
}): Rendered {
  // No false hope and no dead end: say it plainly, then give them a way back.
  const html = renderLayout({
    heading: 'We cannot take your registration forward',
    bodyHtml: paras(
      `Hello ${esc(input.contactName)},`,
      `After reviewing the details submitted for <strong>${esc(input.companyName)}</strong>, we are not able to take this registration forward at present.`,
      ...(input.comments ? [`Reason given by our team: ${esc(input.comments)}`] : []),
      `If you believe something was missing or incorrect, reply to this email and we will look again.`,
    ),
  })
  return {
    subject: `Registration update — ${input.companyName}`,
    html,
    text: renderText([
      `Hello ${input.contactName},`,
      '',
      `After reviewing the details submitted for ${input.companyName}, we are not able to take this registration forward at present.`,
      ...(input.comments ? ['', `Reason given by our team: ${input.comments}`] : []),
      '',
      'If you believe something was missing or incorrect, reply to this email and we will look again.',
    ]),
  }
}

// ---------------------------------------------------------------------------
// 8. Password reset
// ---------------------------------------------------------------------------

export function passwordReset(input: { resetUrl: string; expiresInMinutes: number }): Rendered {
  const html = renderLayout({
    heading: 'Reset your password',
    bodyHtml: paras(
      'Someone asked to reset the password for your TRIYARA Business Network account.',
      `This link works once and expires in ${input.expiresInMinutes} minutes.`,
    ),
    cta: { label: 'Choose a new password', url: input.resetUrl },
    footnote:
      'If you did not ask for this, no action is needed — your password has not changed. ' +
      `If the button does not work, paste this into your browser:<br>${esc(input.resetUrl)}`,
  })
  return {
    subject: 'Reset your TRIYARA password',
    html,
    text: renderText([
      'Someone asked to reset the password for your TRIYARA Business Network account.',
      '',
      `This link works once and expires in ${input.expiresInMinutes} minutes:`,
      input.resetUrl,
      '',
      'If you did not ask for this, no action is needed — your password has not changed.',
    ]),
  }
}

// ---------------------------------------------------------------------------
// 9. Staff invite
// ---------------------------------------------------------------------------

export function staffInvite(input: {
  inviterName: string
  inviteUrl: string
  expiresInHours: number
}): Rendered {
  const html = renderLayout({
    heading: 'You have been invited to TRIYARA',
    bodyHtml: paras(
      `${esc(input.inviterName)} has invited you to the TRIYARA Business Network.`,
      `Use the link below to set your password and sign in. It expires in ${input.expiresInHours} hours.`,
    ),
    cta: { label: 'Accept the invitation', url: input.inviteUrl },
  })
  return {
    subject: 'Your TRIYARA Business Network invitation',
    html,
    text: renderText([
      `${input.inviterName} has invited you to the TRIYARA Business Network.`,
      '',
      `Use this link to set your password and sign in. It expires in ${input.expiresInHours} hours:`,
      input.inviteUrl,
    ]),
  }
}

// ---------------------------------------------------------------------------
// Admin access requests (TRY-BNP-SUPERADMIN-01)
// ---------------------------------------------------------------------------

export function adminAccessRequested(input: {
  requesterName: string
  requesterEmail: string
  organizationName: string
  currentRole: string
  reason: string
  requestedAt: Date
  approveUrl: string
  rejectUrl: string
}): Rendered {
  const details = [
    `Name: ${esc(input.requesterName)}`,
    `Email: ${esc(input.requesterEmail)}`,
    `Organization: ${esc(input.organizationName)}`,
    `Current role: ${esc(input.currentRole)}`,
    `Requested: ${esc(input.requestedAt.toISOString().replace('T', ' ').slice(0, 16))} UTC`,
  ].join('<br>')

  const html = renderLayout({
    heading: 'Someone is asking for administrator access',
    bodyHtml: paras(
      details,
      `<strong>Their reason</strong><br>${esc(input.reason)}`,
      'Administrator access grants control of the whole platform. Both buttons open the request in the dashboard, where the decision is recorded.',
    ),
    cta: { label: 'Review and approve', url: input.approveUrl },
    footnote: `To decline instead, open <a href="${esc(input.rejectUrl)}">${esc(input.rejectUrl)}</a> — a reason is required.`,
  })
  return {
    subject: `Admin access requested — ${input.requesterName}`,
    html,
    text: renderText([
      'Someone is asking for administrator access.',
      '',
      `Name: ${input.requesterName}`,
      `Email: ${input.requesterEmail}`,
      `Organization: ${input.organizationName}`,
      `Current role: ${input.currentRole}`,
      `Requested: ${input.requestedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC`,
      '',
      'Their reason:',
      input.reason,
      '',
      `Approve: ${input.approveUrl}`,
      `Decline: ${input.rejectUrl}`,
    ]),
  }
}

export function adminAccessApproved(input: { requesterName: string }): Rendered {
  const html = renderLayout({
    heading: 'You now have administrator access',
    bodyHtml: paras(
      `Hello ${esc(input.requesterName)},`,
      'Your request for administrator access has been approved.',
      'Sign out and back in to pick up your new permissions.',
    ),
  })
  return {
    subject: 'Administrator access granted',
    html,
    text: renderText([
      `Hello ${input.requesterName},`,
      '',
      'Your request for administrator access has been approved.',
      'Sign out and back in to pick up your new permissions.',
    ]),
  }
}

export function adminAccessRejected(input: { requesterName: string; reason: string }): Rendered {
  const html = renderLayout({
    heading: 'Your administrator access request was declined',
    bodyHtml: paras(
      `Hello ${esc(input.requesterName)},`,
      'Your request for administrator access has not been approved.',
      `<strong>Reason</strong><br>${esc(input.reason)}`,
      'If circumstances change, you can ask again.',
    ),
  })
  return {
    subject: 'Administrator access request declined',
    html,
    text: renderText([
      `Hello ${input.requesterName},`,
      '',
      'Your request for administrator access has not been approved.',
      '',
      `Reason: ${input.reason}`,
      '',
      'If circumstances change, you can ask again.',
    ]),
  }
}

export function adminAccessRevoked(input: { requesterName: string; reason: string }): Rendered {
  const html = renderLayout({
    heading: 'Your administrator access has been withdrawn',
    bodyHtml: paras(
      `Hello ${esc(input.requesterName)},`,
      'Your administrator access on the TRIYARA Business Network has been withdrawn. Your account is unchanged and you can still sign in.',
      `<strong>Reason</strong><br>${esc(input.reason)}`,
      'If you believe this was a mistake, you can submit a new admin access request or contact your super administrator.',
    ),
  })
  return {
    subject: 'Administrator access withdrawn',
    html,
    text: renderText([
      `Hello ${input.requesterName},`,
      '',
      'Your administrator access on the TRIYARA Business Network has been withdrawn.',
      'Your account is unchanged and you can still sign in.',
      '',
      `Reason: ${input.reason}`,
      '',
      'If you believe this was a mistake, you can submit a new admin access request',
      'or contact your super administrator.',
    ]),
  }
}
