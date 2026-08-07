export type AdminAccessRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface AdminAccessRequest {
  id: string
  organizationId: string
  userId: string
  requesterName: string
  requesterEmail: string
  currentRole: string
  reason: string
  status: AdminAccessRequestStatus
  decidedById: string | null
  decidedAt: string | null
  decisionReason: string | null
  version: number
  createdAt: string
  updatedAt: string
}
