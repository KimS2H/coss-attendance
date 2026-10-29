// 잠깐 저장했다가 사라져도 되는 값 (로그인 세션 3시간, 요청 횟수 세기).
// 서버 PC에서는 Redis에, REDIS_URL이 비어 있으면(개발·테스트) 메모리에 저장한다.
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { config } from '../config';

interface Store {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  del(key: string): Promise<void>;
  /** 1 증가시키고 새 값을 돌려준다. 처음 만들 때 ttl을 건다 */
  incr(key: string, ttlSec: number): Promise<number>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

class MemoryStore implements Store {
  private map = new Map<string, { v: string; exp: number }>();
  private alive(key: string) {
    const e = this.map.get(key);
    if (!e) return null;
    if (e.exp < Date.now()) {
      this.map.delete(key);
      return null;
    }
    return e;
  }
  async get(key: string) {
    return this.alive(key)?.v ?? null;
  }
  async set(key: string, v: string, ttlSec: number) {
    this.map.set(key, { v, exp: Date.now() + ttlSec * 1000 });
  }
  async del(key: string) {
    this.map.delete(key);
  }
  async incr(key: string, ttlSec: number) {
    const e = this.alive(key);
    const n = (e ? Number(e.v) : 0) + 1;
    this.map.set(key, { v: String(n), exp: e ? e.exp : Date.now() + ttlSec * 1000 });
    return n;
  }
  async ping() {
    return true;
  }
  async close() {}
}

class RedisStore implements Store {
  constructor(private r: Redis) {}
  get(key: string) {
    return this.r.get(key);
  }
  async set(key: string, v: string, ttlSec: number) {
    await this.r.set(key, v, 'EX', ttlSec);
  }
  async del(key: string) {
    await this.r.del(key);
  }
  async incr(key: string, ttlSec: number) {
    const n = await this.r.incr(key);
    if (n === 1) await this.r.expire(key, ttlSec);
    return n;
  }
  async ping() {
    try {
      return (await this.r.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
  async close() {
    this.r.disconnect();
  }
}

@Injectable()
export class KvService implements OnModuleDestroy {
  private readonly store: Store;
  readonly kind: 'redis' | 'memory';

  constructor() {
    const url = config().REDIS_URL;
    if (url) {
      this.store = new RedisStore(new Redis(url, { maxRetriesPerRequest: 2 }));
      this.kind = 'redis';
    } else {
      this.store = new MemoryStore();
      this.kind = 'memory';
      new Logger('Kv').warn('REDIS_URL이 없어 메모리에 저장합니다 (개발·테스트 전용).');
    }
  }

  get = (k: string) => this.store.get(k);
  set = (k: string, v: string, ttl: number) => this.store.set(k, v, ttl);
  del = (k: string) => this.store.del(k);
  incr = (k: string, ttl: number) => this.store.incr(k, ttl);
  ping = () => this.store.ping();

  async getJson<T>(k: string): Promise<T | null> {
    const v = await this.store.get(k);
    return v ? (JSON.parse(v) as T) : null;
  }
  setJson(k: string, v: unknown, ttl: number) {
    return this.store.set(k, JSON.stringify(v), ttl);
  }

  /** 요청 횟수 제한: windowSec 동안 limit번 넘게 부르면 false */
  async allow(key: string, limit: number, windowSec: number): Promise<boolean> {
    const n = await this.store.incr(`rl:${key}`, windowSec);
    return n <= limit;
  }

  onModuleDestroy() {
    return this.store.close();
  }
}
