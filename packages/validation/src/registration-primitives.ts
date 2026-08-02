import { z } from 'zod'

// Field primitives shared by the public registration forms (supplier and
// buyer). Neutral module rather than one importing the other: neither portal
// owns these, and a buyer schema reaching into a file named for suppliers would
// invite someone to change it for one side and break the other.
//
// Everything here exists because these forms are filled in by people with no
// account and no support channel. Two consequences run through all of it:
// blanks mean "not answered" rather than "answered badly", and every list is
// bounded because the endpoint is unauthenticated.

/** Trims, then treats an empty field as absent rather than as a bad value. */
export const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(max).optional(),
  )

/** Same, for a field that must be a full URL when it is given at all. */
export const optionalUrl = (max = 300) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().url('Must be a full URL, including https://').max(max).optional(),
  )

/** Same, for an email. */
export const optionalEmail = () =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().email('Must be a valid email address.').max(320).optional(),
  )

export const iso2 = z
  .string()
  .trim()
  .length(2)
  .regex(/^[A-Z]{2}$/, 'Must be an ISO 3166-1 alpha-2 code.')

/**
 * Bounded list of short free-text entries.
 *
 * Registrants paste comma-separated lists into these, so the cap is on both the
 * number of entries and the length of each: one without the other still lets a
 * single request carry an unbounded payload.
 */
export const shortList = (maxItems: number, maxLen = 120) =>
  z.array(z.string().trim().min(1).max(maxLen)).max(maxItems).default([])
