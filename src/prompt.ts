/** 프롬프트 2종: ① 일일 리서치  ② 주간 인사이트 */

const AXES = `
1. **RWA 토큰화 시장·인프라**: Securitize, Ondo, Franklin Templeton, Tokeny, ERC-3643, rwa.xyz 데이터
2. **상장주식·펀드·ETF 토큰화**: Ondo Global Markets, Backed xStocks, BUIDL/WTGXX, 24/7 거래·DvP
3. **TradFi → 온체인**: DTCC, SWIFT, 토큰화 예금, 기관 커스터디, SEC·MAS·ADGM·국내 STO
4. **AI × 금융·투자 경험**: agentic finance, AI 포트폴리오·운용 UX, 온체인 Vault·담보대출 자동화
5. **크립토 구조 트렌드**: 온체인 크레딧(Morpho, Maple), 스테이블코인 규제·결제 (단기 시세·밈코인 제외)`;

const DAILY_FORMAT_EXAMPLE = `
## RWA 토큰화 시장·인프라

### Securitize, Neuberger Berman과 토큰화 하이일드 펀드 'HINC' 출시
**요약** · Securitize가 Neuberger Berman과 협력해 Avalanche 기반 토큰화 하이일드 펀드를 출시했다.
**분석** · 기관급 하이일드가 온체인으로 확장되는 신호로, RWA 인프라 성숙도를 보여준다.
**출처** · [The Block](https://example.com/article)

### (다음 기사 — 동일 형식 반복)
**요약** · ...
**분석** · ...
**출처** · [매체명](https://실제URL)`;

const LINK_RULE = `
## 출처 규칙 (필수 — 위반 시 출력 무효)
- 모든 사실·수치·발표는 웹 검색으로 확인한 **실제 URL** 필수
- **출처** 줄에 [매체명](https://실제URL) 형식으로 1개 이상
- 검색으로 확인되지 않은 내용, 추측, 기억에 의존한 서술 금지
- 같은 소식은 공식 블로그·규제기관·원문 보도 링크 우선`;

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
아래 URL·헤드라인과 **같은 소식·같은 기사**는 절대 다시 넣지 마.
${knownItemsSummary}

## 조사 범위 (5개 축 — 축별 0~5건, 해당 없으면 "- 해당 없음")
- **축당 1건만 고르지 말 것.** 관련 뉴스가 여러 건이면 **기사마다 ### 블록**을 따로 작성
- 중요도 순, 확인된 소식은 빠짐없이 (최대 5건/축)
- 하루 전체 **총 15~25건** 목표
${AXES}

## 출력 형식 (마크다운 — 아래 예시를 **정확히** 따를 것)

### 금지
- \`## ${newsDateIso} 일일 리서치\` 같은 날짜 제목 **쓰지 말 것**
- 한 줄에 요약+분석+출처 **몰아넣지 말 것**
- \`**[헤드라인]** — ...\` 불릿 형식 **쓰지 말 것**
- "## 참고 출처" 섹션 **금지**

### 필수 구조
1. 축마다 \`## 축 이름\` 헤딩
2. 기사마다 \`### 헤드라인\` (대괄호·볼드 없이 plain text)
3. **반드시 아래 3줄을 각각 별도 줄**로 (순서 고정, \`**요약** ·\` / \`**분석** ·\` / \`**출처** ·\` 접두어 사용):
   - **요약** · 무슨 일인지 1~2문장 (짧게)
   - **분석** · 왜 중요한지 1~2문장 (짧게)
   - **출처** · [매체명](URL)

### 출력 예시
${DAILY_FORMAT_EXAMPLE}

- 해당 축에 신규 없으면: \`- 해당 없음\` 한 줄만
- 전체 신규 없으면: \`## 요약\` 아래 \`- 신규 항목 없음\`
${LINK_RULE}
- 다른 인사말 없이 본문만 출력`;
}

/** ② 월요일 아침 — 월~일 일일 리서치 원문 기반 주간 인사이트 */
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

  return `오늘 ${runDateHuman} 월요일 아침이다. 아래는 ${weekId} 주차 **월~일(${newsDates.join(', ')})** 일일 리서치 원문이다.
이 원문만 근거로 **팀 공유용 주간 인사이트**를 작성해줘. **새로운 웹 검색·외부 지식 추가 금지.**

${missing.length > 0 ? `⚠️ 수집본 없는 날짜: ${missing.join(', ')} (해당 날짜 언급 금지)\n` : ''}
---
${corpus || '(수집본 없음)'}
---

## 작성 규칙 (할루시네이션 방지)
- 위 일일 리서치에 **실제로 적힌 사실만** 사용
- 모든 항목에 원문과 동일한 출처 링크 [매체명](URL) 포함

## 출력 형식 (마크다운)
- "## ${weekId} 주간 인사이트" 헤딩 **쓰지 말 것**
- "## 이번 주 한 줄 요약" — 2~3문장 (짧은 문단)
- "## 주요 이슈" — 이슈마다 ### 제목 + **요약** · / **분석** · / **출처** · (각각 별도 줄)
- "## 해석 · 관점" — ### 소제목 + **내용** · / **근거** · [링크](URL)
- "## 다음 주 전망 · 주시 포인트" — ### 소제목 + **전망** · / **근거** · [링크](URL) (3~5개, 이번 주 흐름에서 도출)
- "## 담당 프로덕트 시사점" — ### 소제목 + **시사점** · / **근거** · [링크](URL)
- 한 줄에 여러 필드 몰아넣지 말 것
- "## 참고 출처" 섹션 금지
- 다른 인사말 없이 본문만 출력`;
}

export function monthlyPrompt(todayKst: string): string {
  return `오늘은 ${todayKst}이다. 이번 달 발행된 토큰화 관련 기관 보고서(BIS, IMF, JPM, DTCC, 대형 운용사, CoinGecko/RedStone/Gauntlet 리서치 등)를 웹 검색으로 찾아줘.

## 출력 형식 (마크다운)
- "## 이번 달 보고서 목록": 보고서마다 ### 제목 + **발행처** · / **출처** · [링크](URL)
- "## 딥다이브": ### 보고서명 + **핵심 주장** · (5개, 각각 별도 ### 또는 불릿) + **시사점** · (3개)
${LINK_RULE}
- 다른 인사말 없이 본문만 출력`;
}
