// 로그인 없이 쓰는 API: 상태 확인, 학교 목록, 내 정보
import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { hashDevice } from '../common/crypto';
import { Errors } from '../common/errors';
import { KvService } from '../common/kv.service';
import { DEVICE_COOKIE } from '../common/middleware';
import { PrismaService } from '../common/prisma.service';
import { MeService } from './me.service';
import { Public, SessionService } from './session';

@Controller()
export class PublicController {
  constructor(
    private prisma: PrismaService,
    private kv: KvService,
    private sessions: SessionService,
    private meService: MeService,
  ) {}

  /** UptimeRobot·Docker가 서버 상태를 확인하는 주소 */
  @Public()
  @Get('health')
  async health() {
    let db = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'error';
    }
    const redis = (await this.kv.ping()) ? 'ok' : 'error';
    return { status: db === 'ok' && redis === 'ok' ? 'ok' : 'error', db, redis, time: new Date().toISOString() };
  }

  @Public()
  @Get('schools')
  async schools() {
    return this.prisma.school.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }

  @Public()
  @Get('me')
  async me(@Req() req: Request) {
    const s = await this.sessions.get(req);
    if (!s || s.role === 'staff_pending') throw Errors.unauthorized();
    if (s.role === 'student') {
      const me = await this.meService.student(s.id);
      const fp = hashDevice(req.cookies[DEVICE_COOKIE]);
      const dev = await this.prisma.device.findUnique({ where: { studentId_fingerprintHash: { studentId: s.id, fingerprintHash: fp } } });
      return { ...me, device: dev?.status === 'active' ? 'registered' : 'unregistered' };
    }
    if (s.role === 'staff') return this.meService.staff(s.id);
    const admin = await this.prisma.admin.findUniqueOrThrow({ where: { id: s.id } });
    return { role: 'admin', admin: { id: admin.id, username: admin.username } };
  }
}
