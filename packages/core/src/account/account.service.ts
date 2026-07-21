import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  AccountListResult,
  AccountRecord,
  AccountRepository,
  ListAccountsParams,
  MutationCtx,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { ConflictError, NotFoundError } from '@triyara/lib'
import type {
  AssignOwnerDto,
  BulkAccountDto,
  ChangeStatusDto,
  CreateAccountDto,
  ListAccountsQuery,
  UpdateAccountDto,
} from '@triyara/validation'

export type AccountServiceCtx = AuthContext & { requestId?: string }

export interface AccountServiceDeps {
  repo: AccountRepository
  events: EventBus
}

function mutationCtx(ctx: AccountServiceCtx): MutationCtx {
  return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
}

export interface BulkResult {
  summary: { ok: number; failed: number }
  results: Array<{ id: string; status: 'ok' | 'error'; error?: string }>
}

export function createAccountService({ repo, events }: AccountServiceDeps) {
  async function emit(ctx: AccountServiceCtx, type: string, data: Record<string, unknown>) {
    await events.emit(
      makeEvent({ type, organizationId: ctx.organizationId, actorId: ctx.user.id, data }),
    )
  }

  return {
    async create(ctx: AccountServiceCtx, dto: CreateAccountDto): Promise<AccountRecord> {
      assertAbility(ctx, 'create', 'Account')
      const account = await repo.create(mutationCtx(ctx), {
        legalName: dto.legalName,
        displayName: dto.displayName,
        country: dto.country,
        relationshipStatus: dto.relationshipStatus,
        source: dto.source,
        ownerId: dto.ownerId,
      })
      await emit(ctx, 'account.created', { accountId: account.id })
      return account
    },

    async get(
      ctx: AccountServiceCtx,
      id: string,
      opts?: { includeDeleted?: boolean },
    ): Promise<AccountRecord> {
      assertAbility(ctx, 'read', 'Account')
      const account = await repo.findById(ctx.organizationId, id, opts)
      if (!account) throw new NotFoundError('Account not found.')
      return account
    },

    async list(ctx: AccountServiceCtx, query: ListAccountsQuery): Promise<AccountListResult> {
      assertAbility(ctx, 'read', 'Account')
      const params: ListAccountsParams = {
        limit: query.limit,
        cursor: query.cursor,
        sort: query.sort,
        q: query.q,
        country: query.country,
        relationshipStatus: query.relationshipStatus,
        ownerId: query.ownerId,
        createdFrom: query.createdFrom,
        createdTo: query.createdTo,
        includeDeleted: query.includeDeleted,
      }
      return repo.list(ctx.organizationId, params)
    },

    async update(
      ctx: AccountServiceCtx,
      id: string,
      dto: UpdateAccountDto,
      expectedVersion: number,
    ): Promise<AccountRecord> {
      assertAbility(ctx, 'update', 'Account')
      const account = await repo.mutate(
        mutationCtx(ctx),
        id,
        expectedVersion,
        dto,
        'account.updated',
      )
      await emit(ctx, 'account.updated', { accountId: id })
      return account
    },

    async remove(
      ctx: AccountServiceCtx,
      id: string,
      expectedVersion: number,
    ): Promise<AccountRecord> {
      assertAbility(ctx, 'delete', 'Account')
      const account = await repo.softDelete(mutationCtx(ctx), id, expectedVersion)
      await emit(ctx, 'account.deleted', { accountId: id })
      return account
    },

    async restore(
      ctx: AccountServiceCtx,
      id: string,
      expectedVersion: number,
    ): Promise<AccountRecord> {
      assertAbility(ctx, 'update', 'Account')
      const account = await repo.restore(mutationCtx(ctx), id, expectedVersion)
      await emit(ctx, 'account.restored', { accountId: id })
      return account
    },

    async assign(
      ctx: AccountServiceCtx,
      id: string,
      dto: AssignOwnerDto,
      expectedVersion: number,
    ): Promise<AccountRecord> {
      assertAbility(ctx, 'update', 'Account')
      const account = await repo.mutate(
        mutationCtx(ctx),
        id,
        expectedVersion,
        { ownerId: dto.ownerId },
        'account.assigned',
      )
      await emit(ctx, 'account.assigned', { accountId: id, ownerId: dto.ownerId })
      return account
    },

    async changeStatus(
      ctx: AccountServiceCtx,
      id: string,
      dto: ChangeStatusDto,
      expectedVersion: number,
    ): Promise<AccountRecord> {
      assertAbility(ctx, 'update', 'Account')
      const current = await repo.findById(ctx.organizationId, id)
      if (!current) throw new NotFoundError('Account not found.')
      // BLACKLISTED is terminal (TRY-BNP-DB-01 state machine).
      if (
        current.relationshipStatus === 'BLACKLISTED' &&
        dto.relationshipStatus !== 'BLACKLISTED'
      ) {
        throw new ConflictError('Blacklisted is a terminal status and cannot be changed.')
      }
      const account = await repo.mutate(
        mutationCtx(ctx),
        id,
        expectedVersion,
        { relationshipStatus: dto.relationshipStatus },
        'account.status_changed',
      )
      await emit(ctx, 'account.status_changed', {
        accountId: id,
        relationshipStatus: dto.relationshipStatus,
      })
      return account
    },

    async bulk(ctx: AccountServiceCtx, dto: BulkAccountDto): Promise<BulkResult> {
      assertAbility(ctx, 'update', 'Account')
      const results: BulkResult['results'] = []

      for (const id of dto.ids) {
        try {
          const current = await repo.findById(ctx.organizationId, id)
          if (!current) throw new NotFoundError('Account not found.')

          if (dto.action === 'assign_owner') {
            await repo.mutate(
              mutationCtx(ctx),
              id,
              current.version,
              { ownerId: dto.payload.ownerId },
              'account.assigned',
            )
            await emit(ctx, 'account.assigned', { accountId: id, ownerId: dto.payload.ownerId })
          } else {
            if (current.relationshipStatus === 'BLACKLISTED')
              throw new ConflictError('Blacklisted is terminal.')
            await repo.mutate(
              mutationCtx(ctx),
              id,
              current.version,
              { relationshipStatus: dto.payload.relationshipStatus },
              'account.status_changed',
            )
            await emit(ctx, 'account.status_changed', {
              accountId: id,
              relationshipStatus: dto.payload.relationshipStatus,
            })
          }
          results.push({ id, status: 'ok' })
        } catch (error) {
          results.push({
            id,
            status: 'error',
            error: error instanceof Error ? error.message : 'failed',
          })
        }
      }

      const ok = results.filter((r) => r.status === 'ok').length
      return { summary: { ok, failed: results.length - ok }, results }
    },
  }
}

export type AccountService = ReturnType<typeof createAccountService>
