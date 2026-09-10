import type { Metadata } from 'next';
import { DASH_JS } from '@/lib/dash-js';
import './globals.css';

export const metadata: Metadata = {
  title: '주간 인사이트',
  description: '시간별 갱신되는 일일·주간 리서치 대시보드',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
        <script dangerouslySetInnerHTML={{ __html: DASH_JS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
