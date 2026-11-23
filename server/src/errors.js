// Erori HTTP cu format unic: { error: { code, message, details? } }
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, 'VALIDATION_ERROR', message, details);
export const notFound = (message = 'Resursa nu există') => new HttpError(404, 'NOT_FOUND', message);
export const forbidden = (message = 'Nu aveți drept pentru această operație') => new HttpError(403, 'FORBIDDEN', message);
export const conflict = (code, message, details) => new HttpError(409, code, message, details);

// Codurile mașinii de stări -> coduri HTTP
const TRANSITION_STATUS = {
  UNKNOWN_ACTION: 400,
  COMMENT_REQUIRED: 400,
  FORBIDDEN: 403,
  INVALID_TRANSITION: 409,
  INCOMPLETE: 422,
};

/** Transformă orice eroare într-un răspuns { status, body }. */
export function toErrorResponse(err) {
  if (err instanceof HttpError) {
    const body = { error: { code: err.code, message: err.message } };
    if (err.details !== undefined) body.error.details = err.details;
    return { status: err.status, body };
  }
  if (err?.name === 'TransitionError') {
    return { status: TRANSITION_STATUS[err.code] ?? 400, body: { error: { code: err.code, message: err.message } } };
  }
  if (err?.name === 'SequelizeValidationError') {
    return {
      status: 400,
      body: { error: { code: 'VALIDATION_ERROR', message: 'Date invalide', details: err.errors.map((e) => e.message) } },
    };
  }
  if (err?.name === 'SequelizeForeignKeyConstraintError') {
    return { status: 400, body: { error: { code: 'VALIDATION_ERROR', message: 'Referință invalidă' } } };
  }
  if (err?.type === 'entity.parse.failed') {
    return { status: 400, body: { error: { code: 'INVALID_JSON', message: 'Corpul cererii nu e JSON valid' } } };
  }
  return { status: 500, body: { error: { code: 'INTERNAL', message: 'Eroare internă' } } };
}
