'use client'

import { createDraftStore } from '@/lib/registration-draft'

import type { BuyerDraft } from './types'

// The buyer form's draft, on the same shared store as the supplier one. A
// separate key: someone may well be both a buyer and a supplier to us, and one
// form must never resume into the other.
const store = createDraftStore<BuyerDraft>('triyara.buyer-registration.draft.v1')

export const loadDraft = store.load
export const saveDraft = store.save
export const clearDraft = store.clear
