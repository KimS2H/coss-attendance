// 오류 응답 형식을 하나로 맞춘다: { error: { code, message, fields? } }
// message는 화면에 그대로 보여 줄 수 있는 한국어로 쓴다.
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';

export class AppError extends HttpException {
  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super({ error: { code, message, ...(fields ? { fields } : {}) } }, status);
  }
}

export const Errors = {
  unauthorized: () => new AppError(401, 'UNAUTHORIZED', '다시 로그인해 주세요.'),
  forbidden: (msg = '권한이 없어요.') => new AppError(403, 'FORBIDDEN', msg),
  notFound: (what = '대상') => new AppError(404, 'NOT_FOUND', `${what}을(를) 찾을 수 없어요.`),
  validation: (message: string, fields?: Record<string, string>) => new AppError(400, 'VALIDATION', message, fields),
  conflict: (code: string, message: string) => new AppError(409, code, message),
  tooMany: () => new AppError(429, 'TOO_MANY_REQUESTS', '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.'),
};

/** 요청 본문 검사: zod 규칙에 안 맞으면 칸별 메시지와 함께 400 */
export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const i of r.error.issues) fields[i.path.join('.') || '_'] = i.message;
  throw Errors.validation(Object.values(fields)[0] ?? '입력값을 확인해 주세요.', fields);
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Error');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'object' && body && 'error' in body) return res.status(exception.getStatus()).json(body);
      const status = exception.getStatus();
      const code = status === 404 ? 'NOT_FOUND' : status === 429 ? 'TOO_MANY_REQUESTS' : status === 413 ? 'FILE_TOO_LARGE' : 'HTTP_ERROR';
      const message =
        status === 404 ? '없는 주소예요.' : status === 413 ? '파일이 너무 커요 (최대 5MB).' : status === 429 ? '요청이 너무 많아요.' : exception.message;
      return res.status(status).json({ error: { code, message } });
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
      return res.status(409).json({ error: { code: 'DUPLICATE', message: '이미 등록된 값이에요.' } });
    }
    this.log.error(exception instanceof Error ? exception.stack : String(exception));
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: { code: 'SERVER_ERROR', message: '서버 오류가 났어요. 잠시 후 다시 시도해 주세요.' } });
  }
}
