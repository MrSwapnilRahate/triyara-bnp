'use client'

import { useMutation } from '@tanstack/react-query'
import type { BuyerRegistrationInput } from '@triyara/validation'

import { api } from '@/lib/api-client'
import { type UploadResult, uploadViaPresign } from '@/lib/registration-upload'

const BASE = '/api/public/buyer-registration'

/** The buyer form's upload, on the shared two-step pipeline. */
export function uploadBuyerFile(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  return uploadViaPresign(`${BASE}/presign`, file, onProgress)
}

export function useSubmitBuyerRegistration() {
  return useMutation({
    mutationFn: async (payload: BuyerRegistrationInput) => {
      const result = await api.post<{ submitted: boolean; companyName: string }>(BASE, payload)
      return result.data
    },
  })
}
