// /public/view-resource.js
// 리소스 관리 뷰
import { showToast, showModal, confirmModal, toggleButtonLoading } from './ui-utils.js';
import { callProxy } from './api.js';

const LS_KEY = 'novels';
let novels, novel, secretKey;

// --- 데이터 로직 ---
function loadNovels() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } }
function saveNovels(arr) { localStorage.setItem(LS_KEY, JSON.stringify(arr)); }

// --- 렌더링 로직 ---
function renderAll() {
    renderGrid('characters', novel.resources.characters);
    renderGrid('places', novel.resources.places);
    renderGrid('terms', novel.resources.terms);
    document.getElementById('notes-content').value = novel.resources.notes || "";
}

function createResourceCard(type, item, index) {
    const card = document.createElement('div');
    card.className = 'resource-card';
    card.dataset.index = index;
    const fieldsHtml = Object.entries(item).map(([key, value]) => `
        <div class="field">
            <input class="key" value="${key}" placeholder="필드명 (예: 이름, 말투)">
            <textarea class="value" rows="1" oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'" placeholder="값">${value}</textarea>
            <button class="del-field danger">×</button>
        </div>
    `).join('');
    // [개선] textarea를 사용하여 여러 줄 입력 지원
    card.innerHTML = `
        ${fieldsHtml}
        <div class="card-actions">
            <button class="add-field sub">➕ 필드 추가</button>
            <button class="del-card danger">🗑️ 카드 삭제</button>
        </div>
    `;
    // textarea 높이 자동 조절
    setTimeout(() => {
        card.querySelectorAll('textarea.value').forEach(el => {
            el.style.height = 'auto';
            el.style.height = el.scrollHeight + 'px';
        });
    }, 0);
    return card;
}

function renderGrid(type, data) {
    const gridEl = document.getElementById(`${type}-grid`);
    gridEl.innerHTML = '';
    data.forEach((item, index) => {
        gridEl.appendChild(createResourceCard(type, item, index));
    });
}

// --- 이벤트 핸들러 ---
function handleTabClick(e) {
    if (e.target.tagName !== 'BUTTON') return;
    const tabId = e.target.dataset.tab;
    
    document.querySelectorAll('.tab-nav button').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
}

function handleAddResource(type) {
    let newItem = {};
    if (type === 'characters') newItem = { 이름: "새 캐릭터", 설정: "..." };
    else if (type === 'places') newItem = { 장소명: "새 장소", 설정: "..." };
    else if (type === 'terms') newItem = { 용어: "새 용어", 의미: "..." };
    
    novel.resources[type].push(newItem);
    renderGrid(type, novel.resources[type]);
}

function handleCardEvents(e) {
    const card = e.target.closest('.resource-card');
    if (!card) return;

    if (e.target.classList.contains('add-field')) {
        const fieldDiv = document.createElement('div');
        fieldDiv.className = 'field';
        fieldDiv.innerHTML = `
            <input class="key" value="" placeholder="필드명">
            <textarea class="value" rows="1" oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'" placeholder="값"></textarea>
            <button class="del-field danger">×</button>
        `;
        e.target.closest('.card-actions').before(fieldDiv);
    }

    if (e.target.classList.contains('del-field')) {
        e.target.closest('.field').remove();
    }

    if (e.target.classList.contains('del-card')) {
        confirmModal('이 리소스 카드를 삭제하시겠습니까?', () => {
            const index = parseInt(card.dataset.index, 10);
            const type = card.closest('.tab-content').id.split('-')[1];
            novel.resources[type].splice(index, 1);
            renderGrid(type, novel.resources[type]); // re-render
            showToast('카드가 삭제되었습니다.', 'info');
        });
    }
}

function saveAll() {
    try {
        const types = ['characters', 'places', 'terms'];
        types.forEach(type => {
            const gridEl = document.getElementById(`${type}-grid`);
            const newResourceArray = [];
            gridEl.querySelectorAll('.resource-card').forEach(card => {
                const newResourceItem = {};
                card.querySelectorAll('.field').forEach(field => {
                    const key = field.querySelector('.key').value.trim();
                    const value = field.querySelector('.value').value; // .trim() 제거 (줄바꿈 유지)
                    if (key) { newResourceItem[key] = value; }
                });
                if (Object.keys(newResourceItem).length > 0) {
                    newResourceArray.push(newResourceItem);
                }
            });
            novel.resources[type] = newResourceArray;
        });
        novel.resources.notes = document.getElementById('notes-content').value;
        novel.updatedAt = Date.now();
        const novelIndex = novels.findIndex(n => n.id === novel.id);
        novels[novelIndex] = novel;
        saveNovels(novels);
        showToast('리소스가 성공적으로 저장되었습니다.', 'success');
        renderAll();
    } catch (error) {
        console.error('저장 오류:', error);
        showToast(`저장 중 오류 발생: ${error.message}`, 'error');
    }
}

// [신규] AI 리소스 생성 핸들러
function handleAiGenerate() {
    const modalContent = document.createElement('div');
    modalContent.style.cssText = 'display:flex; flex-direction:column; gap:12px;';
    modalContent.innerHTML = `
        <label for="modalAiType">리소스 타입:</label>
        <select id="modalAiType">
            <option value="characters">등장인물</option>
            <option value="places">배경/장소</option>
            <option value="terms">고유 용어</option>
        </select>
        <label for="modalAiPrompt">요청 사항:</label>
        <textarea id="modalAiPrompt" rows="4" placeholder="예: 20대, 은발, 냉철한 성격의 천재 해커"></textarea>
    `;

    showModal({
        title: 'AI로 리소스 생성',
        content: modalContent,
        buttons: [
            { text: '취소', onClick: null, primary: false },
            { 
              text: '생성', 
              onClick: async () => {
                const type = document.getElementById('modalAiType').value;
                const userPrompt = document.getElementById('modalAiPrompt').value;
                if (!userPrompt) return showToast('요청 사항을 입력하세요.', 'warning');
                
                const aiPrompt = `다음 요청에 맞는 리소스 데이터를 JSON 객체 형식으로 생성해줘. 키는 한국어(예: "이름", "설정", "나이", "말투")로, 값은 문자열로 작성해줘. JSON 마크다운(\`\`\`json ... \`\`\`) 없이 순수 JSON 객체만 응답해줘.
요청: "${userPrompt}"`;
                
                const modal = document.querySelector('.modal-overlay'); // 모달 위에 로딩 표시
                if(modal) modal.style.opacity = '0.5';

                try {
                    const data = await callProxy('gemini-2.5-flash-lite', aiPrompt, secretKey);
                    let text = data.text.replace(/```json/g, '').replace(/```/g, '').trim();
                    let newItem = {};
                    try {
                        newItem = JSON.parse(text);
                    } catch (e) {
                        showToast('AI가 JSON 형식이 아닌 응답을 반환했습니다. 설정으로 저장합니다.', 'warning');
                        newItem = { "이름": "AI 생성", "설정": text };
                    }
                    
                    novel.resources[type].push(newItem);
                    renderGrid(type, novel.resources[type]);
                    showToast('AI 리소스 생성 완료!', 'success');
                    
                } catch (e) {
                    showToast(`AI 생성 오류: ${e.message}`, 'error', 5000);
                } finally {
                    if(modal) modal.style.opacity = '1';
                }
              }, 
              primary: true 
            }
        ]
    });
}

// --- 뷰 초기화 ---
export function initResourceView(container, novelId) {
    // 1. 데이터 초기화
    secretKey = localStorage.getItem('MY_SECRET_KEY');
    novels = loadNovels();
    novel = novels.find(n => n.id === novelId);
    if (!novel) {
        container.innerHTML = '<h1>소설을 찾을 수 없습니다.</h1><a href="#/">목록으로</a>';
        return;
    }
    // 마스터 리소스 보장
    if (!novel.resources) novel.resources = { characters: [], places: [], terms: [], notes: "" };
    if (!novel.resources.characters) novel.resources.characters = [];
    if (!novel.resources.places) novel.resources.places = [];
    if (!novel.resources.terms) novel.resources.terms = [];

    // 2. 뷰 HTML 삽입
    container.innerHTML = `
        <h1 id="novelTitle">${novel.title} - 리소스 관리</h1>
        <a id="backToNovel" href="#/novel/${novelId}?ep=1" style="color: var(--accent-blue);">← 집필실로 돌아가기</a>
        <div class="tab-nav" style="margin-top: 20px;">
            <button class="tab-btn active" data-tab="tab-characters">등장인물</button>
            <button class="tab-btn" data-tab="tab-places">배경/장소</button>
            <button class="tab-btn" data-tab="tab-terms">고유 용어</button>
            <button class="tab-btn" data-tab="tab-notes">초기 메모</button>
        </div>

        <div id="tab-characters" class="tab-content active">
            <div style="margin-bottom: 10px;">
                <button id="addCharacter" class="sub">➕ 등장인물 추가</button>
                <button id="aiAddCharacter" class="resource" style="margin-left: 8px;">🤖 AI로 추가</button>
            </div>
            <div id="characters-grid" class="resource-grid"></div>
        </div>
        <div id="tab-places" class="tab-content">
            <div style="margin-bottom: 10px;">
                <button id="addPlace" class="sub">➕ 배경/장소 추가</button>
                <button id="aiAddPlace" class="resource" style="margin-left: 8px;">🤖 AI로 추가</button>
            </div>
            <div id="places-grid" class="resource-grid"></div>
        </div>
        <div id="tab-terms" class="tab-content">
            <div style="margin-bottom: 10px;">
                <button id="addTerm" class="sub">➕ 고유 용어 추가</button>
                <button id="aiAddTerm" class="resource" style="margin-left: 8px;">🤖 AI로 추가</button>
            </div>
            <div id="terms-grid" class="resource-grid"></div>
        </div>
        <div id="tab-notes" class="tab-content">
            <textarea id="notes-content" rows="15" style="width: 100%;"></textarea>
        </div>
        
        <button id="saveAll" class="save" style="position: fixed; bottom: 20px; right: 20px; z-index: 100;">💾 전체 저장</button>
    `;

    // 3. 렌더링 및 이벤트 바인딩
    renderAll();
    container.querySelector('.tab-nav').addEventListener('click', handleTabClick);
    container.querySelector('#saveAll').addEventListener('click', saveAll);
    // 수동 추가
    container.querySelector('#addCharacter').addEventListener('click', () => handleAddResource('characters'));
    container.querySelector('#addPlace').addEventListener('click', () => handleAddResource('places'));
    container.querySelector('#addTerm').addEventListener('click', () => handleAddResource('terms'));
    // AI 추가
    container.querySelector('#aiAddCharacter').addEventListener('click', handleAiGenerate);
    container.querySelector('#aiAddPlace').addEventListener('click', handleAiGenerate);
    container.querySelector('#aiAddTerm').addEventListener('click', handleAiGenerate);
    // 카드 이벤트 위임
    container.addEventListener('click', handleCardEvents);
    container.addEventListener('input', (e) => { // textarea 높이 자동 조절
        if (e.target.tagName === 'TEXTAREA' && e.target.classList.contains('value')) {
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
        }
    });
}
