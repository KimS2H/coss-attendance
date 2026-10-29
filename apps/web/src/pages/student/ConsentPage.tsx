// S-02 동의 화면 (처음 로그인한 학생).
// 개인정보 동의는 꼭 필요하고, 위치정보 동의는 빼도 된다.
// 위치 동의를 안 하면 출석할 때 위치 없이(location: null) 보내고, 담당자 확인으로 처리한다.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import { IconPhone } from '../../components/Icons';
import { useStudent } from './context';
import { StudentHeader } from './StudentHeader';
import { saveLocationConsent } from './storage';

const CONSENT_VERSION = '2026-11-v1';

export default function ConsentPage() {
  const { me, setMe } = useStudent();
  const navigate = useNavigate();
  const [privacy, setPrivacy] = useState(false);
  const [location, setLocation] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError('');
    if (!privacy) return setError('개인정보 수집·이용에 동의해야 출석할 수 있어요.');
    setBusy(true);
    try {
      await api.post('/api/student/consents', { privacy: true, location, version: CONSENT_VERSION });
      saveLocationConsent(location);
      setMe({ ...me, needsConsent: false });
      navigate('/', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="st-page">
      <StudentHeader student={me.student}>
        <h1 style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 700 }}>처음 오셨네요</h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--on-dark)' }}>출석을 시작하기 전에 두 가지 동의가 필요해요.</p>
      </StudentHeader>

      <div className="st-body" style={{ paddingTop: 20 }}>
        {/* 개인정보 동의 */}
        <div className="st-consent-card">
          <label className="st-consent-check">
            <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
            <span>
              <span style={{ color: 'var(--navy)' }}>[필수]</span> 개인정보 수집·이용 동의
            </span>
          </label>
          <dl className="st-consent-dl">
            <dt>항목</dt>
            <dd>학번, 이름, 소속, 기기 정보, 출석 위치 판정 결과</dd>
            <dt>목적</dt>
            <dd>비교과 프로그램 출석 확인</dd>
            <dt>보유</dt>
            <dd>프로그램 종료 후 1년</dd>
          </dl>
          <button type="button" onClick={() => setShowPrivacy((v) => !v)} style={textBtn}>
            {showPrivacy ? '전문 닫기' : '전문 보기'}
          </button>
          {showPrivacy && (
            <p className="st-note" style={{ fontSize: 12 }}>
              IoT 혁신융합대학 비교과 프로그램 운영을 위해 학번, 이름, 소속(학교·단과대·학과), 출석에 사용한 기기 정보(브라우저 종류,
              기기 식별값의 해시), 출석 시각과 출석 장소까지의 거리 판정 결과를 수집합니다. 수집한 정보는 출석 확인과 출결 관리에만 쓰며,
              프로그램 종료 후 1년이 지나면 파기합니다. 동의를 거부할 수 있으나, 이 경우 출석체크 서비스를 이용할 수 없습니다.
            </p>
          )}
        </div>

        {/* 위치정보 동의 */}
        <div className="st-consent-card" style={{ gap: 10 }}>
          <label className="st-consent-check">
            <input type="checkbox" checked={location} onChange={(e) => setLocation(e.target.checked)} />
            <span>
              <span style={{ color: 'var(--navy)' }}>[필수]</span> 위치정보 이용 동의
            </span>
          </label>
          <p className="st-note" style={{ color: '#1e293b' }}>
            출석 버튼을 누를 때만 위치를 확인해요. 출석 장소까지의 거리만 남기고 좌표는 저장하지 않아요.
          </p>
          <button type="button" onClick={() => setShowLocation((v) => !v)} style={textBtn}>
            {showLocation ? '전문 닫기' : '전문 보기'}
          </button>
          {showLocation && (
            <p className="st-note" style={{ fontSize: 12 }}>
              출석 버튼을 누른 순간에만 휴대폰의 위치(GPS)를 한 번 확인하여, 출석 장소와의 거리가 허용 반경 안인지 판정합니다. 위도·경도
              좌표는 서버에 저장하지 않고 판정 결과와 거리(m)만 기록합니다. 기록은 프로그램 종료 후 1년이 지나면 파기합니다.
            </p>
          )}
        </div>

        {/* 기기 등록 안내 */}
        <div className="st-info-box">
          <div className="st-info-icon">
            <IconPhone size={20} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--navy-dark)' }}>이 기기가 출석 기기로 등록돼요</p>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--text-2)' }}>
              다른 기기로 출석하면 담당자 승인이 필요해요. 폰을 바꾸면 담당자에게 알려 주세요.
            </p>
          </div>
        </div>

        <p className="st-note" style={{ fontSize: 12 }}>
          위치 동의를 하지 않으면 강의실 코드와 담당자 확인으로 출석할 수 있어요.
        </p>

        {error && (
          <p className="st-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="st-bottom-bar">
        <button type="button" className="btn block" disabled={!privacy || busy} onClick={() => void submit()}>
          {busy ? '저장 중…' : '동의하고 시작'}
        </button>
      </div>
    </div>
  );
}

// "전문 보기" 글자 버튼 모양
const textBtn: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: 0,
  border: 0,
  background: 'none',
  color: 'var(--navy)',
  fontSize: 13,
  fontWeight: 500,
  textDecoration: 'underline',
  cursor: 'pointer',
  minHeight: 32,
};
