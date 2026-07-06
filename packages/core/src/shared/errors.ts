/** Typed application error carrying an HTTP status, for uniform route handling. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (msg: string): AppError => new AppError(404, 'not_found', msg);
export const badRequest = (msg: string): AppError => new AppError(400, 'bad_request', msg);
export const unprocessable = (msg: string): AppError => new AppError(422, 'unprocessable', msg);
export const conflict = (msg: string): AppError => new AppError(409, 'conflict', msg);
