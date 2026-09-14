import type { Metadata, Viewport } from 'next';
import { DASH_JS } from '@/lib/dash-js';
import './globals.css';

export const metadata: Metadata = {
  title: '주간 인사이트',
  description: 'GitHub Actions로 수집·분석하고 Notion에서 읽는 일일·주간 리서치 대시보드',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
