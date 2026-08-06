import { ACTIONS, SUBJECTS } from '@triyara/auth'
import { ADMIN_USER_SORTS, ASSIGNABLE_ROLES, USER_STATUSES } from '@triyara/validation'

// OpenAPI 3.1 description of the Administration REST API (TRY-BNP-ADMIN-02).
// Enum members are imported from @triyara/validation rather than restated, so
// the document cannot drift from the schemas the routes actually enforce.

const envelope = (dataSchema: Record<string, unknown>) => ({
  type: 'object',
  required: ['success', 'data', 'meta', 'errors'],
  properties: {
    success: { type: 'boolean', const: true },
    data: dataSchema,
    meta: { $ref: '#/components/schemas/Meta' },
    errors: { type: 'null' },
  },
})

const errorEnvelope = {
  type: 'object',
  required: ['success', 'data', 'meta', 'errors'],
  properties: {
    success: { type: 'boolean', const: false },
    data: { type: 'null' },
    meta: { $ref: '#/components/schemas/Meta' },
    errors: { type: 'array', items: { $ref: '#/components/schemas/Error' } },
  },
}

const userIdParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description: 'User id. A user in another organization is reported as 404, never 403.',
}

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorEnvelope } },
})

export const adminOpenApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Triyara BNP - Administration API',
    version: '1.0.0',
    description: [
      'Administering the people in a tenant (TRY-BNP-ADMIN-02).',
      '',
      'Every response uses the platform envelope `{ success, data, meta, errors }`.',
      'Lists are cursor-paginated (keyset, never offset): pass',
      '`meta.pagination.nextCursor` back as `cursor`. A null `nextCursor` means the',
      'last page. There is no total count, because counting a growing table on every',
      'page is the cost this pagination exists to avoid.',
      '',
      'Every request is scoped to the caller’s organization. The organization is',
      'taken from the session and is never a parameter, so no combination of query',
      'values can widen a response beyond the caller’s own tenant.',
      '',
      'Authorization uses the `User` CASL subject and requires `manage User`.',
      'ADMIN holds `manage all`; every other role holds only `read all`. So this',
      'API is ADMIN-only, and a non-admin receives 403 rather than a filtered list.',
      '',
      'This API does not replace `GET /api/v1/users`, which is unchanged: that is a',
      'narrow directory lookup behind global search - active users only, four',
      'fields, no paging - and is open to any signed-in role. This one is the',
      'administrator’s view and returns status, roles and last sign-in.',
      '',
      'Passwords and UI preferences are never returned by any endpoint here.',
      'Administering someone is not a reason to read their credentials.',
    ].join('\n'),
  },
  servers: [{ url: '/api/v1', description: 'Administration API' }],
  security: [{ sessionCookie: [] }],
  tags: [
    { name: 'Users', description: 'The people in the caller’s organization.' },
    { name: 'Roles', description: 'Base role membership - what a person may do.' },
    { name: 'Reference', description: 'The authorization vocabulary itself.' },
  ],
  paths: {
    '/admin/users': {
      get: {
        tags: ['Users'],
        summary: 'List users',
        description: [
          'Cursor-paginated list of every user in the caller’s organization,',
          'whatever their status. Requires ADMIN.',
          '',
          'Filters combine with AND: `?status=ACTIVE&role=VERIFIER` returns active',
          'verifiers. `role` matches users holding that role, filtered in the',
          'database rather than after the page is cut, so a page is never short.',
        ].join('\n'),
        parameters: [
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
            description: 'Page size. Values outside the range are rejected with 422.',
          },
          {
            name: 'cursor',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description:
              'Opaque cursor from `meta.pagination.nextCursor`. Keyset, never offset. Encodes the id of the last row of the previous page; do not construct one by hand.',
          },
          {
            name: 'q',
            in: 'query',
            required: false,
            schema: { type: 'string', maxLength: 120 },
            description: 'Free-text search over name and email, case-insensitive substring match.',
          },
          {
            name: 'status',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: USER_STATUSES },
            description: 'Exact account status.',
          },
          {
            name: 'role',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ASSIGNABLE_ROLES },
            description: 'Users holding this role. A user with several roles matches any of them.',
          },
          {
            name: 'sort',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ADMIN_USER_SORTS, default: '-createdAt' },
            description: [
              'Sort column; a `-` prefix means descending. `id` always tiebreaks in',
              'the same direction, so rows sharing a name or creation instant cannot',
              'repeat or vanish across a page boundary.',
              '',
              '`lastLoginAt` is deliberately not sortable: it is nullable, and keyset',
              'pagination over a nullable column drops or repeats the NULL rows',
              'depending on where the database places them.',
            ].join('\n'),
          },
        ],
        responses: {
          '200': {
            description: 'A page of users.',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/AdminUserListItem' },
                }),
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthenticated' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '422': { $ref: '#/components/responses/ValidationError' },
        },
      },
    },
    '/admin/users/{id}/roles': {
      get: {
        tags: ['Roles'],
        summary: 'List a user’s base roles',
        description: [
          'The roles the session is built from and CASL derives ability from.',
          'Requires ADMIN (`manage User`).',
          '',
          'Distinct from `/auth/role-assignments`, which grants a role on a single',
          'resource. This endpoint changes what a person may do outright.',
        ].join('\n'),
        parameters: [userIdParam],
        responses: {
          '200': {
            description: 'The roles this user holds, alphabetically.',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/BaseRole' },
                }),
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthenticated' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      post: {
        tags: ['Roles'],
        summary: 'Grant a base role',
        description: [
          'Requires ADMIN (`manage User`). Audited as `user.role_assigned`.',
          '',
          'No `If-Match`: a membership is a set element with a composite primary',
          'key, not a versioned document. Granting a role the user already holds',
          'is refused by that key with 409.',
        ].join('\n'),
        parameters: [userIdParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['role'],
                properties: { role: { type: 'string', enum: ASSIGNABLE_ROLES } },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'The user’s roles after the grant.',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/BaseRole' },
                }),
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthenticated' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { $ref: '#/components/responses/Conflict' },
          '422': { $ref: '#/components/responses/ValidationError' },
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/admin/users/{id}/roles/{role}': {
      delete: {
        tags: ['Roles'],
        summary: 'Revoke a base role',
        description: [
          'Requires ADMIN (`manage User`). Audited as `user.role_revoked`.',
          '',
          'Two refusals, both 409. An administrator may not remove their own',
          'administrator role - locking yourself out should take a second person.',
          'And an organization may not lose its last administrator; that guard is',
          'a row lock taken inside the transaction, so two simultaneous',
          'revocations serialize instead of both seeing another admin remain.',
        ].join('\n'),
        parameters: [
          userIdParam,
          {
            name: 'role',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ASSIGNABLE_ROLES },
            description: 'The role to remove. An unknown name is 422, not a no-op.',
          },
        ],
        responses: {
          '200': {
            description: 'The user’s roles after the revocation.',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/BaseRole' },
                }),
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthenticated' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { $ref: '#/components/responses/Conflict' },
          '422': { $ref: '#/components/responses/ValidationError' },
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/auth/permission-matrix': {
      get: {
        tags: ['Reference'],
        summary: 'What every role may do',
        description: [
          'Derived from `buildAbilityFor` at read time - the same function the',
          'guards call - so it cannot describe a permission the platform would',
          'refuse or omit one it would allow. Nothing is stored.',
          '',
          '`actions` and `subjects` are returned alongside the rows so a client can',
          'draw the axes of the table without keeping its own copy of either.',
          '',
          'Authentication only. The body is the published rule book: identical for',
          'every caller and carrying no tenant data.',
        ].join('\n'),
        responses: {
          '200': {
            description: 'The full role/permission matrix.',
            content: {
              'application/json': {
                schema: envelope({ $ref: '#/components/schemas/RoleMatrix' }),
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthenticated' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'authjs.session-token',
        description: 'Auth.js session cookie. Every endpoint requires an authenticated session.',
      },
    },
    schemas: {
      Meta: {
        type: 'object',
        required: ['requestId'],
        properties: {
          requestId: {
            type: 'string',
            description: 'Echoes `x-request-id` when supplied, otherwise generated.',
          },
          pagination: {
            type: 'object',
            properties: {
              limit: { type: 'integer' },
              nextCursor: {
                type: ['string', 'null'],
                description: 'Pass back as `cursor`. Null on the last page.',
              },
            },
          },
          filters: {
            type: 'object',
            description: 'Echoes the filters that were applied, so a client can render them.',
            properties: {
              q: { type: ['string', 'null'] },
              status: { type: ['string', 'null'], enum: [...USER_STATUSES, null] },
              role: { type: ['string', 'null'], enum: [...ASSIGNABLE_ROLES, null] },
            },
          },
          sort: { type: 'string', enum: ADMIN_USER_SORTS },
        },
        additionalProperties: true,
      },
      Error: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          field: { type: 'string' },
        },
      },
      BaseRole: {
        type: 'object',
        required: ['roleId', 'name'],
        properties: {
          roleId: { type: 'string' },
          name: { type: 'string', enum: ASSIGNABLE_ROLES },
          description: { type: ['string', 'null'] },
        },
      },
      RoleMatrix: {
        type: 'object',
        required: ['actions', 'subjects', 'roles'],
        properties: {
          actions: {
            type: 'array',
            items: { type: 'string', enum: ACTIONS },
            description: 'Every action in the vocabulary - the columns of the table.',
          },
          subjects: {
            type: 'array',
            items: { type: 'string', enum: SUBJECTS },
            description: 'Every subject in the vocabulary - the rows of the table.',
          },
          roles: {
            type: 'array',
            items: {
              type: 'object',
              required: ['role', 'permissions'],
              properties: {
                role: { type: 'string', enum: ASSIGNABLE_ROLES },
                permissions: {
                  type: 'object',
                  description:
                    'subject -> permitted actions. A subject the role cannot touch at all is absent.',
                  additionalProperties: { type: 'array', items: { type: 'string', enum: ACTIONS } },
                },
              },
            },
          },
        },
      },
      AdminUserListItem: {
        type: 'object',
        required: ['id', 'name', 'email', 'status', 'roles', 'createdAt'],
        properties: {
          id: { type: 'string', description: 'cuid.' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          avatarUrl: { type: ['string', 'null'], format: 'uri' },
          status: { type: 'string', enum: USER_STATUSES },
          roles: {
            type: 'array',
            items: { type: 'string', enum: ASSIGNABLE_ROLES },
            description: 'Every role the user holds. Empty for a user with none.',
          },
          lastLoginAt: {
            type: ['string', 'null'],
            format: 'date-time',
            description: 'Null for a user who has never signed in.',
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
    responses: {
      Unauthenticated: errorResponse('No valid session.'),
      Forbidden: errorResponse('Authenticated but lacking `manage User`, i.e. not an ADMIN.'),
      NotFound: errorResponse('No such user in the caller’s organization, or no such role.'),
      Conflict: errorResponse(
        'The user already holds that role, or the revocation would remove the caller’s own administrator role or the organization’s last one.',
      ),
      ValidationError: errorResponse('Request failed schema validation.'),
      RateLimited: errorResponse('Write rate limit exceeded.'),
    },
  },
} as const
