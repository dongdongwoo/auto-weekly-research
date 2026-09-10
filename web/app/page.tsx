import { getCachedDashboardData } from '@/lib/notion-cache';
import { Dashboard } from '@/components/Dashboard';

export const revalidate = 1800;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
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
          <p>{error}</p>
        </div>
      </main>
    );
  }

  const { q } = await searchParams;
  return <Dashboard data={data} initialQuery={q ?? ''} />;
}
