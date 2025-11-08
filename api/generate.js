// /api/generate.js
// Vercel 서버리스 함수 - [V5] Simple Proxy (경비실 + 심부름꾼)

import fetch from 'node-fetch';

/**
 * Vercel 서버리스 함수 핸들러
 */
export default async function handler(req, res) {
    // CORS (동일)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-my-secret-key');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: '허용되지 않는 메서드입니다.' });

    try {
        // ========================================
        // [보안 로직] 1. 인증 검증 (필수)
        // ========================================
        const clientSecretKey = req.headers['x-my-secret-key'];
        const serverSecretKey = process.env.MY_SECRET_KEY;
        if (!clientSecretKey || clientSecretKey !== serverSecretKey) {
            console.error('인증 실패: 잘못된 경비실 문 열쇠');
            return res.status(401).json({ error: '인증 실패: 경비실 문 열쇠가 올바르지 않습니다.' });
        }

        // ========================================
        // [Simple Proxy 로직] 2. 프롬프트 전달
        // ========================================
        const { model, prompt } = req.body;

        if (!model || !prompt) {
            return res.status(400).json({ error: 'model과 prompt는 필수 항목입니다.' });
        }

        let resultText = '';

        // 프론트엔드가 요청한 모델에 따라 분기
        if (model.startsWith('gemini')) {
            // --- Gemini API 호출 ---
            const geminiApiKey = process.env.GEMINI_API_KEY;
            if (!geminiApiKey) {
                return res.status(500).json({ error: '서버 설정 오류: Gemini API 키가 없습니다.' });
            }
            
            // [지침서]의 gemini-2.5-flash-lite 대신 gemini-2.5-flash 사용 (혹은 모델명 정확히 수정)
            // [V5] 프론트엔드에서 받은 모델명을 동적으로 사용 (예: 'gemini-2.5-pro')
            const modelName = model; 
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;

            const response = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    safetySettings: [ // [지침서] 안전 필터 유지
                        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
                    ]
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Gemini (${modelName}) API 호출 실패: ${errorText}`);
            }
            const data = await response.json();
            if (data.candidates && data.candidates[0]?.content?.parts) {
                resultText = data.candidates[0].content.parts.map(part => part.text).join('');
            } else {
                resultText = "(Gemini 응답 없음 - 안전 필터 또는 기타 오류)";
            }
        
        } else if (model.startsWith('novelai')) {
            // --- NovelAI API 호출 ---
            const novelaiApiKey = process.env.NOVELAI_API_KEY;
            if (!novelaiApiKey) {
                return res.status(500).json({ error: '서버 설정 오류: NovelAI API 키가 없습니다.' });
            }

            const novelaiUrl = 'https://api.novelai.net/ai/generate';
            const response = await fetch(novelaiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${novelaiApiKey}`
                },
                body: JSON.stringify({
                    input: prompt, // 프론트엔드가 보낸 프롬프트 그대로 사용
                    model: 'kayra-v1', // 모델명 고정 (또는 프론트에서 받기)
                    parameters: { temperature: 1.0, max_length: 500 }
                })
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`NovelAI API 호출 실패: ${errorText}`);
            }
            const data = await response.json();
            resultText = data.output || "(NovelAI 응답 없음)";

        } else {
            return res.status(400).json({ error: `지원하지 않는 모델 계열입니다: ${model}` });
        }

        // [V5] 성공 응답
        return res.status(200).json({
            success: true,
            model: model,
            text: resultText
        });

    } catch (error) {
        // 최상위 에러 핸들러
        console.error('Simple Proxy 오류:', error);
        return res.status(500).json({ 
            error: '서버에서 오류가 발생했습니다.',
            details: error.message 
        });
    }
}
