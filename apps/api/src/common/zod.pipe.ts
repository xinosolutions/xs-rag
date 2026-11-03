import { PipeTransform, Injectable, ArgumentMetadata, HttpStatus } from '@nestjs/common';
import type { ZodSchema, ZodError } from 'zod';
import { ErrorCode } from '@xs-rag/shared';
import { ApiException } from './error-envelope.filter.js';

@Injectable()
export class ZodPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const error = result.error as ZodError;
      const fields = error.issues.map((issue) => ({
        field: issue.path.join('.'),
        issue: issue.message || issue.code,
      }));

      throw new ApiException(
        ErrorCode.VALIDATION_FAILED,
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        { fields },
      );
    }
    return result.data;
  }
}
