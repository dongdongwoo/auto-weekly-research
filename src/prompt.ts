/** 프롬프트 2종: ① 일일 리서치  ② 주간 인사이트 */

const AXES = `
1. **RWA 토큰화 시장·인프라**: Securitize, Ondo, Franklin Templeton, Tokeny, ERC-3643, rwa.xyz 데이터
2. **상장주식·펀드·ETF 토큰화**: Ondo Global Markets, Backed xStocks, BUIDL/WTGXX, 24/7 거래·DvP
3. **TradFi → 온체인**: DTCC, SWIFT, 토큰화 예금, 기관 커스터디, SEC·MAS·ADGM·국내 STO
4. **AI × 금융·투자 경험**: agentic finance, AI 포트폴리오·운용 UX, 온체인 Vault·담보대출 자동화
5. **크립토 구조 트렌드**: 온체인 크레딧(Morpho, Maple), 스테이블코인 규제·결제 (단기 시세·밈코인 제외)`;

const LINK_RULE = `
## 출처 규칙 (필수 — 위반 시 출력 무효)
- 모든 사실·수치·발표는 반드시 웹 검색으로 확인한 **실제 URL**을 붙일 것
- 형식: **[헤드라인]** — 설명. 출처: [매체명](https://실제URL)
- 검색으로 확인되지 않은 내용, 추측, 기억에 의존한 서술은 **절대 쓰지 말 것**
- 같은 소식은 공식 블로그·규제기관·원문 보도 링크 우선
- 링크 없는 불릿 항목은 하나도 만들지 말 것`;

/** ① 매일 아침 — 전날(KST) 뉴스·자료 검색 + 분석 */
export function dailyPrompt(
  runDateHuman: string,
  newsDateHuman: string,
  newsDateIso: string,
  knownItemsSummary: string
): string {
  return `오늘 ${runDateHuman} 아침이다. **${newsDateHuman} (${newsDateIso}, KST 하루)** 동안 나온 뉴스·자료만 웹 검색으로 수집하고 분석해줘.
다른 날짜 소식은 포함하지 마.

## 이미 수집한 자료 (중복 금지)
아래 URL·헤드라인과 **같은 소식·같은 기사**는 절대 다시 넣지 마. URL이 다르더라도 내용이 같으면 제외.
${knownItemsSummary}

## 조사 범위 (5개 축 — 축별 0~3건, 해당 없으면 "- 해당 없음")
${AXES}

## 출력 형식 (마크다운)
- 맨 위에 "## ${newsDateIso} 일일 리서치" 헤딩
- 축별 "## 축 이름" 헤딩 아래 불릿
- 각 건:
  - **[헤드라인]** — 무슨 일인지 1~2문장
  - **분석** — 왜 중요한지, 업계에 어떤 의미인지 1~2문장
  - **출처**: [매체명](URL)
- 신규 소식이 전혀 없으면 "## 요약"에 "신규 항목 없음" 한 줄만
- 마지막 "## 참고 출처" — **이번에 새로 추가한** URL만 불릿 (중복 제거)
${LINK_RULE}
- 다른 인사말 없이 본문만 출력`;
}

/** ② 금요일 아침 — 월~금 일일 리서치 원문 기반 주간 인사이트 */
export function weeklyInsightPrompt(
  runDateHuman: string,
  weekId: string,
  newsDates: string[],
  dailyLogs: { iso: string; content: string }[]
): string {
  const corpus = dailyLogs
    .map((d) => `### ${d.iso} 일일 리서치\n${d.content}`)
    .join('\n\n');

  const missing = newsDates.filter((d) => !dailyLogs.some((l) => l.iso === d));

  return `오늘 ${runDateHuman} 금요일 아침이다. 아래는 ${weekId} 주차 **월~금(${newsDates.join(', ')})** 일일 리서치 원문이다.
이 원문만 근거로 **팀 공유용 주간 인사이트**를 작성해줘. **새로운 웹 검색·외부 지식 추가 금지.**

${missing.length > 0 ? `⚠️ 수집본 없는 날짜: ${missing.join(', ')} (해당 날짜 언급 금지)\n` : ''}
---
${corpus || '(수집본 없음)'}
---

## 작성 규칙 (할루시네이션 방지)
- 위 일일 리서치에 **실제로 적힌 사실만** 사용. 원문에 없는 주장·수치·회사명 추가 금지
- 모든 불릿에 원문과 동일한 출처 링크 [매체명](URL) 포함
- 해석·시사점도 근거 링크 필수 (예: "→ [근거: Ondo 발표](URL)")

## 출력 형식 (마크다운)
- "## ${weekId} 주간 인사이트" 헤딩
- "## 이번 주 한 줄 요약" — 2~3문장
- "## 주요 이슈" — 축별 핵심 3~5건, 링크 필수
- "## 해석 · 관점" — 이번 주 흐름을 관통하는 인사이트 3~5개, 근거 링크 필수
- "## 담당 프로덕트 시사점" — Vault·담보대출 관점 3~5개, 근거 링크 필수
- "## 참고 출처 전체" — 인용 URL 불릿 목록 (중복 제거)
- 다른 인사말 없이 본문만 출력`;
}

export function monthlyPrompt(todayKst: string): string {
  return `오늘은 ${todayKst}이다. 이번 달 발행된 토큰화 관련 기관 보고서(BIS, IMF, JPM, DTCC, 대형 운용사, CoinGecko/RedStone/Gauntlet 리서치 등)를 웹 검색으로 찾아줘.

## 출력 형식 (마크다운)
- "## 이번 달 보고서 목록": 찾은 보고서를 불릿 목록으로 (제목, 발행처, [링크](URL))
- "## 딥다이브": 그중 가장 중요한 1개를 골라 —
  - "### 핵심 주장 5개" (불릿, 각각 출처 링크)
  - "### 우리 관점 시사점 3개" (Vault·담보대출 관점, 근거 링크)
${LINK_RULE}
- 다른 인사말 없이 본문만 출력`;
}
