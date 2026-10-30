'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseSnapshotJson } from '@/lib/snapshot-parse';
import type { DashboardData } from '@/lib/types';

const Dashboard = dynamic(
  () => import('./Dashboard').then((m) => ({ default: m.Dashboard })),
  { ssr: false },
);

const SNAPSHOT_URL = '/dashboard.snapshot.json';
const RETRY_DELAYS_MS = [0, 1500, 4000, 8000, 15000, 30000];

type Props = {
  initialError: string | null;
};

/**
 * Vercel ISR/서버리스에서 fs.readFile 실패 등으로 SSR이 깨져도,
 * CDN의 dashboard.snapshot.json 으로 클라이언트에서 복구.
 */
export function DashboardRecovery({ initialError }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [phase, setPhase] = useState<'loading' | 'error'>('loading');
  const [detail, setDetail] = useState<string | null>(initialError);
  const attemptRef = useRef(0);
  const cancelledRef = useRef(false);

  const fetchSnapshot = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(SNAPSHOT_URL, { cache: 'no-store' });
      if (!res.ok) {
        setDetail(`스냅샷 HTTP ${res.status} — GHA export·배포 상태를 확인해 주세요.`);
        return false;
      }
      const parsed = parseSnapshotJson(await res.text());
      if (!parsed) {
        setDetail('스냅샷 JSON 형식이 올바르지 않습니다.');
        return false;
      }
      setData(parsed);
      setPhase('loading');
      return true;
    } catch {
      setDetail('스냅샷에 연결하지 못했습니다. 네트워크를 확인해 주세요.');
      return false;
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;

    async function loop() {
      while (!cancelledRef.current && attemptRef.current < 12) {
        const delay = RETRY_DELAYS_MS[Math.min(attemptRef.current, RETRY_DELAYS_MS.length - 1)];
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        if (cancelledRef.current) return;

        const ok = await fetchSnapshot();
        attemptRef.current += 1;
        if (ok) return;

        setPhase('error');
      }
    }

    void loop();
    return () => {
      cancelledRef.current = true;
    };
  }, [fetchSnapshot]);

  const retryNow = useCallback(async () => {
    setPhase('loading');
    setDetail(initialError);
    const ok = await fetchSnapshot();
    if (!ok) setPhase('error');
  }, [fetchSnapshot, initialError]);

  if (data) {
    return <Dashboard data={data} />;
  }

  if (phase === 'loading') {
    return (
      <main className="err">
        <div>
          <h1>대시보드 불러오는 중</h1>
          <p>
            서버 렌더링에 문제가 있어 <code>dashboard.snapshot.json</code>에서 직접 읽고 있습니다.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="err">
      <div>
        <h1>잠시 뒤에 다시 열어 주세요</h1>
        <p>{detail ?? initialError ?? '데이터를 불러오지 못했습니다.'}</p>
        <button
          type="button"
          style={{
            marginTop: 16,
            padding: '10px 18px',
            border: '1px solid var(--line)',
            borderRadius: 10,
            background: 'var(--card)',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
          onClick={() => void retryNow()}
        >
          지금 다시 시도
        </button>
      </div>
    </main>
  );
}
