// 숫자 4칸 입력 (학생 강의실 코드, 인솔자 학교 코드에 같이 쓴다).
// - 한 칸에 숫자를 넣으면 다음 칸으로 자동 이동
// - 빈 칸에서 지우기(Backspace)를 누르면 앞 칸으로 이동
// - 숫자 4자리를 붙여넣기 하면 4칸에 나눠 들어감
import { useEffect, useRef } from 'react';

type Props = {
  value: string; // 지금까지 입력한 숫자들 (예: "48")
  onChange: (value: string) => void;
  length?: number; // 칸 수 (기본 4)
  password?: boolean; // true면 ●로 가림 (학교 코드)
  autoFocus?: boolean;
  disabled?: boolean;
  height?: number; // 칸 높이(px)
  fontSize?: number;
  labelPrefix?: string; // 화면 낭독기용 이름 앞부분
  onEnter?: () => void; // 마지막 칸에서 Enter를 누르면
};

const ORDINAL = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째'];

export function DigitInputs({
  value,
  onChange,
  length = 4,
  password = false,
  autoFocus = false,
  disabled = false,
  height = 72,
  fontSize = 32,
  labelPrefix = '',
  onEnter,
}: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  // index 칸부터 숫자들을 채운다 (붙여넣기·자동완성 대응)
  function fillFrom(index: number, text: string) {
    const onlyDigits = text.replace(/\D/g, '');
    if (!onlyDigits) return;
    const arr = [...digits];
    let i = index;
    for (const ch of onlyDigits) {
      if (i >= length) break;
      arr[i] = ch;
      i++;
    }
    // 중간에 빈칸이 생기지 않도록 앞에서부터 이어 붙인다
    onChange(arr.join('').slice(0, length));
    refs.current[Math.min(i, length - 1)]?.focus();
  }

  function handleChange(index: number, raw: string) {
    const onlyDigits = raw.replace(/\D/g, '');
    if (onlyDigits.length === 0) {
      // 칸을 비움
      const arr = [...digits];
      arr[index] = '';
      onChange(arr.join(''));
      return;
    }
    if (onlyDigits.length > 1) {
      // 한 칸에 여러 숫자가 들어옴 (자동완성 등) → 여러 칸에 나눠 넣기
      // 이미 숫자가 있던 칸이면 새로 친 마지막 글자만 쓴다
      if (digits[index] && onlyDigits.length === 2) {
        fillFrom(index, onlyDigits.replace(digits[index], '') || onlyDigits.slice(-1));
      } else {
        fillFrom(index, onlyDigits);
      }
      return;
    }
    const arr = [...digits];
    arr[index] = onlyDigits;
    onChange(arr.join(''));
    if (index < length - 1) refs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      // 빈 칸에서 지우기 → 앞 칸을 지우고 그 칸으로 이동
      e.preventDefault();
      const arr = [...digits];
      arr[index - 1] = '';
      onChange(arr.join(''));
      refs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      refs.current[index + 1]?.focus();
    } else if (e.key === 'Enter' && onEnter) {
      onEnter();
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))`, gap: 10 }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type={password ? 'password' : 'text'}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={length} // 붙여넣기를 받기 위해 1보다 크게 둔다
          aria-label={`${labelPrefix}${ORDINAL[i] ?? `${i + 1}번째`} 자리`}
          value={d}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => {
            e.preventDefault();
            fillFrom(i, e.clipboardData.getData('text'));
          }}
          onFocus={(e) => e.target.select()}
          className="digit-box"
          style={{
            width: '100%',
            height,
            border: '2px solid var(--line-strong)',
            borderRadius: 14,
            textAlign: 'center',
            fontSize,
            fontWeight: 700,
            color: 'var(--navy-dark)',
            background: '#fff',
            padding: 0,
          }}
        />
      ))}
      {/* 지금 입력 중인 칸을 남색 테두리로 보여 준다 */}
      <style>{`.digit-box:focus{outline:none;border-color:var(--navy)!important;box-shadow:0 0 0 4px #dce6fb}`}</style>
    </div>
  );
}
