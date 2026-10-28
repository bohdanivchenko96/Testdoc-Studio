// Errors the API turns into HTTP statuses (see the error handler in server/index.ts).

export class NotFoundError extends Error {}

export class BadRequestError extends Error {}

export class ConflictError extends Error {}
