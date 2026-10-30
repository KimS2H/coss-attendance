// 로그인 세션. 쿠키에는 임의 문자열만 두고, 실제 정보는 Redis에 저장한다.
//
// 역할마다 쿠키 이름을 따로 쓴다 (학생 sid_s / 인솔자 sid_t / 총관리자 sid_a).
//   쿠키는 포트를 구분하지 않아서, 한 컴퓨터에서 관리자 입구(8443)와 학생·인솔자 입구(443)를
//   같이 열면 쿠키 하나를 서로 덮어써 새로고침할 때 로그아웃되던 문제가 있었다.
// 화면(api/client.ts)은 요청마다 X-Coss-Area 헤더로 "지금 어느 화면인지"를 알려 주고,
//   서버는 그 화면의 쿠키를 읽는다. 헤더가 없으면(테스트 등) 주소와 가진 쿠키로 짐작한다.
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

/** 화면 구역: 학생(/), 인솔자(/staff), 총관리자(/admin) */
export type Area = 'student' | 'staff' | 'admin';
export const AREA_HEADER = 'x-coss-area';
export const SESSION_COOKIES: Record<Area, string> = { student: 'sid_s', staff: 'sid_t', admin: 'sid_a' };

const PENDING_TTL_SEC = 5 * 60; // 학교 코드 입력 전 상태는 5분
export const SESSION_TTL_SEC = 3 * 60 * 60; // 학생·인솔자 3시간 (연장하지 않음)
// 총관리자: 로그아웃을 누르기 전까지 그 PC에서 유지 (브라우저가 쿠키를 최대 400일까지만 지켜 줌)
export const ADMIN_TTL_SEC = 400 * 24 * 60 * 60;

const areaOf = (role: Role): Area => (role === 'admin' ? 'admin' : role === 'student' ? 'student' : 'staff');
const ttlOf = (role: Role) => (role === 'staff_pending' ? PENDING_TTL_SEC : role === 'admin' ? ADMIN_TTL_SEC : SESSION_TTL_SEC);
const cookieOpts = (): CookieOptions => ({ httpOnly: true, sameSite: 'strict', secure: isProd(), path: '/' });

/** 이 요청이 어느 구역의 쿠키를 써야 하는지 (먼저 볼 순서대로) */
function areasFor(req: Request): Area[] {
  const h = String(req.headers[AREA_HEADER] ?? '');
  // 학생 첫 화면(/)에 인솔자가 들어오면 인솔자 화면으로 보내 주기 위해 인솔자 쿠키도 본다
  if (h === 'student') return ['student', 'staff'];
  if (h === 'staff' || h === 'admin') return [h];
  // 헤더가 없으면 주소로 짐작
  const p = (req.originalUrl ?? req.url ?? '').split('?')[0];
  if (p.startsWith('/api/admin')) return ['admin'];
  if (p.startsWith('/api/staff') || p.startsWith('/api/auth/staff')) return ['staff'];
  if (p.startsWith('/api/student') || p.startsWith('/api/auth/student')) return ['student'];
  return ['student', 'staff', 'admin'];
}

@Injectable()
export class SessionService {
  constructor(private kv: KvService) {}

  async create(res: Response, s: Omit<AuthSession, 'createdAt'>): Promise<void> {
    const token = randomToken();
    const ttl = ttlOf(s.role);
    await this.kv.setJson(`sess:${token}`, { ...s, createdAt: Date.now() }, ttl);
    res.cookie(SESSION_COOKIES[areaOf(s.role)], token, { ...cookieOpts(), maxAge: ttl * 1000 });
  }

  /** 세션 내용을 바꾼다 (남은 시간은 처음 만든 시각 기준으로 유지) */
  async update(req: Request, s: AuthSession): Promise<void> {
    const token = req.cookies?.[SESSION_COOKIES[areaOf(s.role)]];
    if (typeof token !== 'string') return;
    const left = Math.max(1, Math.floor(ttlOf(s.role) - (Date.now() - s.createdAt) / 1000));
    await this.kv.setJson(`sess:${token}`, s, left);
  }

  /** 지금 화면의 로그인 세션 (없으면 null) */
  async get(req: Request): Promise<AuthSession | null> {
    return (await this.find(req))?.session ?? null;
  }

  /** 지금 화면의 로그인만 끝낸다 (다른 구역의 로그인은 그대로) */
  async destroy(req: Request, res: Response): Promise<void> {
    const found = await this.find(req);
    if (!found) return;
    await this.kv.del(`sess:${found.token}`);
    res.clearCookie(found.cookie, cookieOpts());
  }

  private async find(req: Request): Promise<{ session: AuthSession; token: string; cookie: string } | null> {
    for (const area of areasFor(req)) {
      const cookie = SESSION_COOKIES[area];
      const token = req.cookies?.[cookie];
      if (!token || typeof token !== 'string') continue;
      const session = await this.kv.getJson<AuthSession>(`sess:${token}`);
      // 쿠키 이름과 역할이 맞는지도 확인한다
      if (session && areaOf(session.role) === area) return { session, token, cookie };
    }
    return null;
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
