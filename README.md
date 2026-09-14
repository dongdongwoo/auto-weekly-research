# auto-weekly-research

**1시간마다** 오늘(KST) 뉴스를 증분 수집하고, **데일리/주간 급등 스냅샷**을 Notion에 저장합니다. **주간 인사이트**는 KST 09:00에 초안 → 웹 검색 검증 후 갱신합니다. 노션은 저장소, **웹 대시보드(Vercel)** 는 Notion 읽기 전용입니다.

날짜 경계는 **KST 00:00**. 자정 런에서 오늘 날짜 데일리가 새로 열리고, 이후 23시간은 그 토글에 기사를 보탭니다. 예전처럼 아침 한 번 전날을 긁는 주기는 없습니다.

## 사용

```bash
npm install
cp .env.example .env   # OAuth + Notion 키
npm run hourly         # 시간별 자동 실행용
```

| 명령              | 설명 |
| ----------------- | ---- |
| `npm run hourly`  | **자동 실행용.** 오늘 증분 수집 + 트렌드 스냅샷. KST 09:00에 주간 인사이트 갱신. KST 00시면 새 데일리 토글 생성 |
| `npm run trends`  | 트렌드 스냅샷만 갱신 (수집 없음, 수동) |
| `npm run collect` | 오늘 하루 전체 수집만 (수동) |
| `npm run weekly`  | **이번 주** 인사이트 강제 재작성 |
| `npm run weekly -- --last-week` | **지난주** 인사이트 재작성 |
| `npm run weekly -- --date 2026-09-10` | 해당 날짜가 속한 주 재작성 |
| `npm run weekly -- --last-week --fresh` | 지난주, **기존 초안 무시**하고 처음부터 |
| `npm run morning` | 오늘 전체 수집 + 이번 주 인사이트 강제 갱신 (수동) |

## 스케줄 (GitHub Actions = `npm run hourly`)

매시 KST 정각. GitHub cron은 UTC `0 * * * *` 이라 KST도 매시 00분에 맞춰집니다. KST 00:00 = UTC 15:00.

| 시각 | 실행 |
| ---- | ---- |
| **KST 00:00** | 오늘 날짜 데일리 토글 생성 → 오늘 증분 수집 → 트렌드 스냅샷 |
| KST 01:00–08:00 | 오늘 증분 수집 → (신규 있으면) 데일리 급등 갱신 → 주간 상위 갱신 |
| **KST 09:00** | 위 + **주간 인사이트** 갱신 |
| KST 10:00–23:00 | 오늘 증분 수집 → 트렌드 스냅샷 (주간 인사이트는 유지) |

월요일 00시면 새 ISO 주 페이지도 함께 열립니다.

주간 인사이트는 월요일 마감 문서가 아니라 **이번 주 살아있는 브리프**입니다. 월~현재까지 쌓인 일일을 통합하고, 검증 단계에서 수치·날짜·당사자를 웹 검색으로 교차확인합니다.

## Notion 구조

```
허브 페이지 (NOTION_PAGE_ID)
├── 📊 2026-W37 주간 (9/7 ~ 9/13)
│   ├── 📰 2026-09-08            ← 시간마다 신규 기사 병합
│   ├── 📰 2026-09-09
│   ├── 📈 데일리 급등 · 2026-09-09
│   ├── 📈 주간 상위 · 2026-W37
│   └── 📊 주간 인사이트 · 2026-09-10 09:00 KST  ← KST 09:00 갱신
└── 📊 2026-W38 …
```

Integration을 허브 페이지에 연결해야 함.

## 주간 인사이트 구성 (대시보드)

노션용으로 줄이지 않습니다. 섹션:

1. **이번 주 브리프** — 흐름 4~7문장, 업데이트 시각, 신뢰도 총평
2. **핵심 시그널** — 수치·당사자 중심 3~6개
3. **주요 이슈** — 사실 / 교차검증 / 분석 / 왜 주목 / 신뢰도 / 출처 (5~8개)
4. **이번 주 흐름** — 여러 이슈가 같이 가리키는 방향
5. **시나리오 · 주시** — 기본 / 상방 / 하방 / 주시
6. **담당 프로덕트** — 기술·규제·비즈니스·기회·리스크·액션 (관련 라인만)
7. **미확인 · 주의** — 검증 안 된 주장

분석은 두 단계입니다. ① 일일 원문만으로 초안 ② 웹 검색으로 팩트체크. 일일에 없는 새 이슈는 검증 단계에서 넣지 않습니다.

## 웹 대시보드 (`web/`)

```bash
cd web
cp .env.example .env.local   # NOTION_API_KEY, NOTION_PAGE_ID (루트 .env와 동일)
npm install
npm run dev                  # http://localhost:3000
```

**Vercel 배포** (저장소 **루트**에서 배포 — Root Directory 비워두거나 `.`)

1. 배포 시간이 **2~3초**면 Next.js 빌드가 안 된 것. 정상은 **30초~1분+**
2. Vercel **환경 변수 불필요** — `public/dashboard.snapshot.json` 만 읽음 (GHA가 매시 커밋)
3. LLM·Notion 키는 **GitHub Actions Secrets** 전용

데이터 흐름: GHA 매시 `collect → trends → export:dashboard → git push` → Vercel 자동 배포. ISR 30분 (`revalidate = 1800`).

탭: **이번 주**(살아있는 인사이트) · **데일리** · **아카이브**(지난 주)

## 자동 실행

**GitHub Actions** — Secrets 3개 (`CLAUDE_CODE_OAUTH_TOKEN`, `NOTION_API_KEY`, `NOTION_PAGE_ID`). 매시 `npm run hourly` 후 `export:dashboard`로 스냅샷 커밋·푸시.

로컬에서 스냅샷만 갱신: `npm run export:dashboard` (루트 `.env`의 Notion 키 사용)

## 파일 구조

```
src/
├── index.ts        # hourly / daily / weekly / morning
├── prompt.ts       # 일일·증분·주간 초안·검증 프롬프트
├── claude.ts       # Agent SDK (수집=검색, 초안=원문, 검증=검색)
├── notion.ts       # 쓰기 · 주간 upsert · 일일 토글 병합
├── notionRead.ts   # 읽기 (중복·주간 초안)
├── weekPage.ts     # 주간 하위 페이지
├── kst.ts          # KST 날짜·시각
├── dedup.ts        # 1달 + 당일 중복 제거
├── links.ts        # 출처 링크 검증
└── markdown.ts     # md → Notion 블록

.github/workflows/hourly.yml
```
