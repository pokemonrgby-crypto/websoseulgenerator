// /public/view-novel.js
// 집필실(에디터) 뷰
import { showToast, toggleButtonLoading } from './ui-utils.js';
import { MODEL_FOR, callProxy } from './api.js';

const LS_KEY = 'novels';

// --- 데이터 로직 ---
function load() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } }
function save(arr) { localStorage.setItem(LS_KEY, JSON.stringify(arr)); }
function getNovel(novelId) { return load().find(n => n.id === novelId); }
/**
 * 소설 객체와 회차 번호로 회차 객체를 찾습니다. (이전 회차 접근용 헬퍼)
 * @param {object} n - 소설 객체
 * @param {number} epNum - 회차 번호
 * @returns {object | undefined} 회차 객체
 */
function getEpisode(n, epNum) { return (n.episodes || []).find(e => e.no === epNum); }


// --- 렌더링 로직 ---
// [수정] masterResources -> currentResources (로드 시점의 리소스)
let novel, episode, currentResources, lastJapaneseDraft = "";
let secretKey = localStorage.getItem('MY_SECRET_KEY');

function renderResourceList(type, data) {
    const listEl = document.getElementById(`${type}-list`);
    if (!listEl) return;
    listEl.innerHTML = '';
    if (!data || data.length === 0) {
        listEl.innerHTML = '<span style="color: var(--text-secondary);">(리소스 없음)</span>';
        return;
    }
    data.forEach((item, index) => {
        const displayName = item.name || item.이름 || item.장소명 || item.용어 || `항목 ${index + 1}`;
        const label = document.createElement('label');
        label.style.cssText = 'display: block; padding: 4px; border-radius: 4px; cursor: pointer;';
        label.innerHTML = `<input type="checkbox" class="resource-check" data-type="${type}" data-index="${index}" checked> ${displayName}`;
        listEl.appendChild(label);
    });
}

function loadResources() {
    // [수정] currentResources 사용 (규칙 #11, #13)
    renderResourceList('characters', currentResources.characters);
    renderResourceList('places', currentResources.places);
    renderResourceList('terms', currentResources.terms);
}

function loadEpisodeContent() {
    if (episode && episode.content) {
        const blocks = document.getElementById('novel-blocks');
        // [수정] innerHTML 초기화 추가
        blocks.innerHTML = ''; 
        episode.content.split(/\n\s*\n/).forEach(chunk => {
            const p = document.createElement('p');
            p.textContent = chunk || ' ';
            blocks.appendChild(p);
        });
    }
}

// --- 프롬프트 로직 ---
function getFormattedResources() {
    let resourceText = "";
    const checkedItems = document.querySelectorAll('.resource-check:checked');
    if (checkedItems.length === 0) return "";
    const grouped = { characters: [], places: [], terms: [] };
    checkedItems.forEach(check => {
        const type = check.dataset.type;
        const index = parseInt(check.dataset.index, 10);
        // [수정] currentResources 사용 (규칙 #11, #13)
        if (currentResources[type] && currentResources[type][index]) {
            grouped[type].push(currentResources[type][index]);
        }
    });
    if (grouped.characters.length > 0) resourceText += "【등장인물】\n" + grouped.characters.map(item => JSON.stringify(item)).join('\n') + "\n\n";
    if (grouped.places.length > 0) resourceText += "【배경/장소】\n" + grouped.places.map(item => JSON.stringify(item)).join('\n') + "\n\n";
    if (grouped.terms.length > 0) resourceText += "【고유 용어】\n" + grouped.terms.map(item => JSON.stringify(item)).join('\n') + "\n\n";
    return resourceText.trim();
}

/**
 * [신규] 이전 회차 내용(연속성)을 프롬프트에 추가 (규칙 #12.5)
 */
function getPreviousEpisodeContext() {
    if (!novel || !episode || episode.no <= 1) {
        return "";
    }
    const prevEpisode = getEpisode(novel, episode.no - 1);
    if (prevEpisode && prevEpisode.content) {
        // 간단히 마지막 500자만 잘라서 제공 (한국어 본문 기준)
        const context = prevEpisode.content.slice(-500); 
        return `【이전 화 내용 (참고용)】\n${context}\n\n`;
    }
    return "";
}


function buildPrompt(stage, userText, resourceText = "") {
    const resourceBlock = resourceText ? `【참고 리소스】\n${resourceText}\n\n` : "";
    
    // [신규] 이전 화 내용 (규칙 #12.5)
    // J_DRAFT 또는 J_POLISH 단계에서만 이전 화 내용을 참조
    const prevContextBlock = (stage === 'J_DRAFT' || stage === 'J_POLISH') ? getPreviousEpisodeContext() : "";

    switch(stage){
      case 'SKETCH':
        // TODO (규칙 #15): 지시 프롬프트(userText)가 부실할 경우, NAI-brief(또는 flash-lite)를 호출하여 
        // '일본어 지시문(10~14행)'을 생성하고(A-SKETCH), 그 결과를 J_DRAFT의 userText로 사용하는 보강 로직 필요.
        return `${resourceBlock}너는 웹소설 기획 보조야. 아래 리소스와 요구사항을 바탕으로 갈등→전환→후폭풍 3단 구조로 정리해줘.\n요구사항:\n${userText}`;
      case 'J_DRAFT':
        // [수정] prevContextBlock 추가
        // TODO (규칙 #12): 현재 150 토큰 제한(api/generate.js)으로 인해 3,000~4,000자 생성 불가. 반복 호출 로직 필요.
        return `以下のリソースと要件に従って、日本語でウェブ小説の本文を執筆してください。\n\n${resourceBlock}${prevContextBlock}【必須要件】\n- 最大出力: 約150トークン (約300文字程度)\n- 改行: 必ず \\n を使用\n- 文体: 会話中心, SFXは地の文 (例: 【SFX】～～)\n- 固有名詞・口調: リソースに基づき一貫性を保つ\n\n【要件】\n${userText}\n\n【禁止事項】\n- リソースと矛盾する内容`;
      case 'J_POLISH':
        // [수정] prevContextBlock 추가
        return `${resourceBlock}${prevContextBlock}다음 리소스를 참고하여, 아래의 일본어 웹소설 본문을 추고(推敲)해주세요.\n【추고(推敲)의 방침】\n- 리소스와 일관성 유지\n- 의미는 바꾸지 않는다\n- 불필요한 표현 삭제\n- 문장의 리듬 개선\n\n【본문】\n${userText}`;
      case 'TRANSLATE_KO':
        return `${resourceBlock}다음 리소스를 참고하여, 아래의 일본어 웹소설 본문을 자연스러운 한국어로 번역해줘.\n【번역 원칙】\n- 말맛/톤 유지\n- 리소스 고유명사 정확히 번역\n- 대화와 줄바꿈 살리기\n\n【일본어 본문】\n${userText}`;
      default:
        return userText;
    }
}

// --- 이벤트 핸들러 ---
async function handleGenerateClick(e) {
    const generateBtn = e.target;
    const userText = document.getElementById('sceneRequest').value;
    if (!secretKey || !userText) return showToast('키 또는 입력이 비어 있습니다.', 'warning');

    const stage = document.getElementById('pipelineStage').value;
    const model = MODEL_FOR[stage];
    const resourceText = getFormattedResources();
    const prompt = buildPrompt(stage, userText, resourceText);

    // [수정] 버튼 텍스트 변경 (규칙 #3)
    toggleButtonLoading(generateBtn, true, '생성 중...');
    const sceneResultEl = document.getElementById('sceneResult');
    
    // TODO (규칙 #15): 같은 회차에서 동일 stage, 동일 userText, 동일 리소스 선택으로 호출 시
    // 이전에 생성한 지시문/요약(SKETCH 결과) 또는 본문(J_DRAFT 결과)을 캐시하여 재사용하는 로직 필요.

    try {
        const data = await callProxy(model, prompt, secretKey);
        const text = data.text || '';
        const p = document.createElement('p');
        p.textContent = text || ' ';
        document.getElementById('novel-blocks').appendChild(p);
        if (stage === 'J_DRAFT' || stage === 'J_POLISH') { lastJapaneseDraft = text; }
        sceneResultEl.textContent = `[${data.model}] 완료`;
        showToast(`${stage} 단계 생성 완료!`, 'success');
    } catch (e) {
        sceneResultEl.textContent = `오류: ${e.message}`;
        showToast(`오류: ${e.message}`, 'error', 5000);
    } finally {
        // [수정] 버튼 텍스트 변경 (규칙 #3)
        toggleButtonLoading(generateBtn, false, '[생성] 실행');
    }
}

async function handleProxyClick(e) {
    const proxyBtn = e.target;
    const prompt = document.getElementById('proxyPrompt').value;
    if (!secretKey || !prompt) return showToast('키 또는 프롬프트가 없습니다.', 'warning');
    
    toggleButtonLoading(proxyBtn, true, '전송 중...');
    const proxyResultEl = document.getElementById('proxyResult');
    try {
        const data = await callProxy('gemini-2.5-flash-lite', prompt, secretKey);
        proxyResultEl.textContent = data.text || '';
        showToast('응답 완료', 'success');
    } catch (e) {
        proxyResultEl.textContent = `오류: ${e.message}`;
        showToast('오류 발생: ' + e.message, 'error', 5000);
    } finally {
        toggleButtonLoading(proxyBtn, false, '보내기');
    }
}

function handleSaveContent() {
    const arr = load();
    const n = arr.find(x => x.id === novel.id);
    if (!n) return showToast('소설을 찾을 수 없습니다.', 'error');
    const ep = (n.episodes || []).find(e => e.no === episode.no);
    if (!ep) return showToast('회차를 찾을 수 없습니다.', 'error');
    
    const blocks = [...document.querySelectorAll('#novel-blocks p')].map(p => p.textContent);
    ep.content = blocks.join('\n\n');
    ep.updatedAt = Date.now();
    n.updatedAt = Date.now();
    
    // [신규] 규칙 #13: 회차 저장 시 리소스 스냅샷 저장
    // 현재 로드된 리소스(currentResources)를 회차 리소스로 저장 (Deep Copy)
    ep.resources = JSON.parse(JSON.stringify(currentResources));
    
    // TODO (규칙 #13.2): 회차 리소스(ep.resources)의 변경 사항을 
    // 소설 마스터 리소스(n.resources)로 역반영(동기화)하는 로직이 필요함.
    // (예: "이 회차의 리소스 변경점을 마스터에 적용하기" 버튼)
    // 현재는 회차 -> 마스터 반영 로직은 구현되지 않음.

    save(arr);
    showToast('본문 및 리소스 스냅샷 저장 완료!', 'success');
}

async function handleCopyClick() {
    if (!lastJapaneseDraft) return showToast('아직 일본어 본문이 없습니다.', 'warning');
    await navigator.clipboard.writeText(lastJapaneseDraft);
    showToast('일본어 원문 복사 완료!', 'success');
}

// --- 뷰 초기화 ---
export function initNovelView(container, novelId, epNum) {
    // 1. 데이터 초기화
    secretKey = localStorage.getItem('MY_SECRET_KEY');
    novel = getNovel(novelId);
    if (!novel) {
        container.innerHTML = '<h1>소설을 찾을 수 없습니다.</h1><a href="#/">목록으로</a>';
        return;
    }
    episode = getEpisode(novel, Number(epNum) || 1);
    if (!episode) {
        container.innerHTML = '<h1>회차를 찾을 수 없습니다.</h1><a href="#/">목록으로</a>';
        return;
    }

    // [수정] 규칙 #11.5, #13: 리소스 로드 우선순위 적용
    // 1. 회차 스냅샷(episode.resources)이 있으면 사용
    // 2. 없으면 소설 마스터(novel.resources)를 사용
    if (episode.resources) {
        currentResources = episode.resources;
        console.log(`[${episode.no}화] 리소스 스냅샷 로드됨.`);
    } else {
        currentResources = novel.resources || { characters: [], places: [], terms: [], notes: "" };
        console.log(`[${episode.no}화] 소설 마스터 리소스 로드됨 (스냅샷 없음).`);
    }

    lastJapaneseDraft = "";

    // 2. 뷰 HTML 삽입
    // [수정] 규칙 #3: 이모지 버튼 텍스트 변경
    container.innerHTML = `
        <div class="editor-layout">
            <div class="main-content">
                <h2 id="episodeTitle">${novel.title} - ${episode.no}화 집필 중</h2>
                <label>핵심 프롬프트 (기획/본작성/다듬기/번역에 공통으로 사용될 입력)</label>
                <textarea id="sceneRequest" rows="8" placeholder="여기에 요구사항/이어쓰기 내용 등을 적어줘. (본작성은 일본어로 결과가 나와)"></textarea>
                <div>
                    <select id="pipelineStage" style="margin-right:8px;">
                        <option value="SKETCH">기획 (Flash-lite)</option>
                        <option value="J_DRAFT">본작성 (NAI Erato/일본어/Max 150토큰≈300자)</option>
                        <option value="J_POLISH">다듬기 (NAI Erato/일본어)</option>
                        <option value="TRANSLATE_KO">번역 (Gemini 2.5 Pro/일→한)</option>
                    </select>
                    <button id="generateSceneButton">[생성] 실행</button>
                    <button id="copyJapaneseButton" class="sub" style="margin-left:8px;">[복사] 원문(일본어)</button>
                    <button id="saveContentButton" class="sub" style="margin-left:8px;">[저장] 본문+스냅샷</button>
                </div>
                <div class="blocks" id="novel-blocks"></div>
                <pre id="sceneResult"></pre>
            </div>
            <div class="side">
                <fieldset id="resource-injector" style="border:1px solid var(--border-color); border-radius:12px; padding:12px;">
                    <legend style="font-weight: bold; padding: 0 5px; color: var(--text-primary);">리소스 주입 (현재 회차 기준)</legend>
                    <button id="editResourcesButton" class="resource" style="width: 100%; margin-bottom: 12px;">[관리] 리소스 관리 (새 탭)</button>
                    <strong>등장인물</strong>
                    <div id="characters-list" style="max-height: 150px; overflow-y: auto; padding: 5px; background: var(--bg-dark-1); border-radius: 6px; margin-top: 5px;"></div>
                    <br>
                    <strong>배경/장소</strong>
                    <div id="places-list" style="max-height: 150px; overflow-y: auto; padding: 5px; background: var(--bg-dark-1); border-radius: 6px; margin-top: 5px;"></div>
                    <br>
                    <strong>고유 용어</strong>
                    <div id="terms-list" style="max-height: 150px; overflow-y: auto; padding: 5px; background: var(--bg-dark-1); border-radius: 6px; margin-top: 5px;"></div>
                </fieldset>
                <fieldset style="border:1px solid var(--border-color); border-radius:12px; padding:12px;">
                    <legend style="font-weight: bold; padding: 0 5px; color: var(--text-primary);">편의 프롬프트 (Flash-lite)</legend>
                    <textarea id="proxyPrompt" rows="4" placeholder="빠른 질문/요약 등"></textarea>
                    <button id="proxyButton" class="sub" style="width: 100%; margin-top: 8px;">보내기</button>
                    <pre id="proxyResult" style="margin-top: 8px;"></pre>
                </fieldset>
            </div>
        </div>
    `;

    // 3. 렌더링 및 이벤트 바인딩
    loadResources();
    loadEpisodeContent();
    document.getElementById('editResourcesButton').onclick = () => window.open(`#/resource/${novelId}`); // 새 탭에서 열기
    document.getElementById('generateSceneButton').addEventListener('click', handleGenerateClick);
    document.getElementById('proxyButton').addEventListener('click', handleProxyClick);
    document.getElementById('saveContentButton').addEventListener('click', handleSaveContent);
    document.getElementById('copyJapaneseButton').addEventListener('click', handleCopyClick);
}
