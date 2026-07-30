import {
  CERTIFICATION_TYPES,
  INCOTERMS,
  SUPPLIER_BUSINESS_TYPES,
  SUPPLIER_STATUSES,
} from '@triyara/validation'

// OpenAPI 3.1 description of the Supplier REST API (TRY-BNP-SUPPLIER-API).
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

const listQuery = [
  {
    name: 'limit',
    in: 'query',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
    description: 'Page size.',
  },
  {
    name: 'cursor',
    in: 'query',
    schema: { type: 'string' },
    description: 'Opaque cursor from `meta.pagination.nextCursor`. Keyset, never offset.',
  },
]

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description: 'Supplier id.',
}

const ifMatch = {
  name: 'If-Match',
  in: 'header',
  required: true,
  schema: { type: 'string', example: 'W/"v3"' },
  description:
    'Required for every mutation. Value is the ETag from the last read. A stale value returns 412; omitting it returns 428.',
}

const errorResponses = {
  '401': { $ref: '#/components/responses/Unauthenticated' },
  '403': { $ref: '#/components/responses/Forbidden' },
  '404': { $ref: '#/components/responses/NotFound' },
  '409': { $ref: '#/components/responses/Conflict' },
  '412': { $ref: '#/components/responses/PreconditionFailed' },
  '422': { $ref: '#/components/responses/ValidationError' },
  '428': { $ref: '#/components/responses/PreconditionRequired' },
  '429': { $ref: '#/components/responses/RateLimited' },
}

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

export const supplierOpenApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Triyara BNP - Supplier API',
    version: '1.0.0',
    description: [
      'Supplier master data for sourcing (TRY-BNP-SUPPLIER-API).',
      '',
      'Every response uses the platform envelope `{ success, data, meta, errors }`.',
      'Lists are cursor-paginated (keyset, never offset).',
      'Mutations require `If-Match` carrying the ETag from the last read; a stale',
      'value returns 412 and a missing one returns 428.',
      '',
      'Every request is scoped to the caller’s organization. A supplier belonging',
      'to another tenant is reported as 404, never 403, so the API does not confirm',
      'the existence of records the caller may not see.',
      '',
      'Authorization uses the `SupplierProfile` CASL subject: read is open to every',
      'role, create/update/delete require ADMIN or EXPORT_MANAGER.',
      '',
      'Bank account numbers are never returned by any endpoint.',
    ].join('\n'),
  },
  servers: [{ url: '/api/suppliers', description: 'Supplier API' }],
  security: [{ sessionCookie: [] }],
  tags: [
    { name: 'Suppliers', description: 'Supplier master records.' },
    { name: 'Offerings', description: 'Products a supplier offers.' },
    { name: 'Reference', description: 'Filter vocabularies and search.' },
  ],
  paths: {
    '/': {
      get: {
        tags: ['Suppliers'],
        summary: 'List suppliers',
        description:
          'Cursor-paginated. `q` searches company name, legal name, supplier code and city.',
        parameters: [
          ...listQuery,
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Free-text search.' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: SUPPLIER_STATUSES } },
          {
            name: 'businessType',
            in: 'query',
            schema: { type: 'string', enum: SUPPLIER_BUSINESS_TYPES },
          },
          {
            name: 'country',
            in: 'query',
            schema: { type: 'string', minLength: 2, maxLength: 2 },
            description: 'ISO 3166-1 alpha-2. See `GET /countries` for the values in use.',
          },
          { name: 'city', in: 'query', schema: { type: 'string' } },
          { name: 'isVerified', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
          {
            name: 'productId',
            in: 'query',
            schema: { type: 'string' },
            description: 'Suppliers offering this catalog product - the sourcing question.',
          },
          { name: 'tagId', in: 'query', schema: { type: 'string' } },
          { name: 'gstNumber', in: 'query', schema: { type: 'string' } },
          { name: 'iecNumber', in: 'query', schema: { type: 'string' } },
          { name: 'panNumber', in: 'query', schema: { type: 'string' } },
          {
            name: 'includeDeleted',
            in: 'query',
            schema: { type: 'string', enum: ['true', 'false'] },
          },
          {
            name: 'sort',
            in: 'query',
            schema: {
              type: 'string',
              enum: [
                'createdAt',
                '-createdAt',
                'companyName',
                '-companyName',
                'supplierCode',
                '-supplierCode',
              ],
              default: '-createdAt',
            },
          },
        ],
        responses: {
          '200': {
            description: 'A page of suppliers.',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/SupplierListItem' },
                }),
              },
            },
          },
          ...errorResponses,
        },
      },
      post: {
        tags: ['Suppliers'],
        summary: 'Onboard a supplier',
        description:
          'Creates the record in DRAFT and opens its approval history. Requires ADMIN or EXPORT_MANAGER.',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateSupplier' } },
          },
        },
        responses: {
          '201': {
            description: 'Created. `ETag` carries the version for the next write.',
            headers: { ETag: { schema: { type: 'string', example: 'W/"v1"' } } },
            content: {
              'application/json': {
                schema: envelope({ $ref: '#/components/schemas/Supplier' }),
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/{id}': {
      get: {
        tags: ['Suppliers'],
        summary: 'Read a supplier',
        parameters: [idParam],
        responses: {
          '200': {
            description: 'The supplier, with contacts, addresses, certifications and tags.',
            headers: { ETag: { schema: { type: 'string', example: 'W/"v3"' } } },
            content: {
              'application/json': { schema: envelope({ $ref: '#/components/schemas/Supplier' }) },
            },
          },
          ...errorResponses,
        },
      },
      patch: {
        tags: ['Suppliers'],
        summary: 'Update a supplier',
        parameters: [idParam, ifMatch],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/UpdateSupplier' } },
          },
        },
        responses: {
          '200': {
            description: 'Updated.',
            headers: { ETag: { schema: { type: 'string' } } },
            content: {
              'application/json': { schema: envelope({ $ref: '#/components/schemas/Supplier' }) },
            },
          },
          ...errorResponses,
        },
      },
      delete: {
        tags: ['Suppliers'],
        summary: 'Soft-delete a supplier',
        description:
          'The row is retained and the supplier code stays reserved; restore rather than recreate.',
        parameters: [idParam, ifMatch],
        responses: {
          '200': {
            description: 'Deleted. `deletedAt` is set.',
            content: {
              'application/json': { schema: envelope({ $ref: '#/components/schemas/Supplier' }) },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/{id}/products': {
      get: {
        tags: ['Offerings'],
        summary: 'List a supplier’s product offerings',
        parameters: [
          idParam,
          ...listQuery,
          { name: 'productId', in: 'query', schema: { type: 'string' } },
          {
            name: 'status',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['PENDING_APPROVAL', 'ACTIVE', 'INACTIVE', 'DISCONTINUED'],
            },
          },
          { name: 'isPreferred', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
        ],
        responses: {
          '200': {
            description: 'A page of offerings.',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/Offering' },
                }),
              },
            },
          },
          ...errorResponses,
        },
      },
      post: {
        tags: ['Offerings'],
        summary: 'Add a product offering',
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateOffering' } },
          },
        },
        responses: {
          '201': {
            description: 'Created.',
            headers: { ETag: { schema: { type: 'string', example: 'W/"v1"' } } },
            content: {
              'application/json': { schema: envelope({ $ref: '#/components/schemas/Offering' }) },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/search': {
      get: {
        tags: ['Reference'],
        summary: 'Typeahead search',
        description:
          'Compact projection for a picker. Backed by the same query as the list, so a supplier findable in one is findable in the other. An exact supplier-code match is returned first. Never returns banking or contact data.',
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: true,
            schema: { type: 'string', minLength: 2, maxLength: 120 },
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 25, default: 10 },
          },
          { name: 'status', in: 'query', schema: { type: 'string', enum: SUPPLIER_STATUSES } },
          { name: 'productId', in: 'query', schema: { type: 'string' } },
          { name: 'country', in: 'query', schema: { type: 'string', minLength: 2, maxLength: 2 } },
        ],
        responses: {
          '200': {
            description: 'Matching suppliers, best match first. Not paginated.',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/SupplierSearchHit' },
                }),
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/countries': {
      get: {
        tags: ['Reference'],
        summary: 'Countries in use',
        description:
          'Filter vocabulary for `?country=`: the countries this tenant actually sources from, with a supplier count each.',
        parameters: [
          {
            name: 'includeDeleted',
            in: 'query',
            schema: { type: 'string', enum: ['true', 'false'] },
          },
        ],
        responses: {
          '200': {
            description: 'Countries, alphabetical.',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['country', 'suppliers'],
                    properties: {
                      country: { type: 'string', minLength: 2, maxLength: 2 },
                      suppliers: { type: 'integer' },
                    },
                  },
                }),
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/certifications': {
      get: {
        tags: ['Reference'],
        summary: 'Certification types held',
        description:
          'Certification types present in this tenant, with a total and how many are currently ACTIVE. `meta.vocabulary` carries the full enum so a filter UI can also offer the unheld types.',
        responses: {
          '200': {
            description: 'Certification facets.',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['type', 'total', 'active'],
                    properties: {
                      type: { type: 'string', enum: CERTIFICATION_TYPES },
                      total: { type: 'integer' },
                      active: { type: 'integer' },
                    },
                  },
                }),
              },
            },
          },
          ...errorResponses,
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
              nextCursor: { type: ['string', 'null'] },
            },
          },
          filters: { type: 'object', additionalProperties: true },
          sort: { type: 'string' },
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
      SupplierListItem: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          supplierCode: { type: 'string' },
          companyName: { type: 'string' },
          legalName: { type: 'string' },
          businessType: { type: 'string', enum: SUPPLIER_BUSINESS_TYPES },
          email: { type: ['string', 'null'] },
          phone: { type: ['string', 'null'] },
          country: { type: ['string', 'null'] },
          state: { type: ['string', 'null'] },
          city: { type: ['string', 'null'] },
          status: { type: 'string', enum: SUPPLIER_STATUSES },
          isVerified: { type: 'boolean' },
          verifiedAt: { type: ['string', 'null'], format: 'date-time' },
          accountId: { type: ['string', 'null'] },
          version: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          deletedAt: { type: ['string', 'null'], format: 'date-time' },
        },
      },
      Supplier: {
        allOf: [
          { $ref: '#/components/schemas/SupplierListItem' },
          {
            type: 'object',
            properties: {
              website: { type: ['string', 'null'] },
              gstNumber: { type: ['string', 'null'] },
              iecNumber: { type: ['string', 'null'] },
              panNumber: { type: ['string', 'null'] },
              contacts: { type: 'array', items: { type: 'object', additionalProperties: true } },
              addresses: { type: 'array', items: { type: 'object', additionalProperties: true } },
              bankAccounts: {
                type: 'array',
                description:
                  'Bank metadata only. `accountNumber` is never selected by the repository and therefore never leaves the server.',
                items: { type: 'object', additionalProperties: true },
              },
              certifications: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    type: { type: 'string', enum: CERTIFICATION_TYPES },
                    certificateNumber: { type: ['string', 'null'] },
                    issuedBy: { type: ['string', 'null'] },
                    issuedDate: { type: ['string', 'null'], format: 'date-time' },
                    expiryDate: { type: ['string', 'null'], format: 'date-time' },
                    status: { type: 'string' },
                    scope: { type: ['string', 'null'] },
                  },
                },
              },
              tags: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
          },
        ],
      },
      SupplierSearchHit: {
        type: 'object',
        required: ['id', 'supplierCode', 'companyName'],
        properties: {
          id: { type: 'string' },
          supplierCode: { type: 'string' },
          companyName: { type: 'string' },
          country: { type: ['string', 'null'] },
          city: { type: ['string', 'null'] },
          status: { type: 'string', enum: SUPPLIER_STATUSES },
          isVerified: { type: 'boolean' },
        },
      },
      CreateSupplier: {
        type: 'object',
        required: ['supplierCode', 'companyName', 'legalName', 'businessType'],
        properties: {
          supplierCode: { type: 'string', maxLength: 32 },
          companyName: { type: 'string', maxLength: 250 },
          legalName: { type: 'string', maxLength: 250 },
          businessType: { type: 'string', enum: SUPPLIER_BUSINESS_TYPES },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string' },
          website: { type: 'string', format: 'uri' },
          gstNumber: { type: 'string' },
          iecNumber: { type: 'string' },
          panNumber: { type: 'string' },
          country: { type: 'string', minLength: 2, maxLength: 2 },
          state: { type: 'string' },
          city: { type: 'string' },
          accountId: { type: 'string' },
        },
      },
      UpdateSupplier: {
        type: 'object',
        description: 'Every field optional; `supplierCode` cannot be changed.',
        properties: {
          companyName: { type: 'string' },
          legalName: { type: 'string' },
          businessType: { type: 'string', enum: SUPPLIER_BUSINESS_TYPES },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string' },
          website: { type: 'string', format: 'uri' },
          gstNumber: { type: 'string' },
          iecNumber: { type: 'string' },
          panNumber: { type: 'string' },
          country: { type: 'string', minLength: 2, maxLength: 2 },
          state: { type: 'string' },
          city: { type: 'string' },
          accountId: { type: 'string' },
        },
      },
      Offering: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          supplierId: { type: 'string' },
          productId: { type: 'string' },
          supplierSku: { type: ['string', 'null'] },
          moq: { type: ['string', 'null'] },
          moqUnit: { type: ['string', 'null'] },
          leadTimeDays: { type: ['integer', 'null'] },
          isPreferred: { type: 'boolean' },
          price: { type: ['string', 'null'] },
          currency: { type: ['string', 'null'] },
          incoterm: { type: ['string', 'null'], enum: [...INCOTERMS, null] },
          port: { type: ['string', 'null'] },
          validFrom: { type: ['string', 'null'], format: 'date-time' },
          validTo: { type: ['string', 'null'], format: 'date-time' },
          status: {
            type: 'string',
            enum: ['PENDING_APPROVAL', 'ACTIVE', 'INACTIVE', 'DISCONTINUED'],
          },
          version: { type: 'integer' },
        },
      },
      CreateOffering: {
        type: 'object',
        required: ['productId'],
        properties: {
          productId: { type: 'string' },
          supplierSku: { type: 'string', maxLength: 64 },
          moq: { type: 'number', minimum: 0 },
          moqUnit: { type: 'string', maxLength: 16 },
          leadTimeDays: { type: 'integer', minimum: 0, maximum: 3650 },
          isPreferred: { type: 'boolean', default: false },
          price: { type: 'number', minimum: 0, description: 'Requires `currency`.' },
          currency: { type: 'string', minLength: 3, maxLength: 3 },
          incoterm: { type: 'string', enum: INCOTERMS },
          port: { type: 'string', maxLength: 120 },
          validFrom: { type: 'string', format: 'date-time' },
          validTo: {
            type: 'string',
            format: 'date-time',
            description: 'Must fall after `validFrom`.',
          },
          status: {
            type: 'string',
            enum: ['PENDING_APPROVAL', 'ACTIVE', 'INACTIVE', 'DISCONTINUED'],
            default: 'ACTIVE',
          },
          notes: { type: 'string', maxLength: 1000 },
        },
      },
    },
    responses: {
      Unauthenticated: errorResponse('No valid session.'),
      Forbidden: errorResponse('Authenticated but not permitted by CASL.'),
      NotFound: errorResponse('No such record in the caller’s organization.'),
      Conflict: errorResponse('Duplicate supplier code, GST, IEC, PAN, or an illegal transition.'),
      PreconditionFailed: errorResponse('`If-Match` did not match the current version.'),
      ValidationError: errorResponse('Request failed schema validation.'),
      PreconditionRequired: errorResponse('`If-Match` was absent on a mutation.'),
      RateLimited: errorResponse('Write rate limit exceeded.'),
    },
  },
} as const
