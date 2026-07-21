// Typed application error hierarchy. Every error maps to an HTTP status and a
// stable machine code (see TRY-BNP-API-01 error format).
export class AppError extends Error {
  readonly code: string
  readonly httpStatus: number

  constructor(message: string, code: string, httpStatus = 500, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.code = code
    this.httpStatus = httpStatus
    this.name = new.target.name
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', cause?: unknown) {
    super(message, 'VALIDATION_ERROR', 422, cause)
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 'NOT_FOUND', 404)
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Not authenticated') {
    super(message, 'UNAUTHENTICATED', 401)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 'FORBIDDEN', 403)
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 'CONFLICT', 409)
  }
}

export class PreconditionFailedError extends AppError {
  constructor(message = 'Precondition failed (stale version)') {
    super(message, 'PRECONDITION_FAILED', 412)
  }
}

export class PreconditionRequiredError extends AppError {
  constructor(message = 'If-Match header required') {
    super(message, 'PRECONDITION_REQUIRED', 428)
  }
}
