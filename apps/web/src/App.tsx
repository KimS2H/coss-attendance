// 주소별 화면 연결.
//  /            학생 (로그인 화면은 학생·인솔자 공동)   → pages/student
//  /staff/*     인솔자                                 → pages/staff
//  /admin/*     총관리자 (Tailscale 관리자 입구에서만)  → pages/admin
import { Route, Routes } from 'react-router-dom';
import StudentRoutes from './pages/student';
import StaffRoutes from './pages/staff';
import AdminRoutes from './pages/admin';

export default function App() {
  return (
    <Routes>
      <Route path="/staff/*" element={<StaffRoutes />} />
      <Route path="/admin/*" element={<AdminRoutes />} />
      <Route path="/*" element={<StudentRoutes />} />
    </Routes>
  );
}
