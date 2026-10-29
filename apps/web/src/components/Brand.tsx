// 서비스 이름과 로고 (NFR-UI-03). 모든 화면 상단에 쓴다.
export const SERVICE_NAME = '🎓 IoT 혁신융합대학 비교과 출석체크';
export const SERVICE_NAME_PLAIN = 'IoT 혁신융합대학 비교과 출석체크';

/** 흰 배지에 담긴 로고. size: 배지 한 변 길이(px) */
export function LogoBadge({ size = 36 }: { size?: number }) {
  const img = Math.round(size * 0.84);
  return (
    <span className="logo-badge" style={{ width: size, height: size, borderRadius: Math.round(size * 0.27) }}>
      <img src="/logo.png" alt="IoT COSS 로고" width={img} height={img} />
    </span>
  );
}

/** 휴대폰 상단용: 로고 + 두 줄 이름 */
export function BrandCompact() {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <LogoBadge size={32} />
      <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3, color: 'var(--on-dark)' }}>
        IoT 혁신융합대학
        <br />
        비교과 출석체크
      </span>
    </span>
  );
}

/** 노트북·PC 상단 막대용: 로고 + 한 줄 이름 */
export function BrandWide() {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 700, color: '#fff', minHeight: 44 }}>
      <LogoBadge size={36} />
      {SERVICE_NAME}
    </span>
  );
}
