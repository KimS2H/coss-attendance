// 학생 화면들이 함께 쓰는 로그인 정보 (index.tsx의 StudentGate가 채워 준다).
import { useOutletContext } from 'react-router-dom';
import type { StudentMe } from '../../api/types';

export type StudentContext = {
  me: StudentMe;
  setMe: (me: StudentMe) => void;
};

/** 학생 화면 안에서 로그인 정보를 꺼내 쓴다 */
export function useStudent() {
  return useOutletContext<StudentContext>();
}
