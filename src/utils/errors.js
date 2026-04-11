export class AppError extends Error {
  constructor(message, statusCode = 500, details = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message, details = {}) {
    super(message, 400, details);
    this.name = 'ValidationError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message, details = {}) {
    super(message, 403, details);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message, details = {}) {
    super(message, 404, details);
    this.name = 'NotFoundError';
  }
}
