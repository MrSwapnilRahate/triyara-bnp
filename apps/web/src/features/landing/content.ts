/**
 * Every word on the public landing page, in one place.
 *
 * Copy lives here rather than inline in the sections so that changing what the
 * business says does not mean touching layout, and so a claim that stops being
 * true can be found by reading one file. Nothing here is filler.
 */

export const COMPANY = {
  legalName: 'Triyara Exports LLP',
  productName: 'TRIYARA Business Network',
} as const

/**
 * Contact details.
 *
 * Only the address derived from the company's own domain is set. `whatsapp` and
 * `location` are deliberately null rather than invented: a fabricated number on
 * a public page sends suppliers to a stranger. The sections below render only
 * what is present, so filling these in is a one-line change with no layout work.
 */
export const CONTACT: {
  email: string
  whatsapp: string | null
  whatsappDisplay: string | null
  location: string | null
} = {
  email: 'contact@triyaraexports.com',
  whatsapp: null,
  whatsappDisplay: null,
  location: null,
}

export const HERO = {
  eyebrow: 'Verified sourcing for global trade',
  headline: 'Indian suppliers, verified. Buyers, matched.',
  body: 'TRIYARA verifies export-ready Indian suppliers and connects them with buyers who need what they make. Register once — we handle the checks, the shortlisting and the paperwork.',
  supplierCta: 'Register as Supplier',
  buyerCta: 'Register as Buyer',
  note: 'Registration takes about two minutes. No account or password needed.',
} as const

export const SUPPLIER_JOURNEY = [
  {
    title: 'Register',
    body: 'Tell us what you make, where you ship, and upload your certificates.',
  },
  {
    title: 'Verification',
    body: 'Our team checks your documents, certifications and export readiness.',
  },
  {
    title: 'Become a verified supplier',
    body: 'You enter the verified network buyers are matched against.',
  },
  {
    title: 'Receive RFQs',
    body: 'When a buyer requirement matches what you make, we invite you to quote.',
  },
  { title: 'Get business', body: 'Win the order and ship. We stay involved through export.' },
] as const

export const BUYER_JOURNEY = [
  { title: 'Register', body: 'Tell us your company, destination markets and what you import.' },
  {
    title: 'Submit your requirement',
    body: 'Product, volume, specifications, certifications and delivery terms.',
  },
  {
    title: 'TRIYARA shortlists suppliers',
    body: 'We match your requirement against verified suppliers and shortlist the strongest.',
  },
  {
    title: 'Receive quotations',
    body: 'Compare landed cost, lead time and certifications side by side.',
  },
  { title: 'Select your supplier', body: 'Choose, and we coordinate the order through to export.' },
] as const

export const WHY = [
  {
    title: 'Verified suppliers',
    body: 'Every supplier is reviewed by our team before entering the network. Documents are checked, not just collected.',
  },
  {
    title: 'Verified buyers',
    body: 'Buyers are reviewed too. Suppliers quote against real requirements from real companies.',
  },
  {
    title: 'Faster sourcing',
    body: 'A shortlist of matching verified suppliers, filtered by product, certification, capacity and destination.',
  },
  {
    title: 'Quality verification',
    body: 'Certifications are recorded with expiry dates and re-checked, so an expired certificate does not pass as current.',
  },
  {
    title: 'Export documentation',
    body: 'Certificates, compliance papers and shipping documents are held against each supplier and order.',
  },
  {
    title: 'Global network',
    body: 'Indian manufacturing matched to buyers across the Gulf, Europe, Africa and South-East Asia.',
  },
] as const

export const SUPPLIER_FAQ = [
  {
    q: 'What does it cost to register?',
    a: 'Registering as a supplier is free. We earn on the trade we help you win, not on listing you.',
  },
  {
    q: 'What documents do I need?',
    a: 'Your company registration and any export or quality certifications you hold — IEC, FSSAI, ISO, HACCP, APEDA, organic and similar. You can register without them and add them during verification.',
  },
  {
    q: 'How long does verification take?',
    a: 'Usually a few working days. We review your documents and may come back with questions before confirming.',
  },
  {
    q: 'What happens after I am verified?',
    a: 'You enter the verified network. When a buyer requirement matches what you make, we invite you to quote on it.',
  },
  {
    q: 'Do I need a login?',
    a: 'Not to register. Our team contacts you directly, and quotations are handled with you by email and WhatsApp.',
  },
] as const

export const BUYER_FAQ = [
  {
    q: 'What does it cost?',
    a: 'Registering and submitting a requirement is free. You pay for goods, not for access.',
  },
  {
    q: 'How are suppliers checked?',
    a: 'Our team reviews company documents and certifications before a supplier can be quoted to you. Certifications carry expiry dates and are re-checked.',
  },
  {
    q: 'How quickly will I hear back?',
    a: 'We come back with a shortlist and indicative options once we have reviewed your requirement, normally within a few working days.',
  },
  {
    q: 'Can I ask for a specific certification?',
    a: 'Yes. Tell us what you need — FSSAI, ISO, HACCP, organic, halal, kosher and others — and we shortlist only suppliers holding it.',
  },
  {
    q: 'Do you handle shipping and documentation?',
    a: 'Yes. We coordinate export documentation and shipping alongside the supplier through to delivery.',
  },
] as const
