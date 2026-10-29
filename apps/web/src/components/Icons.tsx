// 화면에서 쓰는 작은 아이콘(SVG) 모음. 색은 글자색(currentColor)을 따라간다.
type P = { size?: number; strokeWidth?: number };

function Svg({ size = 20, strokeWidth = 2, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: 'none' }}
    >
      {children}
    </svg>
  );
}

/** 말풍선 + 물음표 (문의) */
export const IconHelp = (p: P) => (
  <Svg {...p}>
    <path d="M21 12a8 8 0 0 1-11.8 7L4 20.5l1.5-5A8 8 0 1 1 21 12z" />
    <path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.8c0 1.6-2.4 2.2-2.4 3.4" />
    <path d="M12 16.5h.01" />
  </Svg>
);

/** 로그아웃 */
export const IconLogout = (p: P) => (
  <Svg {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </Svg>
);

/** 위치 핀 */
export const IconPin = (p: P) => (
  <Svg {...p}>
    <path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" />
    <circle cx="12" cy="10" r="2.5" />
  </Svg>
);

/** 위치 핀 + 느낌표 (위치 실패) */
export const IconPinAlert = (p: P) => (
  <Svg {...p}>
    <path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" />
    <path d="M12 7v4" />
    <path d="M12 14h.01" />
  </Svg>
);

/** 시계 */
export const IconClock = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

/** 체크 */
export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="M5 12l5 5L20 7" />
  </Svg>
);

/** 휴대폰 */
export const IconPhone = (p: P) => (
  <Svg {...p}>
    <rect x="6" y="2" width="12" height="20" rx="2" />
    <path d="M11 18h2" />
  </Svg>
);

/** 경고 삼각형 */
export const IconWarning = (p: P) => (
  <Svg {...p}>
    <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </Svg>
);

/** 뒤로 (왼쪽 꺾쇠) */
export const IconBack = (p: P) => (
  <Svg {...p}>
    <path d="M15 18l-6-6 6-6" />
  </Svg>
);

/** X (닫기·실패) */
export const IconX = (p: P) => (
  <Svg {...p}>
    <path d="M18 6L6 18" />
    <path d="M6 6l12 12" />
  </Svg>
);

/** 자물쇠 (2차 인증) */
export const IconLock = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Svg>
);

/** 프로젝터·화면 (강의실 코드 띄우기) */
export const IconScreen = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="4" width="20" height="13" rx="2" />
    <path d="M8 21h8" />
    <path d="M12 17v4" />
  </Svg>
);

/** 다운로드 */
export const IconDownload = (p: P) => (
  <Svg {...p}>
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M5 21h14" />
  </Svg>
);
