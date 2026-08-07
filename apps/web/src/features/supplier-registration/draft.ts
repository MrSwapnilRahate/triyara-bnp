'use client'

import { createDraftStore } from '@/lib/registration-draft'

import type { RegistrationDraft } from './types'

// The supplier form's draft, on the shared store. The key is versioned so a
// change to the draft shape does not try to rehydrate an old one into a form
// that no longer matches it.
const store = createDraftStore<RegistrationDraft>('triyara.supplier-registration.draft.v1')

export const loadDraft = store.load
export const saveDraft = store.save
export const clearDraft = store.clear
