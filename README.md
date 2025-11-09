-----

## 🚀 프로젝트 '웹소설 생성기' Vercel 아키텍처 가이드라인

### 1\. 📂 공통 및 프로젝트 관리 규칙

  * **파일 분리:** 유지/보수를 위해 파일을 기능별로 분리합니다. 코드의 줄 수가 한 파일당 1000줄을 넘지 않도록 노력하며, 가급적 500줄 이하를 유지합니다. (**Vercel의 서버리스 함수는 이 원칙에 완벽히 부합합니다.**)
  * **주석 (파일 경로):** 모든 `.js`, `.html`, `.css` 파일의 첫 번째 줄에는 주석으로 파일의 전체 경로와 이름을 명시합니다. (예: `// /api/generate.js`)
  * **주석 (TODO):** `TODO` 주석 작성 시, 단순히 '구현 예정'이 아닌, **구현할 로직을 자연어로 상세히 설명**합니다. 논리적 오류나 미해결 부분에도 `TODO`를 남깁니다.
  * **언어:** 모든 주석, UI 텍스트, 로그, 응답 메시지는 **한국어**로 통일합니다.
  * **코드 재사용:** 반복적으로 쓰이는 기능(예: 유틸리티 함수)은 별도 모듈로 분리하여 여러 곳에서 `import`하여 사용할 수 있도록 설계합니다.
  * **문서 충돌:** `README.md`와 실제 코드가 충돌할 시, **항상 최신 코드를 우선**으로 판단합니다.
  * **타임스탬프:** `createdAt`, `updatedAt` 등 모든 시간 관련 필드는 **Firestore 타임스탬프 또는 ISO 8601 문자열**로 형식을 통일합니다. (데이터 처리 방식에 따라 선택)

-----

### 2\. 🔒 백엔드 및 아키텍처 규칙 (Vercel로 강화)

  * **호스팅 및 배포:**
      * 호스팅 제공업체는 **Vercel**을 사용합니다.
      * 배포는 GitHub Actions가 아닌, **Vercel의 내장 GitHub 연동 기능**을 사용합니다. (`main` 브랜치 `push` 시 자동 배포)
  * **백엔드 런타임:**
      * Firebase v2 함수 대신, \*\*Vercel 서버리스 함수 (Node.js 런타임)\*\*를 사용합니다.
      * 모든 백엔드 로직은 **`/api` 폴더** 안에 위치시킵니다. (예: `/api/generate.js`, `/api/user.js`)
  * **백엔드 리전 (중요):**
      * Firebase의 `asia-northeast3` 대신, \*\*Vercel의 `icn1` (서울/인천 리전)\*\*을 기본 리전으로 설정하여 응답 속도를 최적화합니다.
      * **적용 방법:** 프로젝트 루트에 `vercel.json` 파일을 생성하고 다음 코드를 추가합니다.
        ```json
        {
          "regions": ["icn1"]
        }
        ```
  * **인증 (매우 중요):**
      * Google 로그인 대신, 우리가 논의한 **"경비실 문 열쇠" (개인용 Secret Key) 인증**을 사용합니다.
      * 모든 `/api` 요청은 프론트엔드에서 `x-my-secret-key` (혹은 유사한 이름) 헤더를 포함해야 합니다.
      * 모든 서버리스 함수는 **가장 먼저** 이 헤더의 값을 `process.env.MY_SECRET_KEY`와 비교하여, **일치하지 않으면 즉시 401 Unauthorized 에러를 반환**합니다.
  * **API 키 보안:**
      * `GEMINI_API_KEY`, `NOVELAI_API_KEY` 등 모든 외부 API 키는 **절대** 프론트엔드 코드에 포함시키지 않습니다.
      * 모든 키는 \*\*Vercel 대시보드의 "Environment Variables"\*\*에만 저장하며, 서버리스 함수 내에서 `process.env`를 통해서만 접근합니다.
  * **AI 모델 처리:**
      * **NovelAI**: 항상 **최신/최상 모델** 사용 (환경변수 `NOVELAI_MODEL`로 관리, 기본값: `erato`)
      * **모델별 역할**:
        - SKETCH (스케치/간단 질의): `gemini-2.5-flash-lite`
        - J_DRAFT/J_POLISH (본문 초안/다듬기): `NovelAI Erato 모델` - **일본어**
        - TRANSLATE_KO (번역): `gemini-2.5-pro` - 일본어 → 한국어
      * **재시도 로직**: 429/5xx 오류 시 지수 백오프 (1s → 2s → 4s, 최대 3회)
      * AI가 생성할 필요 없는 고정 필드(예: `id`, `createdAt`, `authorId`)는 **반드시 서버리스 함수 내에서** 처리하여 JSON에 추가합니다.
      * 모든 AI 생성 요청에 **안전 필터(Safety Settings)** 적용합니다.
  * **데이터베이스 (Firestore 연동 시):**
      * **만약 Vercel 함수에서 Firestore DB를 연동해 사용한다면**, Firestore 트랜잭션 규칙(**"all reads before all writes"**)을 **동일하게 준수**해야 합니다. (이는 Firestore 고유의 규칙이므로 플랫폼과 무관하게 적용됩니다.)
  * **환경 변수:**
      * Vercel 대시보드의 "Environment Variables"에 다음 변수들을 설정해야 합니다:
        - `MY_SECRET_KEY`: 개인용 인증 키
        - `GEMINI_API_KEY`: Google Gemini API 키
        - `NOVELAI_API_KEY`: NovelAI API 키
        - `NOVELAI_MODEL`: NovelAI 모델명 (기본값: `erato`, 최신 모델로 주기적 업데이트)
        - `NOVELAI_MAX_LENGTH`: NovelAI 최대 생성 길이 (기본값: `2048`, 토큰 단위)

-----

### 3\. 🎨 프론트엔드 및 UI/UX 규칙

  * **로직과 디자인:**
      * 프론트엔드 로직(JavaScript)은 상세하게 구현하되, CSS/디자인은 기초적인 골격만 잡습니다.
      * 복잡한 디자인이 필요한 부분은 코드 대신, \*\*주석으로 "어떻게 디자인되어야 하며 어떤 방식으로 작동해야 하는지"\*\*를 상세히 기록합니다.
  * **모바일 대응:**
      * 모든 UI는 **모바일 환경**을 우선적으로 고려하여 반응형으로 설계합니다.
  * **[2025-10-19] 지침 (모달 및 Z-Index):**
      * 여러 모달이나 토스트 메시지를 띄울 경우, **`z-index`를 유의하여 정하며, 절대 같은 인덱스로 설정하지 않습니다.**
      * **토스트 메시지(알림)가 항상 최상위**에 오도록 `z-index`를 가장 높게 설정합니다.
      * 단순 알림(예: '저장됨')은 토스트로, 사용자의 확인이 필요한 메시지(예: '삭제하시겠습니까?')는 **모달**로 띄웁니다.
  * **[2025-10-19] 지침 (버튼 상태):**
      * API 호출 등 비동기 함수를 실행하는 버튼은, **클릭 즉시 `disabled` (비활성화) 처리**하고 **"\~하는 중..."** 텍스트와 스피너를 표시합니다.
      * 요청이 완료(성공 또는 실패)되면 **반드시 버튼을 다시 활성화**합니다.
  * **데이터 로딩:**
      * 페이지 로드 시 필요한 데이터는 **해당 페이지에 필요한 최소한의 데이터만** 서버리스 함수를 통해 불러오도록 효율적으로 설계합니다.
  * **디자인 통일성:**
      * 아이콘은 이모티콘(emoji)이 아닌, 일관된 \*\*아이콘 라이브러리(예: Heroicons, Material Icons)\*\*를 사용하도록 지시합니다.
      * **부드러운 애니메이션(transitions)**, 모던한 디자인, 높은 사용 편의성을 지향합니다.
      * 글자와 배경의 **명암 대비**를 확실하게 하여 **가시성과 가독성**을 높입니다.
  * **사용자 경험 (UX):**
      * 기능 구현 전, 가상의 \*\*텍스트 시뮬레이션(시나리오)\*\*을 통해 사용 흐름에 불편함이 없는지 검토합니다.

-----

### 4\. 🤖 NovelAI Erato 모델 호출 상세 가이드

#### 4.1. Erato 모델 개요

**Erato**는 NovelAI의 최신 텍스트 생성 모델입니다. 이전 모델(Opus, Kayra 등)보다 향상된 자연어 생성 능력과 문맥 이해력을 제공하며, 특히 창작 콘텐츠 생성에 최적화되어 있습니다.

#### 4.2. API 엔드포인트

```
POST https://text.novelai.net/ai/generate
```

**인증 방식:** Bearer Token
- Authorization 헤더에 `Bearer ${NOVELAI_API_KEY}` 형식으로 포함

#### 4.3. 요청 구조 (극도로 정밀한 명세)

##### 4.3.1. HTTP 헤더

```http
Content-Type: application/json
Authorization: Bearer ${NOVELAI_API_KEY}
```

##### 4.3.2. 요청 본문 (Request Body)

```json
{
  "input": "프롬프트 텍스트",
  "model": "erato",
  "parameters": {
    "max_length": 2048,
    "min_length": 1,
    "temperature": 1.0,
    "top_p": 0.9,
    "top_k": 0,
    "tail_free_sampling": 0,
    "repetition_penalty": 1.0,
    "mirostat": 0
  }
}
```

##### 4.3.3. 파라미터 상세 설명

| 파라미터 | 타입 | 필수 여부 | 기본값 | 설명 |
|---------|------|----------|--------|------|
| `input` | string | **필수** | - | 생성의 시작점이 되는 프롬프트 텍스트. 모델이 이 텍스트를 이어서 작성합니다. |
| `model` | string | **필수** | - | 사용할 모델명. 반드시 `"erato"`로 설정해야 합니다. |
| `parameters.max_length` | integer | 선택 | 2048 | 생성할 최대 토큰 수. 범위: 1~8192. 토큰은 대략 한글 1~2자, 영문 1단어에 해당합니다. |
| `parameters.min_length` | integer | 선택 | 1 | 생성할 최소 토큰 수. 일반적으로 1로 설정합니다. |
| `parameters.temperature` | float | 선택 | 1.0 | 생성의 무작위성을 제어합니다. 높을수록 창의적/다양하지만 일관성이 떨어질 수 있습니다. 범위: 0.1~2.0. 권장값: 0.7~1.2 |
| `parameters.top_p` | float | 선택 | 0.9 | 누적 확률 샘플링. 상위 p% 확률의 토큰만 고려합니다. 범위: 0.0~1.0. 권장값: 0.85~0.95 |
| `parameters.top_k` | integer | 선택 | 0 | 상위 k개의 토큰만 고려합니다. 0이면 비활성화됩니다. 범위: 0~100 |
| `parameters.tail_free_sampling` | float | 선택 | 0 | 꼬리 자유 샘플링. 확률 분포의 꼬리를 잘라냅니다. 범위: 0.0~1.0. 일반적으로 0으로 설정 |
| `parameters.repetition_penalty` | float | 선택 | 1.0 | 반복 억제 페널티. 1.0보다 크면 이미 나온 토큰의 재사용을 억제합니다. 범위: 1.0~1.5. 권장값: 1.0~1.1 |
| `parameters.mirostat` | integer | 선택 | 0 | Mirostat 샘플링 모드. 0=비활성화, 1=Mirostat v1, 2=Mirostat v2. 일반적으로 0으로 설정 |

#### 4.4. 응답 구조

##### 4.4.1. 성공 응답 (200 OK)

NovelAI Erato API는 다음과 같은 형식으로 응답할 수 있습니다:

**형식 1: output 필드 사용**
```json
{
  "output": "생성된 텍스트 내용..."
}
```

**형식 2: output_text 필드 사용**
```json
{
  "output_text": "생성된 텍스트 내용..."
}
```

**형식 3: choices 배열 사용 (OpenAI 호환 형식)**
```json
{
  "choices": [
    {
      "text": "생성된 텍스트 내용..."
    }
  ]
}
```

우리의 `/api/generate.js`는 이 세 가지 형식을 모두 처리할 수 있도록 구현되어 있습니다.

##### 4.4.2. 오류 응답

**401 Unauthorized**: API 키가 잘못되었거나 만료됨
```json
{
  "message": "Unauthorized"
}
```

**429 Too Many Requests**: 요청 한도 초과
```json
{
  "message": "Rate limit exceeded"
}
```

**500 Internal Server Error**: 서버 내부 오류

#### 4.5. 프로젝트 내 Erato 호출 흐름

##### 4.5.1. 프론트엔드에서 호출

```javascript
// /public/api.js
import { MODEL_FOR, callProxy } from './api.js';

// NovelAI Erato 모델 사용 (일본어 본문 작성)
const model = MODEL_FOR.J_DRAFT; // 'novelai'
const prompt = "프롬프트 텍스트";
const secretKey = localStorage.getItem('MY_SECRET_KEY');

const response = await callProxy(model, prompt, secretKey);
console.log(response.text); // 생성된 텍스트
```

##### 4.5.2. 백엔드 프록시 처리

```javascript
// /api/generate.js
// model === 'novelai'인 경우 자동으로 Erato 호출

const naiUrl = 'https://text.novelai.net/ai/generate';
const response = await fetch(naiUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.NOVELAI_API_KEY}`
  },
  body: JSON.stringify({
    input: prompt,
    model: process.env.NOVELAI_MODEL || 'erato',
    parameters: {
      max_length: parseInt(process.env.NOVELAI_MAX_LENGTH || '2048', 10),
      min_length: 1,
      temperature: 1.0,
      top_p: 0.9,
      top_k: 0,
      tail_free_sampling: 0,
      repetition_penalty: 1.0,
      mirostat: 0
    }
  })
});
```

#### 4.6. 환경 변수 설정

Vercel 대시보드에서 다음 환경 변수를 설정해야 합니다:

```bash
NOVELAI_API_KEY=nai-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOVELAI_MODEL=erato
NOVELAI_MAX_LENGTH=2048
```

#### 4.7. 사용 예시

##### 예시 1: 기본 텍스트 생성

**요청:**
```json
{
  "input": "어느 조용한 마을에 소녀가 살고 있었다.",
  "model": "erato",
  "parameters": {
    "max_length": 512,
    "temperature": 1.0,
    "top_p": 0.9
  }
}
```

**응답:**
```json
{
  "output": "어느 조용한 마을에 소녀가 살고 있었다. 그녀의 이름은 루나였고, 언제나 밤하늘을 바라보며 꿈을 꾸곤 했다..."
}
```

##### 예시 2: 일본어 소설 본문 작성 (프로젝트 실제 사용)

**요청:**
```json
{
  "input": "【等場人物】\n主人公: 田中太郎, 高校生, 内気な性格\n\n【要件】\n田中太郎が初めて告白するシーンを書いてください。",
  "model": "erato",
  "parameters": {
    "max_length": 2048,
    "temperature": 1.0,
    "top_p": 0.9,
    "repetition_penalty": 1.0
  }
}
```

**응답:**
```json
{
  "output": "田中太郎は震える手でポケットから手紙を取り出した。「あの、これ…」彼の声は小さく、風に消えそうだった..."
}
```

#### 4.8. 주의 사항 및 베스트 프랙티스

1. **API 키 보안**: `NOVELAI_API_KEY`는 절대 프론트엔드 코드나 공개 저장소에 노출하지 마세요.
2. **재시도 로직**: 429 오류 발생 시 지수 백오프(1s → 2s → 4s)로 재시도합니다.
3. **토큰 계산**: `max_length`는 토큰 단위입니다. 한글 기준 대략 1토큰 = 1~2자입니다.
4. **프롬프트 설계**: 명확하고 구체적인 지시사항을 포함하면 더 나은 결과를 얻을 수 있습니다.
5. **모델 업데이트**: NovelAI가 새로운 모델을 출시하면 `NOVELAI_MODEL` 환경 변수를 업데이트하세요.

#### 4.9. 트러블슈팅

| 문제 | 원인 | 해결 방법 |
|------|------|----------|
| 401 Unauthorized | API 키 오류 | Vercel 환경 변수에서 `NOVELAI_API_KEY` 확인 |
| 429 Too Many Requests | 요청 한도 초과 | 재시도 로직이 자동 작동. 잠시 후 다시 시도 |
| 응답 없음 | 잘못된 모델명 | `model` 필드가 정확히 `"erato"`인지 확인 |
| 짧은 응답 | max_length 너무 작음 | `NOVELAI_MAX_LENGTH`를 증가 (권장: 2048~4096) |
| 반복적인 텍스트 | repetition_penalty 너무 낮음 | `repetition_penalty`를 1.05~1.1로 조정 |
