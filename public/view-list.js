// /public/view-list.js
// 소설 목록 뷰 (메인 페이지)
import { showToast, showModal } from './ui-utils.js';

const LS_KEY = 'novels';

// --- 데이터 로직 ---

/**
 * localStorage에서 소설 목록을 로드합니다.
 * @returns {Array} 소설 배열
 */
function loadNovels() {
    try {
        return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    } catch {
        localStorage.removeItem(LS_KEY); // 손상된 데이터 정리
        return [];
    }
}

/**
 * 소설 목록을 localStorage에 저장합니다.
 * @param {Array} arr - 저장할 소설 배열
 */
function saveNovels(arr) {
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
}

/**
 * 새 소설 객체를 생성합니다.
 * @param {string} title - 소설 제목
 * @param {object} resources - 초기 리소스 객체
 * @returns {object} 새 소설 객체
 */
function createNewNovel(title, resources) {
    const now = Date.now();
    const newNovel = {
        id: `nov_${now}`,
        title: title || '제목 없는 소설',
        createdAt: now,
        updatedAt: now,
        resources: resources || { characters: [], places: [], terms: [], notes: "" },
        episodes: [
            {
                no: 1,
                title: "1화",
                content: "", // 초기 본문
                createdAt: now,
                updatedAt: now,
                resources: null // 회차 스냅샷 (초기엔 없음)
            }
        ]
    };
    return newNovel;
}

// --- 렌더링 로직 ---

/**
 * 컨테이너에 소설 목록을 렌더링합니다.
 * @param {HTMLElement} container - 앱 컨테이너
 * @param {Array} novels - 렌더링할 소설 배열
 */
function renderNovelList(container, novels) {
    const gridEl = container.querySelector('#novel-grid');
    if (!gridEl) return;

    gridEl.innerHTML = ''; // 목록 초기화

    if (novels.length === 0) {
        gridEl.innerHTML = '<p style="color: var(--text-secondary);">아직 생성된 소설이 없습니다. 새 소설을 만들어주세요.</p>';
        return;
    }

    // 최신순 정렬 (updatedAt 기준 내림차순)
    novels.sort((a, b) => b.updatedAt - a.updatedAt);

    novels.forEach(novel => {
        const card = document.createElement('a');
        card.className = 'card'; // index.html에 정의된 스타일 사용
        card.href = `#/novel/${novel.id}?ep=1`; // 1화 집필실로 이동
        
        const episodeCount = (novel.episodes || []).length;
        const lastUpdated = new Date(novel.updatedAt).toLocaleString('ko-KR');

        card.innerHTML = `
            <h3>${novel.title}</h3>
            <p class="meta">총 ${episodeCount}화</p>
            <p class="meta">최근 수정: ${lastUpdated}</p>
        `;
        gridEl.appendChild(card);
    });
}

// --- 이벤트 핸들러 ---

/**
 * '새 소설 생성' 버튼 클릭 시 모달을 엽니다.
 * (시스템 프롬프트 #10: 모달 기반 생성 플로우)
 */
function handleCreateNovelClick() {
    const modalContent = document.createElement('div');
    modalContent.style.cssText = 'display:flex; flex-direction:column; gap:12px;';
    modalContent.innerHTML = `
        <label for="modalNovelTitle">소설 제목:</label>
        <input id="modalNovelTitle" type="text" placeholder="새 소설의 제목을 입력하세요">
        <label for="modalNovelNotes">초기 메모 (선택 사항):</label>
        <textarea id="modalNovelNotes" rows="5" placeholder="초기 설정, 캐릭터, 플롯 아이디어 등을 자유롭게 적어주세요. 이 내용은 '리소스 > 초기 메모' 탭에 저장됩니다."></textarea>
    `;

    showModal({
        title: '새 소설 생성',
        content: modalContent,
        buttons: [
            { text: '취소', onClick: null, primary: false },
            { 
              text: '생성 및 시작', 
              onClick: () => {
                const title = document.getElementById('modalNovelTitle').value || '제목 없는 소설';
                const notes = document.getElementById('modalNovelNotes').value || '';
                
                // 기본 리소스 구조에 메모 추가
                const resources = { 
                    characters: [], 
                    places: [], 
                    terms: [], 
                    notes: notes 
                };

                const newNovel = createNewNovel(title, resources);
                const novels = loadNovels();
                novels.push(newNovel);
                saveNovels(novels);
                
                showToast('새 소설이 생성되었습니다!', 'success');
                
                // 생성된 소설의 1화 집필실로 바로 이동
                window.location.hash = `#/novel/${newNovel.id}?ep=1`;
              }, 
              primary: true 
            }
        ]
    });
}


// --- 뷰 초기화 ---

/**
 * 목록 뷰를 초기화하고 컨테이너에 렌더링합니다.
 * @param {HTMLElement} container - 메인 앱 컨테이너
 */
export function initListView(container) {
    // 1. 뷰 HTML 삽입
    container.innerHTML = `
        <div class="row" style="justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h1>내 소설 목록</h1>
            <button id="createNovelButton">✨ 새 소설 생성</button>
        </div>
        <div class="grid" id="novel-grid">
            </div>
    `;

    // 2. 데이터 로드 및 렌더링
    const novels = loadNovels();
    renderNovelList(container, novels);

    // 3. 이벤트 바인딩
    document.getElementById('createNovelButton').addEventListener('click', handleCreateNovelClick);
}
