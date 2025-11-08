# 배포 가이드

## Vercel 환경 변수 설정

Vercel 대시보드에서 다음 환경 변수를 설정해야 합니다:

### 필수 환경 변수

1. **MY_SECRET_KEY**: 경비실 문 열쇠 (개인 인증 키)
   - 예: `my-super-secret-key-12345`
   - 이 키는 프론트엔드에서 요청 시 `x-my-secret-key` 헤더로 전송됩니다.

2. **GEMINI_API_KEY**: Google Gemini API 키
   - Google AI Studio에서 발급받은 API 키
   - 용도: 스케치(SKETCH), 번역(TRANSLATE_KO)

3. **NOVELAI_API_KEY**: NovelAI API 키
   - NovelAI에서 발급받은 API 키
   - 용도: 본문 초안(J_DRAFT), 다듬기(J_POLISH)

### 선택적 환경 변수 (기본값 있음)

4. **NOVELAI_MODEL**: NovelAI 모델명
   - 기본값: `kayra-v1`
   - 최신/최상 모델로 주기적 업데이트 권장
   - 예: `kayra-v1`, `clio-v1` 등

5. **NOVELAI_MAX_LENGTH**: NovelAI 최대 생성 길이
   - 기본값: `4000`
   - 3000-4000자 목표 (회차 생성 규격)

## 배포 단계

1. GitHub 레포지토리를 Vercel에 연결
2. Vercel 프로젝트 설정 > Environment Variables에서 위의 환경 변수 추가
3. `vercel.json`에서 리전이 `icn1` (서울/인천)로 설정되어 있는지 확인
4. 배포 (자동으로 진행됨)

## 사용 방법

1. 배포된 웹사이트 접속
2. "경비실 문 열쇠" 입력란에 `MY_SECRET_KEY` 값 입력
3. "🔑 열쇠 저장하기" 버튼 클릭 (localStorage에 저장됨)
4. 새 소설 만들기 또는 기존 소설 열기
5. 파이프라인 단계 선택:
   - **기획 (Flash-lite)**: 스케치/개요 작성
   - **본작성 (NAI/일본어)**: 일본어 본문 생성 (3000-4000자)
   - **다듬기 (NAI/일본어)**: 일본어 문장 개선
   - **번역 (Gemini 2.5 Pro)**: 일본어 → 한국어
6. 프롬프트 입력 후 실행
7. 결과 확인 및 저장

## AI 모델 사용 원칙

### 파이프라인별 모델

| 단계 | 모델 | 언어 | 용도 |
|------|------|------|------|
| SKETCH | gemini-2.5-flash-lite | 한국어 | 스케치/간단 질의 |
| J_DRAFT | NovelAI (최신) | 일본어 | 본문 초안 (3000-4000자) |
| J_POLISH | NovelAI (최신) | 일본어 | 다듬기 |
| TRANSLATE_KO | gemini-2.5-pro | 한→일 | 번역 |

### 재시도 로직

- 429/5xx 오류 시 자동 재시도
- 지수 백오프: 1초 → 2초 → 4초 (최대 3회)

## 보안 주의사항

- **절대로** API 키들을 프론트엔드 코드에 하드코딩하지 마세요
- MY_SECRET_KEY는 개인만 알고 있어야 하며, 공유하지 마세요
- localStorage에 저장되는 키는 브라우저에만 보관되므로, 공용 컴퓨터에서는 사용 후 삭제하세요
- NovelAI 모델은 주기적으로 최신 버전을 확인하여 환경변수를 업데이트하세요
