# auto-weekly-research

매일 KST 08:00 — 전날 뉴스 수집 → Notion (월~일). **월요일** — 지난주 마감(일요일 일일) → 주간 인사이트 → **이번 주 페이지 생성** (화요일부터 일일 등록).

**데이터는 Notion만 사용** — 로컬 `data/` 파일·git pull 불필요. 중복 제거·주간 인사이트 모두 Notion에서 읽습니다.

## 사용

```bash
npm install
cp .env.example .env   # OAuth + Notion 키
npm run morning        # 일일 (+ 월요일 주간)
```

| 명령              | 설명             |
| ----------------- | ---------------- |
| `npm run morning` | **매일 자동 실행용.** 일일 + (월요일만) 주간 인사이트·이번 주 페이지 |
| `npm run collect` | 일일만 (수동)    |
| `npm run weekly`  | 주간만 (수동)    |

## 스케줄 (KST 08:00, GitHub Actions = `npm run morning`)

| 요일 | 실행 내용 |
| ---- | --------- |
| **월** | ① 일요일 일일 → 지난주 페이지 · ② **주간 인사이트**(요약·전망·시사점) → 지난주 페이지 · ③ 이번 주 페이지 생성 |
| 화~일 | 전날 일일 리서치 → 해당 주 Notion 페이지 |

`--weekly` / `collect`는 **수동 재실행**용이고, Actions cron에는 `morning` 하나만 등록되어 있습니다.

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

**GitHub Actions** — push + Secrets 3개 (`CLAUDE_CODE_OAUTH_TOKEN`, `NOTION_API_KEY`, `NOTION_PAGE_ID`). 매일 KST 08:00.

## 파일 구조

```
src/
├── index.ts        # 진입점, morning/daily/weekly 분기
├── config.ts       # .env 로드
├── claude.ts       # Agent SDK (일일=WebSearch, 주간=원문만)
├── prompt.ts       # 일일·주간 프롬프트
├── notion.ts       # Notion 쓰기 (토글 추가)
├── notionRead.ts   # Notion 읽기 (중복·주간 입력)
├── weekPage.ts     # 주간 하위 페이지 찾기·생성
├── kst.ts          # KST 날짜, ISO 주차
├── dedup.ts        # 1달 중복 제거
├── links.ts        # 출처 링크 검증
└── markdown.ts     # md → Notion 블록

.github/workflows/  # Actions 스케줄
```
