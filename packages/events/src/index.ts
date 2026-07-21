// Webhook-ready domain events (TRY-BNP-API-01). V1 exposes no webhooks; every state
// change is emitted on this in-process bus, which later subscribers (Activity
// persistence, Inngest, webhooks) attach to without re-instrumentation.
export interface DomainEvent<T = unknown> {
  readonly id: string
  readonly type: string
  readonly occurredAt: string
  readonly organizationId: string
  readonly actor: { readonly type: 'user' | 'system'; readonly id: string | null }
  readonly data: T
}

export interface EventBus {
  emit<T>(event: DomainEvent<T>): Promise<void>
}

export interface EventInput<T> {
  type: string
  organizationId: string
  actorId: string | null
  data: T
}

export function makeEvent<T>(input: EventInput<T>): DomainEvent<T> {
  return {
    id: `evt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`,
    type: input.type,
    occurredAt: new Date().toISOString(),
    organizationId: input.organizationId,
    actor: { type: input.actorId ? 'user' : 'system', id: input.actorId },
    data: input.data,
  }
}

export interface EventLogger {
  info(obj: Record<string, unknown>, msg: string): void
}

// Default V1 bus: structured-logs each event. Swap/extend with real subscribers later.
export function createLoggingEventBus(logger: EventLogger): EventBus {
  return {
    emit(event) {
      logger.info(
        { event: event.type, id: event.id, organizationId: event.organizationId, data: event.data },
        'domain.event',
      )
      return Promise.resolve()
    },
  }
}
