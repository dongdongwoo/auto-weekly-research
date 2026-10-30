import type { DashboardData } from './types';

/** public/dashboard.snapshot.json — 서버·클라이언트 공용 */
export function parseSnapshotJson(raw: string): DashboardData | null {
  try {
    const parsed = JSON.parse(raw) as DashboardData;
    if (!parsed.dailies || !parsed.weeklies) return null;
    return parsed;
  } catch {
    return null;
  }
}
