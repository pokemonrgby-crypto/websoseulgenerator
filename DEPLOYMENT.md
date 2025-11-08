# 배포 가이드

## Vercel 환경 변수 설정

Vercel 대시보드에서 다음 환경 변수를 설정해야 합니다:

1. **MY_SECRET_KEY**: 경비실 문 열쇠 (개인 인증 키)
   - 예: `my-super-secret-key-12345`
   - 이 키는 프론트엔드에서 요청 시 `x-my-secret-key` 헤더로 전송됩니다.

2. **GEMINI_API_KEY**: Google Gemini API 키
   - Google AI Studio에서 발급받은 API 키

3. **NOVELAI_API_KEY**: NovelAI API 키
   - NovelAI에서 발급받은 API 키

## 배포 단계

1. GitHub 레포지토리를 Vercel에 연결
2. Vercel 프로젝트 설정 > Environment Variables에서 위의 3개 키 추가
3. 배포 (자동으로 진행됨)

## 사용 방법

1. 배포된 웹사이트 접속
2. "경비실 문 열쇠" 입력란에 `MY_SECRET_KEY` 값 입력
3. "🔑 열쇠 저장하기" 버튼 클릭 (localStorage에 저장됨)
4. 프롬프트 입력
5. "✨ Gemini로 기획하기" 버튼 클릭
6. 결과 확인

## 보안 주의사항

- **절대로** API 키들을 프론트엔드 코드에 하드코딩하지 마세요
- MY_SECRET_KEY는 개인만 알고 있어야 하며, 공유하지 마세요
- localStorage에 저장되는 키는 브라우저에만 보관되므로, 공용 컴퓨터에서는 사용 후 삭제하세요
