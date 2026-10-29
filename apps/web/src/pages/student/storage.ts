// 학생 화면이 이 기기(브라우저)에 기억해 두는 값들.
import { storageGet, storageSet } from '../../components/hooks';

/** "사용자 저장"에 체크하면 다음 로그인 때 미리 채워 줄 정보 */
export type SavedUser = { role: 'student' | 'staff'; schoolId: number; idNo: string; name: string };

const USER_KEY = 'coss.savedUser';
const LOCATION_KEY = 'coss.locationConsent';

export const loadSavedUser = () => storageGet<SavedUser>(USER_KEY);
export const saveUser = (u: SavedUser | null) => storageSet(USER_KEY, u);

/** 위치정보 동의 여부. 기록이 없으면(다른 기기에서 동의한 경우 등) 동의한 것으로 본다 */
export const loadLocationConsent = () => storageGet<boolean>(LOCATION_KEY) ?? true;
export const saveLocationConsent = (v: boolean) => storageSet(LOCATION_KEY, v);
