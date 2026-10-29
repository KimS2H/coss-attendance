// 인솔자 화면들이 함께 쓰는 로그인 정보 (index.tsx의 StaffGate가 채워 준다).
import { useOutletContext } from 'react-router-dom';
import type { StaffInfo } from '../../api/types';

export type StaffContext = {
  staff: StaffInfo;
  /** 수정 권한이 있는지 (permission === 'edit'). 보기 권한이면 수정 버튼을 숨긴다 */
  canEdit: boolean;
  /** 위쪽 메뉴의 숫자(처리할 문의·승인 대기)를 다시 불러온다 */
  refreshCounts: () => void;
};

export function useStaff() {
  return useOutletContext<StaffContext>();
}
