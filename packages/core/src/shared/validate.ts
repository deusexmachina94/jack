import type { ZodSchema } from 'zod';
import { badRequest } from './errors.js';

/** Parse untrusted input against a zod schema, throwing a 400 AppError on failure. */
export function parse<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw badRequest(detail);
  }
  return result.data;
}
