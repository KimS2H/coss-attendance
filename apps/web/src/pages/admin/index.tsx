// ─────────────────────────────────────────────
// 총관리자 화면 주소 연결 (/admin 아래).
//   /admin/setup   첫 설정 (계정 → 이메일)
//   /admin/login   로그인 (아이디·비밀번호, Tailscale 기기에서만)
//   /admin/code/:id 강의실 코드 (프로젝터용 전체 화면, 메뉴 없음)
//   /admin/...     아래 화면들은 로그인한 총관리자만 (AdminLayout 이 검사)
// ─────────────────────────────────────────────
import { Navigate, Route, Routes } from 'react-router-dom';
import '../../components/admin/admin.css';
import AdminLayout from './AdminLayout';
import SetupPage from './SetupPage';
import LoginPage from './LoginPage';
import DashboardPage from './DashboardPage';
import AttendancePage from './AttendancePage';
import ChangeRequestsPage from './ChangeRequestsPage';
import SupportPage from './SupportPage';
import DevicesPage from './DevicesPage';
import AccountsPage from './AccountsPage';
import SessionsPage from './SessionsPage';
import ImportPage from './ImportPage';
import SettingsPage from './SettingsPage';
import CodePage from './CodePage';

export default function AdminRoutes() {
  return (
    <Routes>
      <Route path="setup" element={<SetupPage />} />
      <Route path="login" element={<LoginPage />} />
      {/* 프로젝터용 코드 화면은 위쪽 메뉴 없이 전체 화면 */}
      <Route path="code/:sessionId" element={<CodePage />} />
      {/* 아래는 상단 메뉴가 있는 화면. AdminLayout 이 먼저 로그인 여부를 확인한다 */}
      <Route element={<AdminLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="change-requests" element={<ChangeRequestsPage />} />
        <Route path="support" element={<SupportPage />} />
        <Route path="devices" element={<DevicesPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
