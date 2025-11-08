// /api/generate.js
// Simple Proxy (경비실+심부름꾼) — Gemini & NovelAI 분기
import fetch from 'node-fetch';

const ALLOWED_MODELS = new Set([
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'novelai'
]);

// NovelAI 최신/최상 모델 설정 (환경변수로 관리)
const NAI_LATEST_MODEL = process.env.NOVELAI_MODEL || 'kayra-v1';
const NAI_MAX_LENGTH = parseInt(process.env.NOVELAI_MAX_LENGTH || '4000', 10);

// 지수 백오프 재시도 함수
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      
      // 429 또는 5xx 에러 시 재시도
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
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-my-secret-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '허용되지 않는 메서드입니다.' });

  try {
    // 1) 인증
    const clientSecretKey = req.headers['x-my-secret-key'];
    const serverSecretKey = process.env.MY_SECRET_KEY;
    if (!clientSecretKey || clientSecretKey !== serverSecretKey) {
      console.error('인증 실패: 잘못된 경비실 문 열쇠');
      return res.status(401).json({ error: '인증 실패: 경비실 문 열쇠가 올바르지 않습니다.' });
    }

    // 2) 입력 검사
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
        throw new Error(`Gemini(${modelName}) 호출 실패: ${errorText}`);
      }
      const data = await gRes.json();
      if (data.candidates && data.candidates[0]?.content?.parts) {
        resultText = data.candidates[0].content.parts.map(p => p.text || '').join('');
      } else {
        resultText = '(Gemini 응답 없음)';
      }

    } else if (model === 'novelai') {
      const novelaiApiKey = process.env.NOVELAI_API_KEY;
      if (!novelaiApiKey) {
        return res.status(500).json({ error: '서버 설정 오류: NovelAI API 키가 없습니다.' });
      }
      const naiUrl = 'https://api.novelai.net/ai/generate';
      const nRes = await fetchWithRetry(naiUrl, {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Authorization': `Bearer ${novelaiApiKey}`
        },
        body: JSON.stringify({
          input: prompt,
          model: NAI_LATEST_MODEL,  // 환경변수로 관리되는 최신/최상 모델
          parameters: { 
            temperature: 1.0, 
            max_length: NAI_MAX_LENGTH  // 3000-4000자 목표 (환경변수)
          }
        })
      });
      if (!nRes.ok) {
        const t = await nRes.text();
        throw new Error(`NovelAI 호출 실패: ${t}`);
      }
      const nData = await nRes.json();
      resultText = nData.output || '(NovelAI 응답 없음)';

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
