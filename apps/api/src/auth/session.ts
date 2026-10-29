// 로그인 세션. 쿠키(sid)에는 임의 문자열만 두고, 실제 정보는 Redis에 3시간 저장한다.
import { CanActivate, ExecutionContext, Injectable, SetMetadata, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CookieOptions, Request, Response } from 'express';
import { isProd } from '../config';
import { randomToken } from '../common/crypto';
import { Errors } from '../common/errors';
import { KvService } from '../common/kv.service';

export type Role = 'student' | 'staff' | 'staff_pending' | 'admin';
export type AuthSession = {
  role: Role;
  id: number; // students.id / staff.id / admins.id
  schoolId?: number;
  createdAt: number;
  codeFailures?: number; // 학교 코드 틀린 횟수 (staff_pending)
};

export const SESSION_COOKIE = 'sid';
export const SESSION_TTL_SEC = 3 * 60 * 60; // 3시간 (연장하지 않음)
const PENDING_TTL_SEC = 5 * 60; // 학교 코드 입력 전 상태는 5분

const cookieOpts = (): CookieOptions => ({ httpOnly: true, sameSite: 'strict', secure: isProd(), path: '/' });

@Injectable()
export class SessionService {
  constructor(private kv: KvService) {}

  async create(res: Response, s: Omit<AuthSession, 'createdAt'>): Promise<void> {
    const token = randomToken();
    const ttl = s.role === 'staff_pending' ? PENDING_TTL_SEC : SESSION_TTL_SEC;
    await this.kv.setJson(`sess:${token}`, { ...s, createdAt: Date.now() }, ttl);
    res.cookie(SESSION_COOKIE, token, { ...cookieOpts(), maxAge: ttl * 1000 });
  }

  /** 세션 내용을 바꾼다 (남은 시간은 처음 만든 시각 기준으로 유지) */
  async update(req: Request, s: AuthSession): Promise<void> {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return;
    const total = s.role === 'staff_pending' ? PENDING_TTL_SEC : SESSION_TTL_SEC;
    const left = Math.max(1, Math.floor(total - (Date.now() - s.createdAt) / 1000));
    await this.kv.setJson(`sess:${token}`, s, left);
  }

  async get(req: Request): Promise<AuthSession | null> {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token || typeof token !== 'string') return null;
    return this.kv.getJson<AuthSession>(`sess:${token}`);
  }

  async destroy(req: Request, res: Response): Promise<void> {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) await this.kv.del(`sess:${token}`);
    res.clearCookie(SESSION_COOKIE, cookieOpts());
  }
}

// ----- 컨트롤러에 붙이는 표시 -----
const PUBLIC_KEY = 'isPublic';
const ROLES_KEY = 'roles';
/** 로그인 없이 부를 수 있는 API */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
/** 이 역할만 부를 수 있는 API */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
/** 현재 로그인 세션을 매개변수로 받기: @Auth() s: AuthSession */
export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().auth as AuthSession);

/** 모든 API에 적용되는 로그인 검사 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const req = ctx.switchToHttp().getRequest();
    const session = await this.sessions.get(req);
    req.auth = session;
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;
    if (!session) throw Errors.unauthorized();
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets) ?? [];
    if (roles.length === 0) {
      if (session.role === 'staff_pending') throw Errors.unauthorized();
      return true;
    }
    if (!roles.includes(session.role)) throw Errors.forbidden();
    return true;
  }
}
