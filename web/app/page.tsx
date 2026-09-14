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
    const msg = e instanceof Error ? e.message : 'Notion 데이터를 불러오지 못했습니다.';
    if (msg.includes('rate_limited') || msg.includes('rate limited')) {
      error = 'Notion 요청이 너무 많습니다. 2분 뒤 새로고침해 주세요.';
    } else if (msg.includes('notion_fetch_timeout') || msg.includes('timeout')) {
      error =
        'Notion 응답이 느립니다. 1~2분 뒤 새로고침하거나, GHA가 생성한 스냅샷 배포를 확인해 주세요.';
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
