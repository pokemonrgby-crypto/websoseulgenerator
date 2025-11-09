// /api/generate.js
// Simple Proxy (경비실+심부름꾼) — Gemini & NovelAI 분기
import fetch from 'node-fetch';

const ALLOWED_MODELS = new Set([
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'novelai' // novelai 선택 시 에라토 호출
]);

// NovelAI 텍스트 모델: Erato (Llama 3 70B 기반)
const NAI_LATEST_MODEL = (process.env.NOVELAI_MODEL || 'erato');
// Erato 실제 제한: 150 토큰 (최대 170 토큰까지 문장 완성)
// 환경변수 NOVELAI_MAX_LENGTH가 있으면 우선하되, 150을 초과하면 경고
const NAI_MAX_LENGTH = parseInt(process.env.NOVELAI_MAX_LENGTH || '150', 10);

// 공용 재시도 fetch
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
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-my-secret-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '허용되지 않는 메서드입니다.' });

  try {
    // 간단 인증
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

    // --- Gemini 분기 ---
    if (model.startsWith('gemini')) {
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        return res.status(500).json({ error: '서버 설정 오류: Gemini API 키가 없습니다.' });
      }
      const modelName = model;
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;

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
        } catch (e) {
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

    // --- NovelAI(Erato) 분기 ---
    } else if (model === 'novelai') {
      const novelaiApiKey = process.env.NOVELAI_API_KEY;
      if (!novelaiApiKey) {
        return res.status(500).json({ error: '서버 설정 오류: NovelAI API 키가 없습니다.' });
      }

      // 에라토: NovelAI 텍스트 전용 엔드포인트
      const naiUrl = 'https://text.novelai.net/ai/generate';

      const nRes = await fetchWithRetry(naiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${novelaiApiKey}`
        },
        body: JSON.stringify({
          input: prompt,
          model: NAI_LATEST_MODEL, // 'erato'
          parameters: {
            max_length: NAI_MAX_LENGTH, // 기본 150, 실제 제한 150-170
            min_length: 1,
            temperature: 1.0,
            top_p: 0.9,
            top_k: 0,
            tail_free_sampling: 0,
            repetition_penalty: 1.0,
            repetition_penalty_range: 2048,
            repetition_penalty_slope: 0,
            repetition_penalty_frequency: 0,
            repetition_penalty_presence: 0,
            order: [0, 1, 2, 3]
          }
        })
      });

      if (!nRes.ok) {
        const t = await nRes.text();
        try {
          const errorJson = JSON.parse(t);
          throw new Error(`NovelAI(ERATO) 호출 실패 (${nRes.status}): ${errorJson.message || t}`);
        } catch (e) {
          throw new Error(`NovelAI(ERATO) 호출 실패 (${nRes.status}): ${t}`);
        }
      }

      const nData = await nRes.json();

      // 호환 넓은 파서
      if (typeof nData.output === 'string' && nData.output.length > 0) {
        resultText = nData.output;
      } else if (typeof nData.output_text === 'string' && nData.output_text.length > 0) {
        resultText = nData.output_text;
      } else if (Array.isArray(nData.choices) && nData.choices[0]?.text) {
        resultText = nData.choices[0].text;
      } else {
        resultText = '(NovelAI 응답 없음)';
      }

    } else {
      return res.status(400).json({ error: `지원하지 않는 모델: ${model}` });
    }

    // 최종 응답
    return res.status(200).json({ success: true, model, text: resultText });

  } catch (err) {
    console.error('Proxy 오류:', err);
    return res.status(500).json({ error: '서버에서 오류가 발생했습니다.', details: err.message });
  }
}
