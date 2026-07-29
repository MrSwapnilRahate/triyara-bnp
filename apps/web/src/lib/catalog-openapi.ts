import { PRODUCT_STATUSES, SPEC_DATA_TYPES } from '@triyara/validation'

// OpenAPI 3.1 description of the Product Catalog API (TRY-BNP-CATALOG-S1).
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
}

const ifMatch = {
  name: 'If-Match',
  in: 'header',
  required: true,
  schema: { type: 'string', example: 'W/"v3"' },
  description:
    'Required for every mutation. Value is the ETag from the last read. A stale value returns 412.',
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

export const catalogOpenApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Triyara BNP - Product Catalog API',
    version: '1.0.0',
    description: [
      'Product Catalog master data (TRY-BNP-CATALOG-S1).',
      '',
      'Every response uses the platform envelope `{ success, data, meta, errors }`.',
      'Lists are cursor-paginated (keyset, never offset).',
      'Mutations require `If-Match` carrying the ETag from the last read; a stale',
      'value returns `412 Precondition Failed`, a missing one `428`.',
      '',
      'All reads and writes are scoped to the caller’s organization. Authorization',
      'uses the platform CASL `ReferenceData` subject: every role may read, only',
      'ADMIN may write.',
    ].join('\n'),
  },
  servers: [{ url: '/api/catalog', description: 'Product Catalog API' }],
  tags: [
    { name: 'Categories', description: 'Category hierarchy (unlimited nesting).' },
    { name: 'Products', description: 'Product master records.' },
    { name: 'Reference', description: 'Read-only catalog master data.' },
  ],
  security: [{ sessionCookie: [] }],
  paths: {
    '/categories': {
      get: {
        tags: ['Categories'],
        summary: 'List categories',
        description:
          'Ordered by materialised path, so the result reads as a depth-first tree. ' +
          'Use `pathPrefix` to fetch an entire subtree in one indexed query.',
        parameters: [
          ...listQuery,
          { name: 'parentId', in: 'query', schema: { type: 'string' } },
          {
            name: 'pathPrefix',
            in: 'query',
            schema: { type: 'string', example: '/spices' },
            description: 'Subtree filter, matched against the materialised path.',
          },
          { name: 'isActive', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Name search.' },
        ],
        responses: {
          '200': {
            description: 'Category page.',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/Category' },
                }),
              },
            },
          },
          ...errorResponses,
        },
      },
      post: {
        tags: ['Categories'],
        summary: 'Create a category',
        description: 'ADMIN only. Slug is derived from the name when omitted.',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CategoryCreate' } },
          },
        },
        responses: {
          '201': {
            description: 'Created. `ETag` carries the new version.',
            headers: { ETag: { schema: { type: 'string' }, description: 'e.g. W/"v1"' } },
            content: {
              'application/json': {
                schema: envelope({ $ref: '#/components/schemas/Category' }),
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/categories/{id}': {
      get: {
        tags: ['Categories'],
        summary: 'Get a category',
        parameters: [idParam],
        responses: {
          '200': {
            description: 'The category.',
            headers: { ETag: { schema: { type: 'string' } } },
            content: {
              'application/json': { schema: envelope({ $ref: '#/components/schemas/Category' }) },
            },
          },
          ...errorResponses,
        },
      },
      patch: {
        tags: ['Categories'],
        summary: 'Update a category',
        description:
          'ADMIN only. Moving or renaming rewrites the materialised path of the entire ' +
          'subtree in the same transaction. Moving a category beneath its own descendant ' +
          'is rejected.',
        parameters: [idParam, ifMatch],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CategoryUpdate' } },
          },
        },
        responses: {
          '200': {
            description: 'Updated.',
            headers: { ETag: { schema: { type: 'string' } } },
            content: {
              'application/json': { schema: envelope({ $ref: '#/components/schemas/Category' }) },
            },
          },
          ...errorResponses,
        },
      },
      delete: {
        tags: ['Categories'],
        summary: 'Soft-delete a category',
        description:
          'ADMIN only. Refused with 409 while the category still holds sub-categories ' +
          'or products.',
        parameters: [idParam, ifMatch],
        responses: {
          '200': {
            description: 'Soft-deleted; `deletedAt` is set.',
            content: {
              'application/json': { schema: envelope({ $ref: '#/components/schemas/Category' }) },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/products': {
      get: {
        tags: ['Products'],
        summary: 'List products',
        description:
          'Search runs across name, SKU, brand and short description, backed by trigram ' +
          'indexes. `categoryPathPrefix` filters by an entire category subtree.',
        parameters: [
          ...listQuery,
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'categoryId', in: 'query', schema: { type: 'string' } },
          { name: 'categoryPathPrefix', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: [...PRODUCT_STATUSES] } },
          { name: 'brand', in: 'query', schema: { type: 'string' } },
          {
            name: 'countryOfOrigin',
            in: 'query',
            schema: { type: 'string', minLength: 2, maxLength: 2 },
          },
          { name: 'hsCode', in: 'query', schema: { type: 'string' } },
          { name: 'tagId', in: 'query', schema: { type: 'string' } },
          { name: 'isActive', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
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
              enum: ['createdAt', '-createdAt', 'name', '-name', 'sku', '-sku'],
              default: '-createdAt',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Product page. List items omit `description` by design.',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/ProductListItem' },
                }),
              },
            },
          },
          ...errorResponses,
        },
      },
      post: {
        tags: ['Products'],
        summary: 'Create a product',
        description:
          'ADMIN only. A SKU belonging to a soft-deleted product returns 409 asking you to ' +
          'restore it - an SKU is a permanent identifier and is never reused.',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ProductCreate' } },
          },
        },
        responses: {
          '201': {
            description: 'Created.',
            headers: { ETag: { schema: { type: 'string' } } },
            content: {
              'application/json': { schema: envelope({ $ref: '#/components/schemas/Product' }) },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/products/{id}': {
      get: {
        tags: ['Products'],
        summary: 'Get a product',
        parameters: [
          idParam,
          {
            name: 'includeDeleted',
            in: 'query',
            schema: { type: 'string', enum: ['true', 'false'] },
          },
        ],
        responses: {
          '200': {
            description: 'The product, with specifications and tags.',
            headers: { ETag: { schema: { type: 'string' } } },
            content: {
              'application/json': { schema: envelope({ $ref: '#/components/schemas/Product' }) },
            },
          },
          ...errorResponses,
        },
      },
      patch: {
        tags: ['Products'],
        summary: 'Update a product',
        description:
          'ADMIN only. Supplying `specifications` or `tagIds` replaces those collections ' +
          'wholesale and is audited as a distinct action.',
        parameters: [idParam, ifMatch],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ProductUpdate' } },
          },
        },
        responses: {
          '200': {
            description: 'Updated.',
            headers: { ETag: { schema: { type: 'string' } } },
            content: {
              'application/json': { schema: envelope({ $ref: '#/components/schemas/Product' }) },
            },
          },
          ...errorResponses,
        },
      },
      delete: {
        tags: ['Products'],
        summary: 'Soft-delete a product',
        description: 'ADMIN only. The SKU stays reserved so the product can be restored.',
        parameters: [idParam, ifMatch],
        responses: {
          '200': {
            description: 'Soft-deleted.',
            content: {
              'application/json': { schema: envelope({ $ref: '#/components/schemas/Product' }) },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/specifications': {
      get: {
        tags: ['Reference'],
        summary: 'List specification definitions',
        parameters: [
          ...listQuery,
          { name: 'q', in: 'query', schema: { type: 'string' } },
          {
            name: 'isFilterable',
            in: 'query',
            schema: { type: 'string', enum: ['true', 'false'] },
          },
        ],
        responses: {
          '200': {
            description: 'Definition page.',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/SpecificationDefinition' },
                }),
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/tags': {
      get: {
        tags: ['Reference'],
        summary: 'List tags',
        parameters: [
          ...listQuery,
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'isActive', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
        ],
        responses: {
          '200': {
            description: 'Tag page.',
            content: {
              'application/json': {
                schema: envelope({ type: 'array', items: { $ref: '#/components/schemas/Tag' } }),
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
        description: 'Auth.js session cookie issued at sign-in.',
      },
    },
    schemas: {
      Meta: {
        type: 'object',
        properties: {
          requestId: { type: 'string' },
          pagination: {
            type: 'object',
            properties: {
              limit: { type: 'integer' },
              nextCursor: { type: ['string', 'null'] },
            },
          },
        },
      },
      Error: {
        type: 'object',
        required: ['success', 'data', 'meta', 'errors'],
        properties: {
          success: { type: 'boolean', const: false },
          data: { type: 'null' },
          meta: { $ref: '#/components/schemas/Meta' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string' },
                field: { type: 'string' },
              },
            },
          },
        },
      },
      Category: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          organizationId: { type: 'string' },
          parentId: { type: ['string', 'null'] },
          name: { type: 'string' },
          slug: { type: 'string' },
          description: { type: ['string', 'null'] },
          path: { type: 'string', example: '/spices/whole-spices' },
          depth: { type: 'integer' },
          sortOrder: { type: 'integer' },
          isActive: { type: 'boolean' },
          version: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          deletedAt: { type: ['string', 'null'], format: 'date-time' },
        },
      },
      CategoryCreate: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', maxLength: 200 },
          slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
          description: { type: 'string' },
          parentId: { type: 'string' },
          sortOrder: { type: 'integer', default: 0 },
          isActive: { type: 'boolean', default: true },
        },
      },
      CategoryUpdate: {
        allOf: [{ $ref: '#/components/schemas/CategoryCreate' }],
        description: 'All fields optional. `parentId: null` detaches the category to the root.',
      },
      SpecificationValue: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          definitionId: { type: 'string' },
          value: { type: 'string', description: 'Canonical value as entered.' },
          valueNumber: { type: ['string', 'null'], description: 'Typed projection for NUMBER.' },
          valueBoolean: { type: ['boolean', 'null'] },
          valueDate: { type: ['string', 'null'], format: 'date-time' },
        },
      },
      ProductListItem: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          sku: { type: 'string' },
          name: { type: 'string' },
          slug: { type: 'string' },
          shortDescription: { type: ['string', 'null'] },
          categoryId: { type: 'string' },
          countryOfOrigin: { type: ['string', 'null'] },
          brand: { type: ['string', 'null'] },
          hsCode: { type: ['string', 'null'] },
          status: { type: 'string', enum: [...PRODUCT_STATUSES] },
          isActive: { type: 'boolean' },
          version: { type: 'integer' },
          deletedAt: { type: ['string', 'null'], format: 'date-time' },
        },
      },
      Product: {
        allOf: [
          { $ref: '#/components/schemas/ProductListItem' },
          {
            type: 'object',
            properties: {
              description: { type: ['string', 'null'] },
              specifications: {
                type: 'array',
                items: { $ref: '#/components/schemas/SpecificationValue' },
              },
              tags: { type: 'array', items: { type: 'object' } },
            },
          },
        ],
      },
      ProductCreate: {
        type: 'object',
        required: ['sku', 'name', 'categoryId'],
        properties: {
          sku: { type: 'string', maxLength: 64 },
          name: { type: 'string', maxLength: 200 },
          slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
          shortDescription: { type: 'string' },
          description: { type: 'string' },
          categoryId: { type: 'string' },
          countryOfOrigin: { type: 'string', pattern: '^[A-Z]{2}$' },
          brand: { type: 'string' },
          hsCode: { type: 'string', pattern: '^\\d{6,12}$' },
          status: { type: 'string', enum: [...PRODUCT_STATUSES], default: 'DRAFT' },
          isActive: { type: 'boolean', default: true },
          specifications: {
            type: 'array',
            items: {
              type: 'object',
              required: ['definitionId', 'value'],
              properties: { definitionId: { type: 'string' }, value: { type: 'string' } },
            },
          },
          tagIds: { type: 'array', items: { type: 'string' } },
        },
      },
      ProductUpdate: {
        allOf: [{ $ref: '#/components/schemas/ProductCreate' }],
        description: 'All fields optional.',
      },
      SpecificationDefinition: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          slug: { type: 'string' },
          unit: { type: ['string', 'null'] },
          dataType: { type: 'string', enum: [...SPEC_DATA_TYPES] },
          allowedValues: { type: 'array', items: { type: 'string' } },
          isFilterable: { type: 'boolean' },
          isRequired: { type: 'boolean' },
          sortOrder: { type: 'integer' },
        },
      },
      Tag: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          slug: { type: 'string' },
          description: { type: ['string', 'null'] },
          color: { type: ['string', 'null'] },
          sortOrder: { type: 'integer' },
          isActive: { type: 'boolean' },
        },
      },
    },
    responses: {
      Unauthenticated: {
        description: 'No valid session.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      Forbidden: {
        description: 'Authenticated but not permitted (writes are ADMIN only).',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      NotFound: {
        description: 'Not found in the caller’s organization.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      Conflict: {
        description: 'Duplicate SKU or slug, or a delete blocked by dependent rows.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      PreconditionFailed: {
        description: 'Stale `If-Match`; the row changed since your last read.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      PreconditionRequired: {
        description: 'Missing or malformed `If-Match` header.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      ValidationError: {
        description: 'Request body or query failed schema validation.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      RateLimited: {
        description: 'Write rate limit exceeded.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
  },
} as const
