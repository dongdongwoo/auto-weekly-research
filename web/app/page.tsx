import { getCachedDashboardData } from '@/lib/notion-cache';
import { Dashboard } from '@/components/Dashboard';

/** ISR — CDN 캐시 30분 */
export const revalidate = 1800;
export const dynamic = 'force-static';

export default async function HomePage() {
  let data;
  let error: string | null = null;

  try {
    data = await getCachedDashboardData();
  } catch (e) {
    const msg = e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.';
    if (msg.includes('dashboard.snapshot.json')) {
      error = '대시보드 스냅샷이 아직 없습니다. GitHub Actions 파이프라인 실행 후 다시 열어 주세요.';
    } else if (msg.includes('rate_limited') || msg.includes('rate limited')) {
      error = 'Notion 요청이 너무 많습니다. 2분 뒤 새로고침해 주세요.';
    } else {
      error = '데이터를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
    }
  }

  if (error || !data) {
    return (
      <main className="err">
        <div>
          <h1>잠시 뒤에 다시 열어 주세요</h1>
          <p>{error ?? '데이터를 불러오지 못했습니다.'}</p>
        </div>
      </main>
    );
  }

  return <Dashboard data={data} />;
}
