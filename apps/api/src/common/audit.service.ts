// 작업 로그 (audit_logs): 로그인 실패, 학교 코드 변경, 기기 초기화 등을 누가 언제 했는지 남긴다.
import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from './prisma.service';

type Actor = { type: 'student' | 'staff' | 'admin' | 'system'; id?: number | null };

@Injectable()
export class AuditService {
  private log = new Logger('Audit');
  constructor(private prisma: PrismaService) {}

  async record(actor: Actor, action: string, target?: { type: string; id?: number | null }, detail?: object, req?: Request) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorType: actor.type,
          actorId: actor.id ?? null,
          action,
          targetType: target?.type ?? null,
          targetId: target?.id ?? null,
          detail: (detail as object) ?? undefined,
          ip: req ? clientIp(req) : null,
        },
      });
    } catch (e) {
      // 로그를 못 남겨도 본 작업은 계속한다
      this.log.warn(`작업 로그 저장 실패: ${action} ${String(e)}`);
    }
  }
}

/** Nginx가 넘겨준 실제 접속 IP */
export function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress ?? '';
}
