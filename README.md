# auto-weekly-research

매일 KST 09:00 — 전날 뉴스 수집 → Notion (월~일). **월요일** — 지난주 마감(일요일 일일) → 주간 인사이트 → **이번 주 페이지 생성** (화요일부터 일일 등록).

## 사용

```bash
npm install
cp .env.example .env   # OAuth + Notion 키
npm run morning        # 일일 (+ 월요일 주간)
```

| 명령              | 설명             |
| ----------------- | ---------------- |
| `npm run morning` | 일일 + (월) 주간·이번 주 페이지 생성 |
| `npm run collect` | 일일만           |
| `npm run weekly`  | 주간만           |

## Notion 구조

```
허브 페이지 (NOTION_PAGE_ID)
├── 📊 2026-W33 주간 (8/10 ~ 8/16)   ← 지난주 (완료)
│   ├── 📰 2026-08-10 ~ 08/16        ← 매일 (주말 포함)
│   └── 📊 주간 인사이트              ← 월요일 아침 마감
└── 📊 2026-W34 주간 (8/17 ~ 8/23)   ← 월요일 아침 생성, 화~일 일일 등록
    └── 📰 2026-08-18 ~ …
```

Integration을 허브 페이지에 연결해야 함.

## 자동 실행

**GitHub Actions** — push + Secrets 3개 (`CLAUDE_CODE_OAUTH_TOKEN`, `NOTION_API_KEY`, `NOTION_PAGE_ID`). 매일 KST 09:00.

## 파일 구조

```
src/
├── index.ts      # 진입점, morning/daily/weekly 분기
├── config.ts     # .env 로드
├── claude.ts     # Agent SDK (일일=WebSearch, 주간=원문만)
├── prompt.ts     # 일일·주간 프롬프트
├── notion.ts     # Notion 토글 추가
├── weekPage.ts   # 주간 하위 페이지 생성·ID 캐시
├── storage.ts    # data/daily/ 저장·읽기
├── kst.ts          # KST 날짜, ISO 주차
├── dedup.ts        # 1달 중복 제거
├── links.ts        # 출처 링크 검증
└── markdown.ts     # md → Notion 블록

data/daily/         # 일일 원문
data/weeks/         # 주간 Notion pageId
.github/workflows/  # Actions 스케줄
```
