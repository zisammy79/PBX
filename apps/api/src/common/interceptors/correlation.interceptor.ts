import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { CORRELATION_HEADER, normalizeCorrelationId } from '@pbx/shared';
import { Observable } from 'rxjs';
import type { FastifyReply, FastifyRequest } from 'fastify';

@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const response = http.getResponse<FastifyReply>();

    const correlationId = normalizeCorrelationId(request.headers[CORRELATION_HEADER] as string | undefined);

    request.headers[CORRELATION_HEADER] = correlationId;
    response.header(CORRELATION_HEADER, correlationId);

    return next.handle();
  }
}
