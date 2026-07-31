import {
  CHARGE_TYPES,
  QUOTATION_APPROVAL_STATUSES,
  QUOTATION_INCOTERMS,
  QUOTATION_STATUSES,
  QUOTATION_TYPES,
  TAX_TYPES,
} from '@triyara/validation'

// OpenAPI 3.1 description of the Quotation REST API (TRY-BNP-QUOTE-API).
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
  description: 'Quotation id. Identifies one REVISION, not the quotation number.',
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

/** The five workflow endpoints differ only in prose, so they share a builder. */
const workflow = (summary: string, description: string, from: string, withComments = true) => ({
  post: {
    tags: ['Workflow'],
    summary,
    description,
    parameters: [idParam, ifMatch],
    ...(withComments
      ? {
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { comments: { type: 'string', maxLength: 2000 } },
                  description: 'Recorded on the approval row so the decision has a stated reason.',
                },
              },
            },
          },
        }
      : {}),
    responses: {
      '200': {
        description: `Moved. Legal only from: ${from}.`,
        headers: { ETag: { schema: { type: 'string' } } },
        content: {
          'application/json': { schema: envelope({ $ref: '#/components/schemas/Quotation' }) },
        },
      },
      ...errorResponses,
    },
  },
})

export const quotationOpenApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Triyara BNP - Quotation API',
    version: '1.0.0',
    description: [
      'Outbound customer quotations (TRY-BNP-QUOTE-API).',
      '',
      'Every response uses the platform envelope `{ success, data, meta, errors }`.',
      'Lists are cursor-paginated (keyset, never offset).',
      'Mutations require `If-Match` carrying the ETag from the last read; a stale',
      'value returns 412 and a missing one returns 428. Workflow moves are',
      'mutations and carry the same requirement.',
      '',
      'Every request is scoped to the caller’s organization. A quotation belonging',
      'to another tenant is reported as 404, never 403, so the API does not',
      'confirm the existence of records the caller may not see.',
      '',
      'Three properties of the domain shape this API:',
      '',
      '1. ONE ROW PER REVISION. An `id` identifies a single revision, not the',
      '   quotation number. Revising supersedes the current row and inserts',
      '   revisionNumber + 1; the superseded row IS the historical snapshot.',
      '   `currentOnly=true` on the list excludes superseded revisions.',
      '',
      '2. TOTALS ARE STORED, NOT DERIVED. A sent quotation is a commercial',
      '   commitment, so its arithmetic is frozen at write time and does not',
      '   shift when a tax or FX rate is later edited.',
      '',
      '3. COST AND MARGIN ARE INTERNAL. `costTotal`, `marginPercent` and per-line',
      '   `unitCost` are returned as null unless the caller can `manage Account`',
      '   (ADMIN). This is enforced in the service, so no endpoint can leak them.',
      '',
      'Authorization uses the `Account` CASL subject: read is open to every role,',
      'create/update/delete require ADMIN or EXPORT_MANAGER. Approving a',
      'quotation at or above the value threshold, or below the margin floor,',
      'additionally requires ADMIN.',
      '',
      'Lifecycle:',
      '  DRAFT -> PENDING_APPROVAL -> APPROVED -> SENT -> UNDER_NEGOTIATION',
      '  -> ACCEPTED | REJECTED | EXPIRED, with WITHDRAWN as an exit.',
      'SUPERSEDED is reached only by revising, never by hand. Illegal moves',
      'return 409 naming the states that are legal from here.',
    ].join('\n'),
  },
  servers: [{ url: '/api/quotations', description: 'Quotation API' }],
  security: [{ sessionCookie: [] }],
  tags: [
    { name: 'Quotations', description: 'Quotation revisions.' },
    { name: 'Items', description: 'Priced lines.' },
    { name: 'Workflow', description: 'Lifecycle transitions.' },
    { name: 'Pricing', description: 'Charges and taxes.' },
    { name: 'History', description: 'Approval decisions, line revisions and the supersede chain.' },
  ],
  paths: {
    '/': {
      get: {
        tags: ['Quotations'],
        summary: 'List quotations',
        description:
          'Cursor-paginated. `q` searches quotationNumber and title. Pass `currentOnly=true` to exclude superseded revisions — without it, every revision of a number appears.',
        parameters: [
          ...listQuery,
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Free-text search.' },
          { name: 'type', in: 'query', schema: { type: 'string', enum: QUOTATION_TYPES } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: QUOTATION_STATUSES } },
          { name: 'buyerId', in: 'query', schema: { type: 'string' } },
          {
            name: 'rfqId',
            in: 'query',
            schema: { type: 'string' },
            description: 'Quotations raised against this RFQ.',
          },
          { name: 'currency', in: 'query', schema: { type: 'string', minLength: 3, maxLength: 3 } },
          {
            name: 'currentOnly',
            in: 'query',
            schema: { type: 'string', enum: ['true', 'false'] },
            description: 'Latest live revision only.',
          },
          { name: 'validBefore', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'validAfter', in: 'query', schema: { type: 'string', format: 'date-time' } },
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
                'validUntil',
                '-validUntil',
                'grandTotal',
                '-grandTotal',
                'quotationNumber',
                '-quotationNumber',
              ],
              default: '-createdAt',
            },
          },
        ],
        responses: {
          '200': {
            description: 'A page of quotation revisions.',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/QuotationListItem' },
                }),
              },
            },
          },
          ...errorResponses,
        },
      },
      post: {
        tags: ['Quotations'],
        summary: 'Raise a quotation',
        description:
          'Creates the quotation **with its lines in one request** — stored totals are computed from the lines, so a lineless quotation would carry a priced zero that means nothing. A cross-currency quotation with no exchange rate on file is refused (422) rather than converted at 1; the rate in force is frozen onto the document.',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateQuotation' } },
          },
        },
        responses: {
          '201': {
            description: 'Created in DRAFT at revision 1, with an opening approval row.',
            headers: { ETag: { schema: { type: 'string', example: 'W/"v1"' } } },
            content: {
              'application/json': { schema: envelope({ $ref: '#/components/schemas/Quotation' }) },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/{id}': {
      get: {
        tags: ['Quotations'],
        summary: 'Read a quotation revision',
        parameters: [idParam],
        responses: {
          '200': {
            description:
              'The revision, with lines, charges, taxes and payment term. Cost and margin are null unless the caller can `manage Account`.',
            headers: { ETag: { schema: { type: 'string', example: 'W/"v3"' } } },
            content: {
              'application/json': { schema: envelope({ $ref: '#/components/schemas/Quotation' }) },
            },
          },
          ...errorResponses,
        },
      },
      patch: {
        tags: ['Quotations'],
        summary: 'Update a quotation',
        description:
          'Editable only while DRAFT, PENDING_APPROVAL or APPROVED. Once SENT the document is a commitment and returns 409 — raise a revision instead. Changing currency re-freezes the exchange rate.',
        parameters: [idParam, ifMatch],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/UpdateQuotation' } },
          },
        },
        responses: {
          '200': {
            description: 'Updated.',
            headers: { ETag: { schema: { type: 'string' } } },
            content: {
              'application/json': { schema: envelope({ $ref: '#/components/schemas/Quotation' }) },
            },
          },
          ...errorResponses,
        },
      },
      delete: {
        tags: ['Quotations'],
        summary: 'Withdraw a quotation',
        description:
          'Withdraws rather than erases: a quotation a buyer has seen is a record. Sets status WITHDRAWN and `deletedAt`.',
        parameters: [idParam, ifMatch],
        responses: {
          '200': {
            description: 'Withdrawn.',
            content: {
              'application/json': { schema: envelope({ $ref: '#/components/schemas/Quotation' }) },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/{id}/items': {
      get: {
        tags: ['Items'],
        summary: 'List the priced lines',
        description:
          'In line-number order. Not paginated: a quotation carries at most 200 lines. Per-line `unitCost` and `marginPercent` are null unless the caller can `manage Account`.',
        parameters: [idParam],
        responses: {
          '200': {
            description: 'The lines, with quotation context in `meta`.',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/QuotationItem' },
                }),
              },
            },
          },
          ...errorResponses,
        },
      },
      post: {
        tags: ['Items'],
        summary: 'Replace the priced lines',
        description:
          'Replaces every line and re-totals. Wholesale by design: the service owns the arithmetic, so there is no per-line PATCH that could leave the stored totals disagreeing with the lines. Refused with 409 once the quotation is past APPROVED - after SENT the document is a commitment, and changing it means a revision.',
        parameters: [idParam, ifMatch],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['items'],
                properties: {
                  items: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 200,
                    items: { $ref: '#/components/schemas/CreateQuotationItem' },
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Replaced. `meta` carries the recomputed totals.',
            headers: { ETag: { schema: { type: 'string' } } },
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/QuotationItem' },
                }),
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/{id}/conditions': {
      get: {
        tags: ['Pricing'],
        summary: 'Read the charges and taxes',
        parameters: [idParam],
        responses: {
          '200': {
            description: 'Charges and taxes as stored, with the totals in `meta`.',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'object',
                  properties: {
                    charges: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/QuotationCharge' },
                    },
                    taxes: { type: 'array', items: { $ref: '#/components/schemas/QuotationTax' } },
                  },
                }),
              },
            },
          },
          ...errorResponses,
        },
      },
      put: {
        tags: ['Pricing'],
        summary: 'Replace the charges and taxes',
        description:
          'Both collections are replaced together and the quotation is re-totalled once; two endpoints would mean two re-totals and a window where the stored totals reflect new charges but old taxes. An empty array clears that side, which is why both keys default to `[]` rather than being optional. A submitted tax `amount` and `taxableAmount` are NOT trusted for a header tax: the service recomputes tax as `ratePercent` against the running total (subtotal + charges - discounts), so a caller cannot understate tax by naming its own base. A line-scoped charge or tax must name a line on this quotation, or the call is refused with 422.',
        parameters: [idParam, ifMatch],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  charges: {
                    type: 'array',
                    maxItems: 100,
                    items: { $ref: '#/components/schemas/QuotationCharge' },
                  },
                  taxes: {
                    type: 'array',
                    maxItems: 100,
                    items: { $ref: '#/components/schemas/QuotationTax' },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Replaced and re-totalled.',
            headers: { ETag: { schema: { type: 'string' } } },
            content: {
              'application/json': {
                schema: envelope({
                  type: 'object',
                  properties: {
                    charges: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/QuotationCharge' },
                    },
                    taxes: { type: 'array', items: { $ref: '#/components/schemas/QuotationTax' } },
                  },
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
                  items: { $ref: '#/components/schemas/QuotationApproval' },
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
          'Takes the decision as data rather than as a path segment, which is what makes `PENDING` reachable: /approve and /reject hard-code theirs, so the move from DRAFT to PENDING_APPROVAL had no endpoint at all. This does not replace those two - they remain the named form of the common cases. The TRANSITIONS table, the value threshold and the margin floor all stay in the service.',
        parameters: [idParam, ifMatch],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['decision'],
                properties: {
                  decision: { type: 'string', enum: QUOTATION_APPROVAL_STATUSES },
                  comments: { type: 'string', maxLength: 2000 },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Decision recorded; the quotation moved.',
            headers: { ETag: { schema: { type: 'string' } } },
            content: {
              'application/json': { schema: envelope({ $ref: '#/components/schemas/Quotation' }) },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/{id}/revise': {
      post: {
        tags: ['History'],
        summary: 'Supersede this quotation with a new revision',
        description:
          'The only way to change a quotation that is already SENT. The original becomes SUPERSEDED and a NEW record is created carrying the next revision number under the same quotation number, in one transaction - so there can be no superseded quotation without a successor. Returns 201 with the new record and ITS ETag; the id in the response is a different quotation, and the caller previous version no longer applies.',
        parameters: [idParam, ifMatch],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['reason', 'items'],
                properties: {
                  reason: { type: 'string', minLength: 1, maxLength: 500 },
                  items: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 200,
                    items: { $ref: '#/components/schemas/CreateQuotationItem' },
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'The successor quotation.',
            headers: { ETag: { schema: { type: 'string' } } },
            content: {
              'application/json': { schema: envelope({ $ref: '#/components/schemas/Quotation' }) },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/{id}/revisions': {
      get: {
        tags: ['History'],
        summary: 'List line revisions on this quotation',
        description:
          'The record of edits made to THIS document, newest first. Distinct from /chain, which is the lineage of documents that superseded one another.',
        parameters: [idParam],
        responses: {
          '200': {
            description: 'Revisions, newest first.',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/QuotationRevision' },
                }),
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/{id}/chain': {
      get: {
        tags: ['History'],
        summary: 'List every revision sharing this quotation number',
        description:
          'Revising creates a NEW quotation and marks the old one SUPERSEDED, so the lineage is a set of sibling records rather than versions of one row. Without this a superseded quotation is a dead end: nothing else in the API points at the document that replaced it. Keyed by id, so the caller does not need the number first and the org scoping matches every other route.',
        parameters: [idParam],
        responses: {
          '200': {
            description: 'The revision chain.',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/QuotationListItem' },
                }),
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/{id}/approve': workflow(
      'Approve the quotation',
      'Moves the quotation to APPROVED. At or above the value threshold, or below the margin floor, this requires ADMIN (`manage Account`) and returns 403 otherwise. The threshold and the margin at decision time are both recorded on the approval row, so an auditor can see WHY approval was required.',
      'DRAFT, PENDING_APPROVAL',
    ),
    '/{id}/reject': workflow(
      'Reject the quotation',
      'Moves the quotation to REJECTED. Terminal — a rejected quotation is revised into a new one rather than reopened.',
      'PENDING_APPROVAL, SENT, UNDER_NEGOTIATION',
    ),
    '/{id}/send': workflow(
      'Send the quotation to the buyer',
      'Moves an APPROVED quotation to SENT and stamps `sentAt`. Refused if the quotation has no lines or no validity date. From here the document is frozen: further changes require a revision.',
      'APPROVED',
      false,
    ),
    '/{id}/accept': workflow(
      'Record buyer acceptance',
      'Moves the quotation to ACCEPTED. No approval decision maps to ACCEPTED, so this is its own endpoint rather than a decision on the approval chain.',
      'SENT, UNDER_NEGOTIATION',
    ),
    '/{id}/expire': workflow(
      'Expire the quotation',
      'Lapses a quotation whose validity has run out. Explicit rather than inferred from `validUntil` on read: when an offer stopped being a commitment is a fact worth recording with an actor and a timestamp, not recomputing per request.',
      'SENT, UNDER_NEGOTIATION',
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
          status: { type: 'string', description: 'On workflow endpoints: the resulting status.' },
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
      QuotationListItem: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          quotationNumber: { type: 'string' },
          revisionNumber: { type: 'integer' },
          previousRevisionId: { type: ['string', 'null'] },
          supersededAt: { type: ['string', 'null'], format: 'date-time' },
          type: { type: 'string', enum: QUOTATION_TYPES },
          status: { type: 'string', enum: QUOTATION_STATUSES },
          buyerId: { type: 'string' },
          primaryRfqId: { type: ['string', 'null'] },
          title: { type: ['string', 'null'] },
          currency: { type: 'string' },
          baseCurrency: { type: 'string' },
          fxRate: { type: ['string', 'null'], description: 'Frozen at creation.' },
          incoterm: { type: ['string', 'null'], enum: [...QUOTATION_INCOTERMS, null] },
          validFrom: { type: ['string', 'null'], format: 'date-time' },
          validUntil: { type: ['string', 'null'], format: 'date-time' },
          subtotal: { type: 'string' },
          chargesTotal: { type: 'string' },
          discountTotal: { type: 'string' },
          taxTotal: { type: 'string' },
          grandTotal: { type: 'string' },
          sentAt: { type: ['string', 'null'], format: 'date-time' },
          version: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
          deletedAt: { type: ['string', 'null'], format: 'date-time' },
        },
      },
      Quotation: {
        allOf: [
          { $ref: '#/components/schemas/QuotationListItem' },
          {
            type: 'object',
            properties: {
              description: { type: ['string', 'null'] },
              costTotal: {
                type: ['string', 'null'],
                description: 'INTERNAL. Null unless the caller can `manage Account`.',
              },
              marginPercent: {
                type: ['string', 'null'],
                description: 'INTERNAL. Null unless the caller can `manage Account`.',
              },
              items: { type: 'array', items: { $ref: '#/components/schemas/QuotationItem' } },
              charges: { type: 'array', items: { $ref: '#/components/schemas/QuotationCharge' } },
              taxes: { type: 'array', items: { $ref: '#/components/schemas/QuotationTax' } },
              paymentTerm: { type: ['object', 'null'], additionalProperties: true },
            },
          },
        ],
      },
      QuotationItem: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          lineNumber: { type: 'integer' },
          productId: { type: ['string', 'null'] },
          customProductName: { type: ['string', 'null'] },
          rfqItemId: {
            type: ['string', 'null'],
            description: 'The RFQ line this answers — per-line provenance.',
          },
          quantity: { type: 'string' },
          unit: { type: 'string' },
          unitPrice: { type: 'string' },
          unitCost: {
            type: ['string', 'null'],
            description: 'INTERNAL. Null unless the caller can `manage Account`.',
          },
          marginPercent: {
            type: ['string', 'null'],
            description: 'INTERNAL. Null unless the caller can `manage Account`.',
          },
          lineSubtotal: { type: 'string' },
          lineTotal: { type: 'string' },
          hsCode: { type: ['string', 'null'] },
          countryOfOrigin: { type: ['string', 'null'] },
          requiredCertifications: { type: 'array', items: { type: 'string' } },
        },
      },
      QuotationCharge: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          quotationItemId: { type: ['string', 'null'], description: 'Null for a header charge.' },
          type: { type: 'string', enum: CHARGE_TYPES },
          scope: { type: 'string', enum: ['HEADER', 'LINE'] },
          basis: { type: 'string' },
          rate: { type: ['string', 'null'] },
          amount: { type: 'string' },
          isDeduction: { type: 'boolean' },
          sequence: { type: 'integer', description: 'Order of evaluation. Significant.' },
        },
      },
      QuotationTax: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          quotationItemId: { type: ['string', 'null'] },
          type: { type: 'string', enum: TAX_TYPES },
          ratePercent: { type: 'string' },
          taxableAmount: { type: 'string' },
          amount: { type: 'string' },
          isCompound: { type: 'boolean' },
          isReverseCharge: {
            type: 'boolean',
            description: 'Recorded but not collected: liability shifts to the buyer.',
          },
          sequence: { type: 'integer' },
        },
      },
      QuotationApproval: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          sequence: { type: 'integer', description: 'Order of the decision; highest is newest.' },
          fromStatus: { type: ['string', 'null'] },
          toStatus: { type: 'string', enum: QUOTATION_APPROVAL_STATUSES },
          approverId: { type: ['string', 'null'] },
          thresholdAmount: {
            type: ['string', 'null'],
            description: 'The approval threshold in force at decision time.',
          },
          marginPercent: {
            type: ['string', 'null'],
            description:
              'The margin at decision time. Null unless the reader can `manage Account`.',
          },
          comments: { type: ['string', 'null'] },
          decidedAt: { type: ['string', 'null'], format: 'date-time' },
        },
      },
      QuotationRevision: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          fromRevision: { type: ['integer', 'null'] },
          toRevision: { type: 'integer' },
          reason: { type: ['string', 'null'] },
          changeSummary: { type: ['object', 'null'], additionalProperties: true },
          changedById: { type: ['string', 'null'] },
          changedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateQuotation: {
        type: 'object',
        required: ['quotationNumber', 'buyerId', 'currency', 'baseCurrency', 'items'],
        properties: {
          quotationNumber: { type: 'string', maxLength: 40, pattern: '^[A-Z0-9-]+$' },
          type: { type: 'string', enum: QUOTATION_TYPES, default: 'FIRM' },
          buyerId: { type: 'string' },
          primaryRfqId: { type: 'string' },
          title: { type: 'string', maxLength: 250 },
          description: { type: 'string', maxLength: 20000 },
          currency: { type: 'string', minLength: 3, maxLength: 3 },
          baseCurrency: { type: 'string', minLength: 3, maxLength: 3 },
          incoterm: { type: 'string', enum: QUOTATION_INCOTERMS },
          namedPlace: { type: 'string', maxLength: 160 },
          destinationCountry: { type: 'string', minLength: 2, maxLength: 2 },
          destinationPort: { type: 'string', maxLength: 120 },
          paymentTermId: { type: 'string' },
          paymentTermsText: { type: 'string', maxLength: 2000 },
          leadTimeDays: { type: 'integer', minimum: 0, maximum: 3650 },
          validFrom: { type: 'string', format: 'date-time' },
          validUntil: {
            type: 'string',
            format: 'date-time',
            description: 'Must fall after validFrom. Required before the quotation can be sent.',
          },
          items: {
            type: 'array',
            minItems: 1,
            maxItems: 200,
            items: { $ref: '#/components/schemas/CreateQuotationItem' },
          },
        },
      },
      UpdateQuotation: {
        type: 'object',
        description: 'Every field optional. Refused once the quotation is SENT.',
        properties: {
          quotationNumber: { type: 'string' },
          type: { type: 'string', enum: QUOTATION_TYPES },
          buyerId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          currency: { type: 'string', description: 'Changing this re-freezes the exchange rate.' },
          baseCurrency: { type: 'string' },
          incoterm: { type: 'string', enum: QUOTATION_INCOTERMS },
          destinationCountry: { type: 'string' },
          destinationPort: { type: 'string' },
          paymentTermId: { type: 'string' },
          leadTimeDays: { type: 'integer' },
          validFrom: { type: 'string', format: 'date-time' },
          validUntil: { type: 'string', format: 'date-time' },
        },
      },
      CreateQuotationItem: {
        type: 'object',
        required: ['quantity', 'unit', 'unitPrice'],
        description: 'Each line is a catalog product or a free-text offer, never neither.',
        properties: {
          productId: { type: 'string' },
          customProductName: { type: 'string', maxLength: 250 },
          description: { type: 'string', maxLength: 5000 },
          rfqItemId: { type: 'string', description: 'The RFQ line this answers.' },
          quantity: { type: 'number', exclusiveMinimum: 0 },
          unit: { type: 'string', maxLength: 16 },
          unitCost: { type: 'number', minimum: 0, description: 'INTERNAL.' },
          unitPrice: { type: 'number', minimum: 0, description: 'Must be above zero.' },
          hsCode: { type: 'string', pattern: '^\\d{6,12}$' },
          countryOfOrigin: { type: 'string', minLength: 2, maxLength: 2 },
          requiredCertifications: { type: 'array', maxItems: 20, items: { type: 'string' } },
          leadTimeDays: { type: 'integer', minimum: 0, maximum: 3650 },
          remarks: { type: 'string', maxLength: 2000 },
        },
      },
    },
    responses: {
      Unauthenticated: errorResponse('No valid session.'),
      Forbidden: errorResponse(
        'Authenticated but not permitted by CASL — including an approval above the value threshold or below the margin floor attempted by a non-ADMIN.',
      ),
      NotFound: errorResponse('No such record in the caller’s organization.'),
      Conflict: errorResponse(
        'Duplicate number and revision, an illegal workflow move, or an edit to a SENT quotation.',
      ),
      PreconditionFailed: errorResponse('`If-Match` did not match the current version.'),
      ValidationError: errorResponse(
        'Request failed schema validation, or no exchange rate is on file for the currency pair.',
      ),
      PreconditionRequired: errorResponse('`If-Match` was absent on a mutation.'),
      RateLimited: errorResponse('Write rate limit exceeded.'),
    },
  },
} as const
