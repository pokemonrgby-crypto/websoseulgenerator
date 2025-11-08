// /api/generate.js
// Vercel 서버리스 함수 - 3단계 AI 파이프라인 백엔드
// [수정] 최종 결과를 '블록 배열'과 '지시 내역'으로 반환

import fetch from 'node-fetch';

// ========================================
// API 헬퍼: Gemini API 호출 (변경 없음)
// ========================================
async function callGemini(prompt, apiKey, modelName) {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    try {
        const response = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                safetySettings: [
                    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
                ]
            })
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Gemini (${modelName}) API 오류:`, errorText);
            throw new Error(`Gemini API 호출 실패 (${modelName}): ${response.status}`);
        }
        const data = await response.json();
        if (data.candidates && data.candidates[0]?.content?.parts) {
            return data.candidates[0].content.parts.map(part => part.text).join('');
        } else {
            console.warn('Gemini 응답이 비어있습니다 (안전 필터 등):', data);
            throw new Error('Gemini가 응답을 생성하지 못했습니다 (안전 필터에 의해 차단되었을 수 있습니다).');
        }
    } catch (error) {
        console.error(`callGemini (${modelName}) 처리 중 오류:`, error);
        throw error;
    }
}

// ========================================
// API 헬퍼: NovelAI API 호출 (변경 없음)
// ========================================
async function callNovelAI(prompt, apiKey) {
    const novelaiUrl = 'https://api.novelai.net/ai/generate';
    try {
        const response = await fetch(novelaiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                input: prompt,
                model: 'kayra-v1',
                parameters: {
                    temperature: 1.0,
                    max_length: 500
                }
            })
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error('NovelAI API 오류:', errorText);
            throw new Error(`NovelAI API 호출 실패: ${response.status}`);
        }
        const data = await response.json();
        if (!data.output) {
            throw new Error('NovelAI가 유효한 'output'을 반환하지 않았습니다.');
        }
        return data.output;
    } catch (error) {
        console.error('callNovelAI 처리 중 오류:', error);
        throw error;
    }
}

// ========================================
// 프롬프트 헬퍼 (변경 없음)
// ========================================
/** 1단계: 기획 프롬프트 생성 */
function createPlannerPrompt(sceneRequest, db) {
    // [수정] db의 형식을 JSON 문자열로 가정하고 프롬프트에 주입
    return `
# 역할: 당신은 AI 웹소설 기획자입니다.
# 임무: 사용자의 '세계관 DB'와 '씬 요청'을 바탕으로, 2단계(집필 AI)와 3단계(번역 AI)가 사용할 '씬 아웃라인'과 '번역 지침서'를 생성합니다.
# 출력 형식: 반드시 다음 JSON 형식과 마크다운 코드블럭을 준수하여 출력하세요.
\`\`\`json
{
  "sceneOutline": "[여기에 2단계 AI(NovelAI)가 일본어로 집필할 수 있도록 구체적인 씬의 흐름, 장소, 인물, 행동, 대사 힌트를 상세히 작성합니다. 웹소설 스타일로 작성해야 합니다.]",
  "translationGuide": {
    "toneAndManner": {
      "캐릭터A": "냉소적, 짧게 끊어 말함",
      "캐릭터B": "친절하지만 어딘가 의심스러움"
    },
    "terminology": {
      "マナ": "마력",
      "고유지명A": "절망의 숲"
    }
  }
}
\`\`\`

---[입력 데이터]---

## 세계관 DB (JSON/Text)
${db.world || "제공되지 않음"}
${db.chars || "제공되지 않음"}
${db.locs || "제공되지 않음"}
${db.plot || "제공되지 않음"}

## 씬 요청
${sceneRequest}
`;
}

/** 2단계: 집필 프롬프트 생성 */
function createWriterPrompt(sceneOutline) {
    return `
以下の指示に基づいて、高品質な日本語のウェブ小説風のシーンを執筆してください。
キャラクターの感情と行動描写を重視してください。

# 指示 (씬 아웃라인)
${sceneOutline}
`;
}

/** 3단계: 번역/윤문 프롬프트 생성 */
function createTranslatorPrompt(japaneseText, translationGuide) {
    return `
# 역할: 당신은 전문 웹소설 번역가입니다.
# 임무: 주어진 '일본어 원문'을 '번역 지침서'에 따라 "한국 최신 웹소설 뉘앙스"에 맞게 완벽하게 번역하고 윤문합니다.
# 지침:
1.  '번역 지침서'의 말투(Tone & Manner)와 용어(Terminology)를 반드시 준수하세요.
2.  직역이 아닌, 한국 웹소설 독자가 읽기에 매끄럽고 몰입감 넘치는 문체로 윤문하세요.
3.  어색한 번역투('~의', '~이다' 등)를 피하고 자연스러운 한국어 문장을 사용하세요.

---[번역 지침서]---
${JSON.stringify(translationGuide, null, 2)}

---[일본어 원문]---
${japaneseText}

---[최종 한국어 본문 (윤문 완료)]---
`;
}

/** 헬퍼: 1단계 기획자 출력을 파싱 */
function parsePlannerOutput(geminiOutput) {
    try {
        const jsonMatch = geminiOutput.match(/```json\s*([\s\S]*?)\s*```/);
        if (!jsonMatch || !jsonMatch[1]) {
            throw new Error("1단계 기획자 출력이 올바른 JSON 코드블럭 형식이 아닙니다.");
        }
        const jsonString = jsonMatch[1];
        return JSON.parse(jsonString);
    } catch (e) {
        console.error("1단계 기획자 출력(JSON) 파싱 실패:", e.message, "원본:", geminiOutput);
        throw new Error(`1단계 기획자 출력 파싱 실패: ${e.message}`);
    }
}


/**
 * Vercel 서버리스 함수 핸들러
 */
export default async function handler(req, res) {
    // CORS (변경 없음)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-my-secret-key');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: '허용되지 않는 메서드입니다.' });

    try {
        // [보안 로직] (변경 없음)
        const clientSecretKey = req.headers['x-my-secret-key'];
        const serverSecretKey = process.env.MY_SECRET_KEY;
        if (!clientSecretKey || clientSecretKey !== serverSecretKey) {
            return res.status(401).json({ error: '인증 실패: 경비실 문 열쇠가 올바르지 않습니다.' });
        }

        const { GEMINI_API_KEY, NOVELAI_API_KEY } = process.env;
        if (!GEMINI_API_KEY || !NOVELAI_API_KEY) {
            return res.status(500).json({ error: '서버 설정 오류: API 키가 없습니다.' });
        }

        // [입력 로직] (변경 없음)
        // (단, worldviewDatabase는 이제 프론트엔드에서 유연하게 구성된 JSON 데이터일 것을 가정함)
        const { sceneRequest, worldviewDatabase } = req.body;
        if (!sceneRequest || !worldviewDatabase) {
            return res.status(400).json({ error: 'sceneRequest와 worldviewDatabase는 필수 항목입니다.' });
        }

        // --- 1단계: 기획 (Gemini 2.5 Flash) ---
        const plannerPrompt = createPlannerPrompt(sceneRequest, worldviewDatabase);
        const plannerOutputText = await callGemini(plannerPrompt, GEMINI_API_KEY, 'gemini-2.5-flash');
        const plan = parsePlannerOutput(plannerOutputText); // JSON 파싱

        // --- 2단계: 집필 (NovelAI Kayra-v1) ---
        const writerPrompt = createWriterPrompt(plan.sceneOutline);
        const japaneseText = await callNovelAI(writerPrompt, NOVELAI_API_KEY);

        // --- 3단계: 번역/윤문 (Gemini 2.5 Pro) ---
        const translatorPrompt = createTranslatorPrompt(japaneseText, plan.translationGuide);
        const finalKoreanText = await callGemini(translatorPrompt, GEMINI_API_KEY, 'gemini-2.5-pro');

        // [수정] 최종 텍스트를 블록 배열로 변환
        // 사용자의 요구사항: ["A...", "", "B..."]
        // \n\n (문단)을 기준으로 나누는 것이 아니라, \n (줄바꿈)을 기준으로 나눕니다.
        const blocks = finalKoreanText
            .split('\n')
            .map(line => line.trim()) // 앞뒤 공백 제거
            .map(line => line === "" ? "" : line); // 빈 줄은 빈 문자열로 유지

        // [수정] 최종 결과 반환
        return res.status(200).json({ 
            success: true, 
            blocks: blocks, // 텍스트 덩어리 대신 블록 배열 반환
            instructions: { // "지시 내역" 추가
                step1_Outline: plan.sceneOutline,
                step1_Guide: plan.translationGuide,
                step2_Japanese: japaneseText
            }
        });

    } catch (error) {
        console.error('전체 파이프라인 오류:', error);
        return res.status(500).json({ 
            error: '서버에서 오류가 발생했습니다.',
            details: error.message 
        });
    }
}
