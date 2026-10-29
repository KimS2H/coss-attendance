// 모든 요청 앞에서 도는 처리
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { config, isProd } from '../config';
import { randomToken, safeEqual } from './crypto';

export const DEVICE_COOKIE = 'did';

/**
 * 기기 식별 쿠키(did): 처음 온 브라우저에 임의 값을 준다 (400일).
 * 같은 폰·같은 브라우저로 다른 계정이 출석하면 이 값이 같아서 대리 출석을 알아챈다.
 */
@Injectable()
export class DeviceCookieMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    let did = req.cookies?.[DEVICE_COOKIE];
    if (typeof did !== 'string' || did.length < 20) {
      did = randomToken(24);
      res.cookie(DEVICE_COOKIE, did, { httpOnly: true, sameSite: 'lax', secure: isProd(), path: '/', maxAge: 400 * 24 * 3600 * 1000 });
      req.cookies = { ...(req.cookies ?? {}), [DEVICE_COOKIE]: did };
    }
    next();
  }
}

/**
 * 총관리자 API(/api/admin)는 Tailscale 관리자 입구(Nginx 관리자 포트)로 들어온 요청만 받는다.
 * Nginx 관리자 포트만 X-Admin-Gate 헤더에 비밀 값을 붙인다. 공개 포트는 /api/admin 자체를 막는다 (이중 잠금).
 * 개발 PC(NODE_ENV=development)에서는 검사하지 않는다.
 */
@Injectable()
export class AdminGateMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (!isProd()) return next();
    const secret = config().ADMIN_GATE_SECRET;
    const got = req.headers['x-admin-gate'];
    if (!secret || typeof got !== 'string' || !safeEqual(got, secret)) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '없는 주소예요.' } });
      return;
    }
    next();
  }
}
