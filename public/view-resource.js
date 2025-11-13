// /public/view-resource.js
// 리소스 관리 뷰
import { showToast, showModal, confirmModal, toggleButtonLoading } from './ui-utils.js';
import { callProxy } from './api.js';

const LS_KEY = 'novels';
let novels, novel, secretKey;
// [신규] 리소스 관리 뷰는 항상 '마스터 리소스'만 다루도록 명시
// (회차별 스냅샷은 집필실에서만 관리)
let masterResources;

// --- 데이터 로직 ---
function loadNovels() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } }
function saveNovels(arr) { localStorage.setItem(LS_KEY, JSON.stringify(arr)); }

// --- 렌더링 로직 ---
function renderAll() {
    // [수정] masterResources 사용
    renderGrid('characters', masterResources.characters);
    renderGrid('places', masterResources.places);
    renderGrid('terms', masterResources.terms);
    document.getElementById('notes-content').value = masterResources.notes || "";
}

function createResourceCard(type, item, index) {
    const card = document.createElement('div');
    card.className = 'resource-card';
    card.dataset.index = index;
    const fieldsHtml = Object.entries(item).map(([key, value]) => `
        <div class="field">
            <input class="key" value="${key}" placeholder="필드명 (예: 이름, 말투)">
            <textarea class="value" rows="1" oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'" placeholder="값">${value}</textarea>
            <!-- [수정] 규칙 #3: 이모지 -> 텍스트 -->
            <button class="del-field danger">[X]</button>
        </div>
    `).join('');
    
    // [수정] 규칙 #3: 이모지 -> 텍스트
    card.innerHTML = `
        ${fieldsHtml}
        <div class="card-actions">
            <button class="add-field sub">[+] 필드 추가</button>
            <button class="del-card danger">[삭제] 카드</button>
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
// ... (변경 없음) ...
}

function handleAddResource(type) {
    let newItem = {};
    if (type === 'characters') newItem = { 이름: "새 캐릭터", 설정: "..." };
    else if (type === 'places') newItem = { 장소명: "새 장소", 설정: "..." };
    else if (type === 'terms') newItem = { 용어: "새 용어", 의미: "..." };
    
    // [수정] masterResources 사용
    masterResources[type].push(newItem);
    renderGrid(type, masterResources[type]);
}

function handleCardEvents(e) {
    const card = e.target.closest('.resource-card');
    if (!card) return;

    if (e.target.classList.contains('add-field')) {
// ... (변경 없음) ...
    }

    if (e.target.classList.contains('del-field')) {
        e.target.closest('.field').remove();
    }

    if (e.target.classList.contains('del-card')) {
        confirmModal('이 리소스 카드를 삭제하시겠습니까?', () => {
            const index = parseInt(card.dataset.index, 10);
            const type = card.closest('.tab-content').id.split('-')[1];
            // [수정] masterResources 사용
            masterResources[type].splice(index, 1);
            renderGrid(type, masterResources[type]); // re-render
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
            // [수정] masterResources 사용
            masterResources[type] = newResourceArray;
        });
        // [수정] masterResources 사용
        masterResources.notes = document.getElementById('notes-content').value;
        
        // --- localStorage에 저장 ---
        novel.resources = masterResources; // 마스터 리소스 업데이트
        novel.updatedAt = Date.now();
        const novelIndex = novels.findIndex(n => n.id === novel.id);
        novels[novelIndex] = novel;
        saveNovels(novels);
        
        showToast('마스터 리소스가 성공적으로 저장되었습니다.', 'success');
        // 변경 사항(특히 인덱스)을 다시 렌더링
        renderAll();
    } catch (error) {
        console.error('저장 오류:', error);
        showToast(`저장 중 오류 발생: ${error.message}`, 'error');
    }
}

// [신규] AI 리소스 생성 핸들러
function handleAiGenerate() {
    const modalContent = document.createElement('div');
// ... (변경 없음) ...
    showModal({
        title: 'AI로 리소스 생성',
// ... (중간 생략) ...
              onClick: async () => {
// ... (중간 생략) ...
                try {
                    const data = await callProxy('gemini-2.5-flash-lite', aiPrompt, secretKey);
// ... (중간 생략) ...
                    } catch (e) {
// ... (중간 생략) ...
                    }
                    
                    // [수정] masterResources 사용
                    masterResources[type].push(newItem);
                    renderGrid(type, masterResources[type]);
                    showToast('AI 리소스 생성 완료!', 'success');
                    
                } catch (e) {
// ... (중간 생략) ...
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
// ... (변경 없음) ...
        return;
    }
    
    // [수정] 이 뷰는 항상 마스터 리소스만 편집 (Deep Copy로 원본 보호)
    masterResources = JSON.parse(JSON.stringify(
        novel.resources || { characters: [], places: [], terms: [], notes: "" }
    ));
    
    // 마스터 리소스 구조 보장
    if (!masterResources.characters) masterResources.characters = [];
    if (!masterResources.places) masterResources.places = [];
    if (!masterResources.terms) masterResources.terms = [];

    // 2. 뷰 HTML 삽입
    // [수정] 규칙 #3: 이모지 -> 텍스트
    container.innerHTML = `
        <h1 id="novelTitle">${novel.title} - 마스터 리소스 관리</h1>
        <a id="backToNovel" href="#/novel/${novelId}?ep=1" style="color: var(--accent-blue);">← 집필실로 돌아가기</a>
        <div class="tab-nav" style="margin-top: 20px;">
            <button class="tab-btn active" data-tab="tab-characters">등장인물</button>
            <button class="tab-btn" data-tab="tab-places">배경/장소</button>
            <button class="tab-btn" data-tab="tab-terms">고유 용어</button>
            <button class="tab-btn" data-tab="tab-notes">초기 메모</button>
        </div>

        <div id="tab-characters" class="tab-content active">
            <div style="margin-bottom: 10px;">
                <button id="addCharacter" class="sub">[+] 등장인물 추가</button>
                <button id="aiAddCharacter" class="resource" style="margin-left: 8px;">[AI] 추가</button>
            </div>
            <div id="characters-grid" class="resource-grid"></div>
        </div>
        <div id="tab-places" class="tab-content">
            <div style="margin-bottom: 10px;">
                <button id="addPlace" class="sub">[+] 배경/장소 추가</button>
                <button id="aiAddPlace" class="resource" style="margin-left: 8px;">[AI] 추가</button>
            </div>
            <div id="places-grid" class="resource-grid"></div>
        </div>
        <div id="tab-terms" class="tab-content">
            <div style="margin-bottom: 10px;">
                <button id="addTerm" class="sub">[+] 고유 용어 추가</button>
                <button id="aiAddTerm" class="resource" style="margin-left: 8px;">[AI] 추가</button>
            </div>
            <div id="terms-grid" class="resource-grid"></div>
        </div>
        <div id="tab-notes" class="tab-content">
            <textarea id="notes-content" rows="15" style="width: 100%;"></textarea>
        </div>
        
        <button id="saveAll" class="save" style="position: fixed; bottom: 20px; right: 20px; z-index: 100;">[저장] 마스터 리소스</button>
    `;

    // 3. 렌더링 및 이벤트 바인딩
    renderAll();
// ... (중간 생략) ...
    // AI 추가
    container.querySelector('#aiAddCharacter').addEventListener('click', handleAiGenerate);
    container.querySelector('#aiAddPlace').addEventListener('click', handleAiGenerate);
    container.querySelector('#aiAddTerm').addEventListener('click', handleAiGenerate);
    // 카드 이벤트 위임
// ... (중간 생략) ...
    container.addEventListener('input', (e) => { // textarea 높이 자동 조절
        if (e.target.tagName === 'TEXTAREA' && e.target.classList.contains('value')) {
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
        }
    });
}
