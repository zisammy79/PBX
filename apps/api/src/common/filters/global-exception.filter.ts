import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AppError } from '@pbx/contracts';
import { createCorrelationId } from '@pbx/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const correlationId =
      (request.headers['x-correlation-id'] as string | undefined) ?? createCorrelationId();

    if (exception instanceof AppError) {
      if (exception.code === 'RATE_LIMITED' && exception.details?.retryAfterSeconds) {
        response.header('Retry-After', String(exception.details.retryAfterSeconds));
      }
      return response.status(exception.statusCode).send({
        code: exception.code,
        message: exception.message,
        correlationId,
        details: exception.details,
      });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      return response.status(status).send({
        code: status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'VALIDATION_ERROR',
        message: typeof body === 'string' ? body : (body as { message?: string }).message,
        correlationId,
      });
    }

    if (exception instanceof ZodError) {
      return response.status(HttpStatus.BAD_REQUEST).send({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request parameters',
        correlationId,
        details: { issues: exception.issues },
      });
    }

    const errMessage =
      exception instanceof Error ? exception.message : String(exception);
    const errCode =
      exception && typeof exception === 'object' && 'code' in exception
        ? String((exception as { code?: string }).code ?? '')
        : '';

    if (
      errMessage.includes('recovery mode') ||
      errCode === '57P03' ||
      errMessage.includes('too many clients already')
    ) {
      return response.status(HttpStatus.SERVICE_UNAVAILABLE).send({
        code: 'DATABASE_UNAVAILABLE',
        message:
          'Database is temporarily unavailable. Try again in a few minutes or contact support.',
        correlationId,
      });
    }

    if (errMessage.includes('MISCONF Redis') || errMessage.includes('READONLY')) {
      return response.status(HttpStatus.SERVICE_UNAVAILABLE).send({
        code: 'CACHE_UNAVAILABLE',
        message: 'Session cache is temporarily unavailable. Try again shortly.',
        correlationId,
      });
    }

    console.error('Unhandled exception:', exception);
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      correlationId,
    });
  }
}
