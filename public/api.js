// /public/api.js
// API 호출 및 상수 관리

// 파이프라인 & 모델 매핑 (시스템 프롬프트 #9)
export const MODEL_FOR = {
    SKETCH: 'gemini-2.5-flash-lite',  // 스케치 개요
    J_DRAFT: 'novelai',                // 본문 초안 (일본어) - NovelAI 최신 모델
    J_POLISH: 'novelai',               // 다듬기 (일본어) - NovelAI 최신 모델
    TRANSLATE_KO: 'gemini-2.5-pro'     // 번역 (일→한) - Gemini 2.5 Pro
};

/**
 * 백엔드 API 프록시 호출
 * @param {string} model - 'novelai' 또는 'gemini-...'
 * @param {string} prompt - 전송할 프롬프트
 * @param {string} secretKey - 인증 키
 * @returns {Promise<object>} - API 응답 JSON
 */
export async function callProxy(model, prompt, secretKey) {
    // [수정] Vercel 배포 환경을 고려하여 /api/generate 절대 경로 사용
    const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-my-secret-key': secretKey },
        body: JSON.stringify({ model, prompt })
    });
    
    const resData = await res.json();
    
    if (!res.ok) {
        // [개선] 서버에서 보낸 'details' 메시지를 오류로 throw
        throw new Error(resData.details || resData.error || '알 수 없는 서버 오류');
    }
    
    return resData;
}
