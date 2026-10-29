// 화면 가운데 뜨는 창(대화상자). 바깥을 누르거나 Esc를 누르면 닫힌다.
import { useEffect } from 'react';

type Props = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number; // 최대 너비(px)
};

export function Modal({ title, onClose, children, width = 520 }: Props) {
  // Esc 키로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onMouseDown={(e) => {
        // 회색 바깥 부분을 눌렀을 때만 닫는다 (창 안쪽을 누르면 닫지 않음)
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,31,77,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 100,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: '100%',
          maxWidth: width,
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          background: '#fff',
          borderRadius: 18,
          padding: 22,
          boxShadow: '0 20px 50px rgba(15,31,77,0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: 'var(--navy-dark)' }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{ width: 40, height: 40, border: 0, background: 'transparent', fontSize: 22, cursor: 'pointer', color: 'var(--muted)' }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
