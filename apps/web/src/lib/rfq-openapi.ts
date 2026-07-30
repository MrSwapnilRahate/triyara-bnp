import {
  RFQ_APPROVAL_STATUSES,
  RFQ_INCOTERMS,
  RFQ_PRIORITIES,
  RFQ_STATUSES,
  RFQ_SUPPLIER_STATUSES,
  RFQ_TYPES,
} from '@triyara/validation'

// OpenAPI 3.1 description of the RFQ REST API (TRY-BNP-RFQ-API).
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
  description: 'RFQ id.',
}

const ifMatch = {
  name: 'If-Match',
  in: 'header',
  required: true,
  schema: { type: 'string', example: 'W/"v3"' },
  description:
    'Required for every mutation, including workflow moves. Value is the ETag from the last read. A stale value returns 412; omitting it returns 428.',
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

/** The three workflow endpoints differ only in prose, so they share a builder. */
const workflow = (summary: string, description: string, from: string) => ({
  post: {
    tags: ['Workflow'],
    summary,
    description,
    parameters: [idParam, ifMatch],
    responses: {
      '200': {
        description: `Moved. Legal only from: ${from}.`,
        headers: { ETag: { schema: { type: 'string' } } },
        content: { 'application/json': { schema: envelope({ $ref: '#/components/schemas/Rfq' }) } },
      },
      ...errorResponses,
    },
  },
})

export const rfqOpenApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Triyara BNP - RFQ API',
    version: '1.0.0',
    description: [
      'Requests for Quotation and supplier bids (TRY-BNP-RFQ-API).',
      '',
      'Every response uses the platform envelope `{ success, data, meta, errors }`.',
      'Lists are cursor-paginated (keyset, never offset).',
      'Mutations require `If-Match` carrying the ETag from the last read; a stale',
      'value returns 412 and a missing one returns 428. Workflow moves are',
      'mutations and carry the same requirement.',
      '',
      'Every request is scoped to the caller’s organization. An RFQ belonging to',
      'another tenant is reported as 404, never 403, so the API does not confirm',
      'the existence of records the caller may not see.',
      '',
      'Authorization uses the `Account` CASL subject: read is open to every role,',
      'create/update/delete require ADMIN or EXPORT_MANAGER, and `manage` (ADMIN',
      'only) is required to reopen a stopped RFQ.',
      '',
      'The sourcing lifecycle is:',
      '  DRAFT -> PENDING_APPROVAL -> APPROVED -> ISSUED -> IN_PROGRESS ->',
      '  EVALUATING -> AWARDED -> CLOSED, with CANCELLED and EXPIRED as exits.',
      'Illegal moves return 409 naming the states that are legal from here.',
      '',
      'Reaching ISSUED has two prerequisites, both refused with 409 if unmet:',
      'the RFQ must be APPROVED, which is driven by POST /{id}/approvals one',
      'decision at a time (there is no jump from DRAFT straight to APPROVED),',
      'and it must have at least one invited supplier from POST /{id}/suppliers.',
      '',
      'Once ISSUED, commercial terms (currency, incoterm, deadline, destination',
      'port) are frozen: the RFQ is out with suppliers. Changing lines cuts a new',
      'revision rather than editing in place.',
    ].join('\n'),
  },
  servers: [{ url: '/api/rfqs', description: 'RFQ API' }],
  security: [{ sessionCookie: [] }],
  tags: [
    { name: 'RFQs', description: 'Request-for-quotation records.' },
    { name: 'Items', description: 'The lines an RFQ asks suppliers to quote.' },
    { name: 'Suppliers', description: 'Invited suppliers and their participation.' },
    { name: 'Responses', description: 'Supplier bids.' },
    { name: 'Workflow', description: 'Lifecycle transitions.' },
    { name: 'History', description: 'Approval decisions and line-item revisions.' },
  ],
  paths: {
    '/': {
      get: {
        tags: ['RFQs'],
        summary: 'List RFQs',
        description:
          'Cursor-paginated. `q` searches rfqNumber, title and description. `supplierId` finds RFQs a supplier was invited to; `productId` finds RFQs requesting a catalog product.',
        parameters: [
          ...listQuery,
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Free-text search.' },
          { name: 'type', in: 'query', schema: { type: 'string', enum: RFQ_TYPES } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: RFQ_STATUSES } },
          { name: 'priority', in: 'query', schema: { type: 'string', enum: RFQ_PRIORITIES } },
          { name: 'buyerId', in: 'query', schema: { type: 'string' } },
          {
            name: 'supplierId',
            in: 'query',
            schema: { type: 'string' },
            description: 'RFQs this supplier was invited to.',
          },
          {
            name: 'productId',
            in: 'query',
            schema: { type: 'string' },
            description: 'RFQs requesting this catalog product.',
          },
          {
            name: 'destinationCountry',
            in: 'query',
            schema: { type: 'string', minLength: 2, maxLength: 2 },
          },
          { name: 'destinationPort', in: 'query', schema: { type: 'string' } },
          {
            name: 'deadlineBefore',
            in: 'query',
            schema: { type: 'string', format: 'date-time' },
          },
          { name: 'deadlineAfter', in: 'query', schema: { type: 'string', format: 'date-time' } },
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
                'quotationDeadline',
                '-quotationDeadline',
                'rfqNumber',
                '-rfqNumber',
              ],
              default: '-createdAt',
            },
          },
        ],
        responses: {
          '200': {
            description: 'A page of RFQs.',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/RfqListItem' },
                }),
              },
            },
          },
          ...errorResponses,
        },
      },
      post: {
        tags: ['RFQs'],
        summary: 'Raise an RFQ',
        description:
          'Creates the RFQ **with its lines in one request**. A two-step create would leave an unusable record behind if the second call never arrived, and the service refuses to approve an RFQ with no lines. A BUYER RFQ requires `buyerId`; an INTERNAL one must not carry it.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateRfq' } } },
        },
        responses: {
          '201': {
            description: 'Created in DRAFT, with revision 1 and an opening approval row.',
            headers: { ETag: { schema: { type: 'string', example: 'W/"v1"' } } },
            content: {
              'application/json': { schema: envelope({ $ref: '#/components/schemas/Rfq' }) },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/{id}': {
      get: {
        tags: ['RFQs'],
        summary: 'Read an RFQ',
        parameters: [idParam],
        responses: {
          '200': {
            description: 'The RFQ, with its lines and invited suppliers.',
            headers: { ETag: { schema: { type: 'string', example: 'W/"v3"' } } },
            content: {
              'application/json': { schema: envelope({ $ref: '#/components/schemas/Rfq' }) },
            },
          },
          ...errorResponses,
        },
      },
      patch: {
        tags: ['RFQs'],
        summary: 'Update an RFQ',
        description:
          'Once the RFQ is ISSUED or beyond, changing currency, incoterm, quotationDeadline or destinationPort returns 409 — those terms are out with suppliers.',
        parameters: [idParam, ifMatch],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateRfq' } } },
        },
        responses: {
          '200': {
            description: 'Updated.',
            headers: { ETag: { schema: { type: 'string' } } },
            content: {
              'application/json': { schema: envelope({ $ref: '#/components/schemas/Rfq' }) },
            },
          },
          ...errorResponses,
        },
      },
      delete: {
        tags: ['RFQs'],
        summary: 'Soft-delete an RFQ',
        description:
          'The row is retained and the RFQ number stays reserved; restore, never recreate.',
        parameters: [idParam, ifMatch],
        responses: {
          '200': {
            description: 'Deleted. `deletedAt` is set.',
            content: {
              'application/json': { schema: envelope({ $ref: '#/components/schemas/Rfq' }) },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/{id}/items': {
      get: {
        tags: ['Items'],
        summary: 'List an RFQ’s lines',
        description: 'In line-number order. Not paginated: an RFQ carries at most 200 lines.',
        parameters: [idParam],
        responses: {
          '200': {
            description: 'The lines.',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/RfqItem' },
                }),
              },
            },
          },
          ...errorResponses,
        },
      },
      post: {
        tags: ['Items'],
        summary: 'Replace the line set',
        description:
          '**Replaces** every line and cuts a new revision — it is not an append. An RFQ’s lines are quoted as a set, so they version as a set. Requires `If-Match` because it mutates the RFQ.',
        parameters: [idParam, ifMatch],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ReplaceRfqItems' } },
          },
        },
        responses: {
          '201': {
            description: 'Replaced. `meta.revision` carries the new revision number.',
            headers: { ETag: { schema: { type: 'string' } } },
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/RfqItem' },
                }),
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/{id}/suppliers': {
      get: {
        tags: ['Suppliers'],
        summary: 'List invited suppliers',
        description:
          'Who was invited to bid, and where each one stands. `id` on a participation row is the `rfqSupplierId` a bid is submitted against.',
        parameters: [idParam],
        responses: {
          '200': {
            description: 'Invited suppliers with their participation state.',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/RfqParticipation' },
                }),
              },
            },
          },
          ...errorResponses,
        },
      },
      post: {
        tags: ['Suppliers'],
        summary: 'Invite suppliers to bid',
        description:
          'Idempotent per supplier: an already-invited supplier is skipped rather than duplicated, so this returns 200 rather than 201. Refused once the RFQ is AWARDED, CLOSED, CANCELLED or EXPIRED. At least one invited supplier is required before the RFQ can be published.',
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['supplierIds'],
                properties: {
                  supplierIds: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 100,
                    items: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'The full invited set after the invitation.',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/RfqParticipation' },
                }),
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/{id}/approvals': {
      get: {
        tags: ['History'],
        summary: 'List approval decisions',
        description: 'The decision trail, newest first.',
        parameters: [idParam],
        responses: {
          '200': {
            description: 'Decisions, newest first.',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/RfqApproval' },
                }),
              },
            },
          },
          ...errorResponses,
        },
      },
      post: {
        tags: ['History'],
        summary: 'Record an approval decision',
        description:
          'Drives the sourcing status: PENDING moves an RFQ to PENDING_APPROVAL, APPROVED to APPROVED, REJECTED and CANCELLED to their exits. Each decision must be legal from the current status, so DRAFT cannot jump straight to APPROVED. Approving an RFQ with no lines is refused. Requires ADMIN (`manage Account`).',
        parameters: [idParam, ifMatch],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['decision'],
                properties: {
                  decision: { type: 'string', enum: RFQ_APPROVAL_STATUSES },
                  comments: { type: 'string', maxLength: 2000 },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Decision recorded; the RFQ moved.',
            headers: { ETag: { schema: { type: 'string' } } },
            content: {
              'application/json': {
                schema: envelope({ $ref: '#/components/schemas/Rfq' }),
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/{id}/revisions': {
      get: {
        tags: ['History'],
        summary: 'List line-item revisions',
        description:
          'Newest first. Each entry carries the snapshot taken when the lines were replaced, so a reviewer can see what the RFQ asked for at the point a supplier quoted against it. Creating an RFQ records revision 1.',
        parameters: [idParam],
        responses: {
          '200': {
            description: 'Revisions, newest first.',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/RfqRevision' },
                }),
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/{id}/suppliers/{participationId}': {
      patch: {
        tags: ['Suppliers'],
        summary: 'Record where a supplier stands',
        description:
          'Moves a participation to VIEWED, ACCEPTED, DECLINED, NO_RESPONSE or WITHDRAWN. A decline needs a reason. SUBMITTED is refused: a bid is recorded by POSTing a response, so a participation can never claim a bid that does not exist.',
        parameters: [
          idParam,
          {
            name: 'participationId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'The rfqSupplierId from GET /{id}/suppliers.',
          },
          ifMatch,
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: RFQ_SUPPLIER_STATUSES },
                  declineReason: { type: 'string', maxLength: 1000 },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated.',
            headers: { ETag: { schema: { type: 'string' } } },
            content: {
              'application/json': {
                schema: envelope({ $ref: '#/components/schemas/RfqParticipation' }),
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/{id}/responses': {
      get: {
        tags: ['Responses'],
        summary: 'List bids on this RFQ',
        description:
          'Cheapest line price first. Current revisions only unless `currentOnly=false` — a re-submitted bid supersedes its predecessor rather than replacing it.',
        parameters: [
          idParam,
          ...listQuery.map((p) =>
            p.name === 'limit' ? { ...p, schema: { ...p.schema, default: 50 } } : p,
          ),
          { name: 'rfqItemId', in: 'query', schema: { type: 'string' } },
          { name: 'rfqSupplierId', in: 'query', schema: { type: 'string' } },
          {
            name: 'currentOnly',
            in: 'query',
            schema: { type: 'string', enum: ['true', 'false'], default: 'true' },
          },
        ],
        responses: {
          '200': {
            description: 'A page of bids.',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/RfqResponse' },
                }),
              },
            },
          },
          ...errorResponses,
        },
      },
      post: {
        tags: ['Responses'],
        summary: 'Submit a supplier bid',
        description:
          'The bid is submitted against a supplier’s **invitation** (`rfqSupplierId`), which must belong to the RFQ in the path — otherwise 404. Bids are accepted only while the RFQ is ISSUED or IN_PROGRESS. A re-submission supersedes the previous one and increments its revision. Lateness against `quotationDeadline` is stamped at submit time, not computed on read.',
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/SubmitResponse' } },
          },
        },
        responses: {
          '201': {
            description: 'Submitted.',
            content: {
              'application/json': {
                schema: envelope({ $ref: '#/components/schemas/SubmitResponseResult' }),
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/{id}/publish': workflow(
      'Issue the RFQ to its suppliers',
      'Moves an APPROVED RFQ to ISSUED. Refused if the RFQ is not APPROVED or has no invited suppliers.',
      'APPROVED',
    ),
    '/{id}/close': workflow(
      'Close the sourcing round',
      'Moves the RFQ to CLOSED. No approval decision maps to CLOSED, so this is its own endpoint rather than a decision on the approval chain.',
      'EVALUATING, AWARDED, EXPIRED',
    ),
    '/{id}/reopen': workflow(
      'Reopen a stopped RFQ',
      'Returns a CANCELLED or EXPIRED RFQ to DRAFT for a further round. Requires `manage Account` (ADMIN): reviving a deliberately stopped round is an administrative act.',
      'CANCELLED, EXPIRED',
    ),
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
            properties: { limit: { type: 'integer' }, nextCursor: { type: ['string', 'null'] } },
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
      RfqListItem: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          rfqNumber: { type: 'string' },
          type: { type: 'string', enum: RFQ_TYPES },
          buyerId: { type: ['string', 'null'] },
          title: { type: 'string' },
          currency: { type: ['string', 'null'] },
          incoterm: { type: ['string', 'null'], enum: [...RFQ_INCOTERMS, null] },
          destinationCountry: { type: ['string', 'null'] },
          destinationPort: { type: ['string', 'null'] },
          expectedShipmentDate: { type: ['string', 'null'], format: 'date-time' },
          quotationDeadline: { type: ['string', 'null'], format: 'date-time' },
          status: { type: 'string', enum: RFQ_STATUSES },
          priority: { type: 'string', enum: RFQ_PRIORITIES },
          currentRevision: { type: 'integer' },
          version: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          deletedAt: { type: ['string', 'null'], format: 'date-time' },
        },
      },
      Rfq: {
        allOf: [
          { $ref: '#/components/schemas/RfqListItem' },
          {
            type: 'object',
            properties: {
              description: { type: ['string', 'null'] },
              items: { type: 'array', items: { $ref: '#/components/schemas/RfqItem' } },
              suppliers: {
                type: 'array',
                items: { $ref: '#/components/schemas/RfqParticipation' },
              },
            },
          },
        ],
      },
      RfqItem: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          lineNumber: { type: 'integer' },
          productId: { type: ['string', 'null'] },
          customProductName: { type: ['string', 'null'] },
          quantity: { type: 'string', description: 'Decimal(18,4) rendered as a string.' },
          unit: { type: 'string' },
          targetPrice: { type: ['string', 'null'] },
          targetCurrency: { type: ['string', 'null'] },
          specifications: { type: ['object', 'null'], additionalProperties: true },
          requiredCertifications: { type: 'array', items: { type: 'string' } },
          packaging: { type: ['string', 'null'] },
          remarks: { type: ['string', 'null'] },
          product: { type: ['object', 'null'], additionalProperties: true },
        },
      },
      RfqParticipation: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The `rfqSupplierId` a bid is submitted against.',
          },
          supplierId: { type: 'string' },
          status: { type: 'string', enum: RFQ_SUPPLIER_STATUSES },
          isLate: { type: 'boolean' },
          supplier: { type: ['object', 'null'], additionalProperties: true },
        },
      },
      RfqApproval: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          sequence: { type: 'integer', description: 'Order of the decision; highest is newest.' },
          fromStatus: { type: ['string', 'null'], enum: [...RFQ_APPROVAL_STATUSES, null] },
          toStatus: { type: 'string', enum: RFQ_APPROVAL_STATUSES },
          approverId: { type: ['string', 'null'] },
          comments: { type: ['string', 'null'] },
          decidedAt: { type: ['string', 'null'], format: 'date-time' },
        },
      },
      RfqRevision: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          revisionNumber: { type: 'integer' },
          reason: { type: ['string', 'null'] },
          snapshot: {
            type: 'object',
            additionalProperties: true,
            description: 'The RFQ as it stood after this revision was cut.',
          },
          changedById: { type: ['string', 'null'] },
          changedAt: { type: 'string', format: 'date-time' },
        },
      },
      RfqResponse: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          rfqSupplierId: { type: 'string' },
          rfqItemId: { type: 'string' },
          price: { type: 'string' },
          currency: { type: 'string' },
          moq: { type: ['string', 'null'] },
          leadTimeDays: { type: ['integer', 'null'] },
          incoterm: { type: ['string', 'null'], enum: [...RFQ_INCOTERMS, null] },
          revisionNumber: { type: 'integer' },
          isCurrent: {
            type: 'boolean',
            description: 'False once a later submission supersedes this one.',
          },
        },
      },
      CreateRfq: {
        type: 'object',
        required: ['rfqNumber', 'title', 'items'],
        properties: {
          rfqNumber: {
            type: 'string',
            maxLength: 40,
            pattern: '^[A-Z0-9-]+$',
            description: 'Unique within the organization.',
          },
          type: { type: 'string', enum: RFQ_TYPES, default: 'BUYER' },
          buyerId: {
            type: 'string',
            description: 'Required for BUYER, must be absent for INTERNAL.',
          },
          title: { type: 'string', maxLength: 250 },
          description: { type: 'string', maxLength: 20000 },
          currency: { type: 'string', minLength: 3, maxLength: 3 },
          incoterm: { type: 'string', enum: RFQ_INCOTERMS },
          destinationCountry: { type: 'string', minLength: 2, maxLength: 2 },
          destinationPort: { type: 'string', maxLength: 120 },
          expectedShipmentDate: { type: 'string', format: 'date-time' },
          quotationDeadline: {
            type: 'string',
            format: 'date-time',
            description: 'Must not fall after expectedShipmentDate.',
          },
          priority: { type: 'string', enum: RFQ_PRIORITIES, default: 'NORMAL' },
          items: {
            type: 'array',
            minItems: 1,
            maxItems: 200,
            items: { $ref: '#/components/schemas/CreateRfqItem' },
          },
        },
      },
      UpdateRfq: {
        type: 'object',
        description: 'Every field optional. Terms freeze once the RFQ is ISSUED.',
        properties: {
          rfqNumber: { type: 'string' },
          type: { type: 'string', enum: RFQ_TYPES },
          buyerId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          currency: { type: 'string' },
          incoterm: { type: 'string', enum: RFQ_INCOTERMS },
          destinationCountry: { type: 'string' },
          destinationPort: { type: 'string' },
          expectedShipmentDate: { type: 'string', format: 'date-time' },
          quotationDeadline: { type: 'string', format: 'date-time' },
          priority: { type: 'string', enum: RFQ_PRIORITIES },
        },
      },
      CreateRfqItem: {
        type: 'object',
        required: ['quantity', 'unit'],
        description: 'Each line is a catalog product or a free-text request, never neither.',
        properties: {
          productId: { type: 'string' },
          customProductName: { type: 'string', maxLength: 250 },
          customProductDescription: { type: 'string', maxLength: 5000 },
          quantity: { type: 'number', exclusiveMinimum: 0 },
          unit: { type: 'string', maxLength: 16 },
          targetPrice: { type: 'number', minimum: 0 },
          targetCurrency: { type: 'string', minLength: 3, maxLength: 3 },
          specifications: { type: 'object', additionalProperties: true },
          requiredCertifications: { type: 'array', maxItems: 20, items: { type: 'string' } },
          packaging: { type: 'string', maxLength: 500 },
          remarks: { type: 'string', maxLength: 2000 },
        },
      },
      ReplaceRfqItems: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            minItems: 1,
            maxItems: 200,
            items: { $ref: '#/components/schemas/CreateRfqItem' },
          },
          reason: {
            type: 'string',
            maxLength: 500,
            description: 'Recorded on the revision so the change has a stated cause.',
          },
        },
      },
      SubmitResponse: {
        type: 'object',
        required: ['rfqSupplierId', 'lines'],
        properties: {
          rfqSupplierId: {
            type: 'string',
            description: 'The supplier’s invitation on THIS RFQ. A foreign id returns 404.',
          },
          quotationCurrency: { type: 'string', minLength: 3, maxLength: 3 },
          quotationIncoterm: { type: 'string', enum: RFQ_INCOTERMS },
          quotationPort: { type: 'string', maxLength: 120 },
          quotationValidUntil: { type: 'string', format: 'date-time' },
          quotationRemarks: { type: 'string', maxLength: 5000 },
          lines: {
            type: 'array',
            minItems: 1,
            maxItems: 200,
            description: 'A line may be quoted at most once per submission.',
            items: {
              type: 'object',
              required: ['rfqItemId', 'price', 'currency'],
              properties: {
                rfqItemId: { type: 'string' },
                price: { type: 'number', minimum: 0 },
                currency: { type: 'string', minLength: 3, maxLength: 3 },
                moq: { type: 'number', minimum: 0 },
                moqUnit: { type: 'string', maxLength: 16 },
                leadTimeDays: { type: 'integer', minimum: 0, maximum: 3650 },
                incoterm: { type: 'string', enum: RFQ_INCOTERMS },
                port: { type: 'string', maxLength: 120 },
                offeredProductId: { type: 'string' },
                offeredDescription: { type: 'string', maxLength: 500 },
                remarks: { type: 'string', maxLength: 2000 },
                validUntil: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
      SubmitResponseResult: {
        type: 'object',
        properties: {
          participation: { $ref: '#/components/schemas/RfqParticipation' },
          lines: { type: 'array', items: { $ref: '#/components/schemas/RfqResponse' } },
        },
      },
    },
    responses: {
      Unauthenticated: errorResponse('No valid session.'),
      Forbidden: errorResponse('Authenticated but not permitted by CASL.'),
      NotFound: errorResponse('No such record in the caller’s organization.'),
      Conflict: errorResponse(
        'Duplicate RFQ number, an illegal workflow move, a term changed after issue, or a bid outside the bidding window.',
      ),
      PreconditionFailed: errorResponse('`If-Match` did not match the current version.'),
      ValidationError: errorResponse('Request failed schema validation.'),
      PreconditionRequired: errorResponse('`If-Match` was absent on a mutation.'),
      RateLimited: errorResponse('Write rate limit exceeded.'),
    },
  },
} as const
