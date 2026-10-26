import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCode, ErrorEnvelope } from '@xs-rag/shared';
import { randomUUID } from 'crypto';

export class ApiException extends HttpException {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: Record<string, unknown>,
  ) {
    super(message, status);
    this.code = code;
    this.details = details;
  }
}

@Catch()
export class ErrorEnvelopeFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorEnvelopeFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId = request.requestId || (response.getHeader('X-Request-Id') as string) || randomUUID();
    response.setHeader('X-Request-Id', requestId);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = ErrorCode.INTERNAL;
    let message = 'An internal server error occurred.';
    let details: Record<string, unknown> | undefined = undefined;

    if (exception instanceof ApiException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        if (typeof resObj.code === 'string' && resObj.code in ErrorCode) {
          code = resObj.code as ErrorCode;
        } else {
          code = this.mapStatusToErrorCode(status);
        }

        if (typeof resObj.message === 'string') {
          message = resObj.message;
        } else if (Array.isArray(resObj.message)) {
          message = resObj.message.join(', ');
        } else {
          message = exception.message;
        }

        if (typeof resObj.details === 'object' && resObj.details !== null) {
          details = resObj.details as Record<string, unknown>;
        }
      } else {
        code = this.mapStatusToErrorCode(status);
        message = typeof res === 'string' ? res : exception.message;
      }
    } else {
      this.logger.error(`Unhandled error [${requestId}]:`, exception);
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = ErrorCode.INTERNAL;
      message = 'An unexpected internal error occurred.';
    }

    const errorPayload: ErrorEnvelope = {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
        requestId,
      },
    };

    response.status(status).json(errorPayload);
  }

  private mapStatusToErrorCode(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_FAILED;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.AUTH_REQUIRED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.WORKSPACE_NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.DOC_INVALID_TRANSITION;
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return ErrorCode.FILE_TOO_LARGE;
      case HttpStatus.UNSUPPORTED_MEDIA_TYPE:
        return ErrorCode.FILE_TYPE_NOT_SUPPORTED;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMITED;
      case HttpStatus.BAD_GATEWAY:
        return ErrorCode.LLM_UNAVAILABLE;
      default:
        return ErrorCode.INTERNAL;
    }
  }
}
