// /api/generate.js
// Simple Proxy (경비실+심부름꾼) — Gemini & NovelAI 분기
import fetch from 'node-fetch';

const ALLOWED_MODELS = new Set([
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'novelai'
]);

// NovelAI 최신/최상 모델 설정 (규칙 #0: 인터넷 검색 결과 반영)
const NAI_LATEST_MODEL = process.env.NOVELAI_MODEL || 'glm-4-6'; 
// Vercel 환경 변수(NOVELAI_MAX_LENGTH)를 우선으로 하되, 
// 코드를 직접 배포할 경우의 기본값도 2048으로 설정합니다. (API 최대 4096)
// [수정] OpenAI 호환 API는 max_tokens를 사용합니다. (이름은 유지하되 값으로만 활용)
const NAI_MAX_LENGTH = parseInt(process.env.NOVELAI_MAX_LENGTH || '2048', 10);

// (fetchWithRetry 함수는 이전과 동일)
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options); 
      if (response.ok) return response;
      if (response.status === 429 || response.status >= 500) {
        if (i < maxRetries - 1) {
          const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
          console.log(`재시도 대기 중 (${i + 1}/${maxRetries}): ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      return response;
    } catch (err) {
      if (i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000;
        console.log(`네트워크 오류 재시도 (${i + 1}/${maxRetries}): ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err; 
    }
  }
}

export default async function handler(req, res) {
  // (CORS, 인증, 입력 검사 로직은 이전과 동일)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-my-secret-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '허용되지 않는 메서드입니다.' });

  try {
    const clientSecretKey = req.headers['x-my-secret-key'];
    const serverSecretKey = process.env.MY_SECRET_KEY;
    if (!clientSecretKey || clientSecretKey !== serverSecretKey) {
      console.error('인증 실패: 잘못된 경비실 문 열쇠');
      return res.status(401).json({ error: '인증 실패: 경비실 문 열쇠가 올바르지 않습니다.' });
    }

    const { model, prompt } = req.body || {};
    if (!model || !prompt) {
      return res.status(400).json({ error: 'model과 prompt는 필수 항목입니다.' });
    }
    if (!ALLOWED_MODELS.has(model)) {
      return res.status(400).json({ error: `허용되지 않는 모델: ${model}` });
    }

    let resultText = '';

    // 3) 분기
    if (model.startsWith('gemini')) {
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        return res.status(500).json({ error: '서버 설정 오류: Gemini API 키가 없습니다.' });
      }
      const modelName = model;
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;

      // 안전 필터 적용
      const safetySettings = [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
      ];

      const gRes = await fetchWithRetry(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 8192 },
          safetySettings: safetySettings
        })
      });

      if (!gRes.ok) {
        const errorText = await gRes.text();
        try {
            const errorJson = JSON.parse(errorText);
            throw new Error(errorJson.error?.message || errorText);
        } catch(e) {
            throw new Error(`Gemini(${modelName}) 호출 실패: ${errorText}`);
        }
      }
      
      const data = await gRes.json();
      
      if (data.candidates && data.candidates[0]?.content?.parts) {
        resultText = data.candidates[0].content.parts.map(p => p.text || '').join('');
      } else if (data.candidates && data.candidates[0]?.finishReason === 'SAFETY') {
        resultText = '(Gemini 안전 필터에 의해 차단된 응답입니다.)';
      } else {
        resultText = '(Gemini 응답 없음)';
      }

    } else if (model === 'novelai') {
      const novelaiApiKey = process.env.NOVELAI_API_KEY;
      if (!novelaiApiKey) {
        return res.status(500).json({ error: '서버 설정 오류: NovelAI API 키가 없습니다.' });
      }
      
      // [수정] 'glm-4-6' 모델은 OpenAI 호환 API 엔드포인트를 사용해야 합니다.
      // const naiUrl = 'https://text.novelai.net/ai/generate'; // (기존 주소)
      const naiUrl = 'https://text.novelai.net/oa/v1/chat/completions'; // (OpenAI 호환 주소)
      
      const nRes = await fetchWithRetry(naiUrl, {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Authorization': `Bearer ${novelaiApiKey}`
        },
        // [수정] OpenAI 호환 'messages' 형식으로 본문 변경
        body: JSON.stringify({
          model: NAI_LATEST_MODEL, // 'glm-4-6'
          messages: [
            {
              "role": "user",
              "content": prompt
            }
          ],
          temperature: 1.0,
          // [수정] OpenAI 호환 파라미터명 'max_tokens' 사용
          max_tokens: NAI_MAX_LENGTH // 2048 (Vercel 변수 우선)
        })
      });

      if (!nRes.ok) {
        const t = await nRes.text();
         // [개선] 403 오류를 명확히 전달
         if (nRes.status === 403) {
              try {
                 const errorJson = JSON.parse(t);
                 // "model 'glm-4-6' is only available..." 메시지 다시 포함
                 throw new Error(`NovelAI 호출 실패 (403): ${errorJson.message || t}`);
              } catch(e) { throw new Error(`NovelAI 호출 실패 (403): ${t}`); }
         }
        throw new Error(`NovelAI 호출 실패: ${t}`);
      }
      const nData = await nRes.json();

      // [수정] OpenAI 호환 응답 구조(choices)에서 텍스트 추출
      // resultText = nData.output || '(NovelAI 응답 없음)'; // (기존 응답)
      if (nData.choices && nData.choices[0]?.message?.content) {
        resultText = nData.choices[0].message.content;
      } else {
        resultText = '(NovelAI 응답 없음)';
      }

    } else {
      return res.status(400).json({ error: `지원하지 않는 모델: ${model}` });
    }

    // 4) 응답
    return res.status(200).json({ success:true, model, text: resultText });

  } catch (err) {
    console.error('Proxy 오류:', err);
    return res.status(500).json({ error: '서버에서 오류가 발생했습니다.', details: err.message });
  }
}
