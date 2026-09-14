import { getCachedDashboardData } from '@/lib/notion-cache';
import { Dashboard } from '@/components/Dashboard';

/** ISR — CDN 캐시 30분. searchParams 쓰면 동적 렌더링되어 매 방문마다 Notion fetch → 타임아웃 */
export const revalidate = 1800;

export default async function HomePage() {
  let data;
  let error: string | null = null;

  try {
    data = await getCachedDashboardData();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Notion 데이터를 불러오지 못했습니다.';
    error =
      msg.includes('rate_limited') || msg.includes('rate limited')
        ? 'Notion 요청이 너무 많습니다. 2분 뒤 새로고침해 주세요.'
        : msg;
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
