// /public/router.js
// 해시 기반 SPA 라우터

const routes = {
    '': loadListView,
    '#/': loadListView,
    '#/novel': loadNovelView,
    '#/resource': loadResourceView
};

async function loadListView(container) {
    const { initListView } = await import('./view-list.js');
    initListView(container);
}

async function loadNovelView(container, params) {
    const { initNovelView } = await import('./view-novel.js');
    initNovelView(container, params.id, params.ep);
}

async function loadResourceView(container, params) {
    const { initResourceView } = await import('./view-resource.js');
    initResourceView(container, params.id);
}

function parseHash() {
    const hash = window.location.hash || '#/';
    const [path, query] = hash.split('?');
    
    // 예: #/novel/nov_123 -> ['#', 'novel', 'nov_123']
    const pathParts = path.split('/'); 
    const mainPath = '#/' + (pathParts[1] || '');
    
    const params = {};
    if (pathParts[2]) {
        params.id = pathParts[2];
    }
    
    if (query) {
        new URLSearchParams(query).forEach((value, key) => {
            params[key] = value;
        });
    }

    // [신규] #/novel/nov_123?ep=2 처리
    // URLSearchParams가 ep=2를 이미 처리했지만, 명시적으로 ep 파라미터를 찾습니다.
    const urlParams = new URLSearchParams(query);
    if (urlParams.has('ep')) {
        params.ep = urlParams.get('ep');
    }

    return { route: routes[mainPath], params };
}

async function handleRouteChange() {
    const container = document.getElementById('app-container');
    if (!container) return;
    
    container.innerHTML = '<h1>로딩 중...</h1>'; // 뷰 전환 시 로딩 표시

    const { route, params } = parseHash();

    if (route) {
        try {
            await route(container, params);
        } catch (error) {
            console.error('뷰 로딩 실패:', error);
            container.innerHTML = `<h1>오류</h1><p>${error.message}</p><a href="#/">홈으로</a>`;
        }
    } else {
        container.innerHTML = '<h1>404 - 페이지를 찾을 수 없음</h1><a href="#/">홈으로</a>';
    }
}

export function initRouter() {
    window.addEventListener('hashchange', handleRouteChange);
    handleRouteChange(); // 초기 페이지 로드
}
