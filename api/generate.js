// /api/generate.js
// Vercel 서버리스 함수 - "경비실" 백엔드

import fetch from 'node-fetch';

/**
 * Vercel 서버리스 함수 핸들러
 * 모든 AI API 호출을 중계하는 "경비실" 역할
 */
export default async function handler(req, res) {
    // CORS 헤더 설정 (필요시)
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-my-secret-key');

    // OPTIONS 요청 처리 (CORS preflight)
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // POST 요청만 허용
    if (req.method !== 'POST') {
        return res.status(405).json({ error: '허용되지 않는 메서드입니다. POST만 가능합니다.' });
    }

    try {
        // ========================================
        // [보안 로직] 인증 검증 - 가장 중요!
        // ========================================
        const clientSecretKey = req.headers['x-my-secret-key'];
        const serverSecretKey = process.env.MY_SECRET_KEY;

        // 경비실 문 열쇠 확인
        if (!clientSecretKey || clientSecretKey !== serverSecretKey) {
            console.error('인증 실패: 잘못된 경비실 문 열쇠');
            return res.status(401).json({ 
                error: '인증 실패: 경비실 문 열쇠가 올바르지 않습니다.' 
            });
        }

        // ========================================
        // [API 중계 로직] 인증 성공 후 실행
        // ========================================
        const { target, prompt } = req.body;

        // 입력 검증
        if (!target || !prompt) {
            return res.status(400).json({ 
                error: 'target과 prompt는 필수 항목입니다.' 
            });
        }

        // Gemini API 호출
        if (target === 'gemini') {
            const geminiApiKey = process.env.GEMINI_API_KEY;
            
            if (!geminiApiKey) {
                console.error('GEMINI_API_KEY가 환경 변수에 설정되지 않았습니다.');
                return res.status(500).json({ 
                    error: '서버 설정 오류: Gemini API 키가 없습니다.' 
                });
            }

            try {
                // Gemini API 엔드포인트
                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`;
                
                // Gemini API 요청
                const geminiResponse = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{
                                text: prompt
                            }]
                        }],
                        safetySettings: [
                            {
                                category: 'HARM_CATEGORY_HARASSMENT',
                                threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                            },
                            {
                                category: 'HARM_CATEGORY_HATE_SPEECH',
                                threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                            },
                            {
                                category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                                threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                            },
                            {
                                category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                                threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                            }
                        ]
                    })
                });

                if (!geminiResponse.ok) {
                    const errorText = await geminiResponse.text();
                    console.error('Gemini API 오류:', errorText);
                    return res.status(geminiResponse.status).json({ 
                        error: `Gemini API 호출 실패: ${geminiResponse.status}`,
                        details: errorText
                    });
                }

                const geminiData = await geminiResponse.json();
                
                // Gemini 응답에서 텍스트 추출
                let resultText = '';
                if (geminiData.candidates && geminiData.candidates[0]?.content?.parts) {
                    resultText = geminiData.candidates[0].content.parts
                        .map(part => part.text)
                        .join('');
                }

                return res.status(200).json({ 
                    success: true,
                    target: 'gemini',
                    text: resultText,
                    rawResponse: geminiData
                });

            } catch (error) {
                console.error('Gemini API 처리 중 오류:', error);
                return res.status(500).json({ 
                    error: 'Gemini API 처리 중 오류가 발생했습니다.',
                    details: error.message
                });
            }
        }

        // NovelAI API 호출
        else if (target === 'novelai') {
            const novelaiApiKey = process.env.NOVELAI_API_KEY;
            
            if (!novelaiApiKey) {
                console.error('NOVELAI_API_KEY가 환경 변수에 설정되지 않았습니다.');
                return res.status(500).json({ 
                    error: '서버 설정 오류: NovelAI API 키가 없습니다.' 
                });
            }

            try {
                // NovelAI API 엔드포인트
                const novelaiUrl = 'https://api.novelai.net/ai/generate';
                
                // NovelAI API 요청
                const novelaiResponse = await fetch(novelaiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${novelaiApiKey}`
                    },
                    body: JSON.stringify({
                        input: prompt,
                        model: 'kayra-v1',
                        parameters: {
                            temperature: 1.0,
                            max_length: 150
                        }
                    })
                });

                if (!novelaiResponse.ok) {
                    const errorText = await novelaiResponse.text();
                    console.error('NovelAI API 오류:', errorText);
                    return res.status(novelaiResponse.status).json({ 
                        error: `NovelAI API 호출 실패: ${novelaiResponse.status}`,
                        details: errorText
                    });
                }

                const novelaiData = await novelaiResponse.json();

                return res.status(200).json({ 
                    success: true,
                    target: 'novelai',
                    text: novelaiData.output || '',
                    rawResponse: novelaiData
                });

            } catch (error) {
                console.error('NovelAI API 처리 중 오류:', error);
                return res.status(500).json({ 
                    error: 'NovelAI API 처리 중 오류가 발생했습니다.',
                    details: error.message
                });
            }
        }

        // 알 수 없는 target
        else {
            return res.status(400).json({ 
                error: `알 수 없는 target입니다: ${target}. 'gemini' 또는 'novelai'만 지원합니다.` 
            });
        }

    } catch (error) {
        // 최상위 에러 핸들러
        console.error('서버 오류:', error);
        return res.status(500).json({ 
            error: '서버에서 오류가 발생했습니다.',
            details: error.message
        });
    }
}
