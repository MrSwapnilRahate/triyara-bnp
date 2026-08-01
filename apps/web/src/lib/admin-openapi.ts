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
  tags: [{ name: 'Users', description: 'The people in the caller’s organization.' }],
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
      ValidationError: errorResponse('Request failed schema validation.'),
    },
  },
} as const
