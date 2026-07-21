// Webhook-ready domain-event contract (TRY-BNP-API-01). No business events yet.
export interface DomainEvent<T = unknown> {
  readonly id: string
  readonly type: string
  readonly occurredAt: string
  readonly orgId: string
  readonly actor: { readonly type: 'user' | 'system'; readonly id: string | null }
  readonly data: T
}

export interface EventBus {
  emit<T>(event: DomainEvent<T>): Promise<void>
}
