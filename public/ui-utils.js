// /public/ui-utils.js
// UI 유틸리티: 토스트, 모달, 로딩 상태 관리

/**
 * 토스트 알림 표시
 * @param {string} message - 표시할 메시지
 * @param {string} type - 'success', 'error', 'info', 'warning'
 * @param {number} duration - 표시 시간 (ms, 기본 3000)
 */
export function showToast(message, type = 'info', duration = 3000) {
  // 기존 토스트 컨테이너 찾기 또는 생성
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000; /* 규칙 #3: 모달(9000대)보다 높게 설정 */
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }

  // 토스트 엘리먼트 생성
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  // 타입별 색상 (다크모드에 맞게 조정)
  const colors = {
    success: '#28a745',
    error: '#dc3545',
    info: '#007aff',
    warning: '#ffc107'
  };
  
  toast.style.cssText = `
    background: ${colors[type] || colors.info};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    font-size: 14px;
    max-width: 350px;
    pointer-events: auto;
    animation: slideIn 0.3s ease-out;
    word-break: keep-all;
  `;
  
  toast.textContent = message;
  container.appendChild(toast);

  // 애니메이션 정의 (한 번만)
  if (!document.getElementById('toast-animation-style')) {
    const style = document.createElement('style');
    style.id = 'toast-animation-style';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  // 자동 제거
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => {
      if (container.contains(toast)) {
          container.removeChild(toast);
      }
      // 컨테이너가 비어있으면 제거
      if (container.children.length === 0) {
        if (document.body.contains(container)) {
            document.body.removeChild(container);
        }
      }
    }, 300);
  }, duration);
}

/**
 * 모달 생성 및 표시
 * @param {Object} options - 모달 옵션
 * @param {string} options.title - 모달 제목
 * @param {string|HTMLElement} options.content - 모달 내용 (HTML 문자열 또는 엘리먼트)
 * @param {Array} options.buttons - 버튼 배열 [{text: '확인', onClick: fn, primary: true}]
 * @param {boolean} options.closeOnBackdrop - 배경 클릭 시 닫기 (기본: false)
 * @returns {Object} - 모달 제어 객체 {close, element}
 */
export function showModal(options) {
  const {
    title = '알림',
    content = '',
    buttons = [{text: '확인', onClick: null, primary: true}],
    closeOnBackdrop = false
  } = options;

  // 현재 최상위 z-index 찾기 (규칙 #3: z-order 관리)
  const modals = document.querySelectorAll('.modal-overlay');
  let maxZIndex = 9000; // 모달 기본 z-index
  modals.forEach(modal => {
    const zIndex = parseInt(window.getComputedStyle(modal).zIndex);
    if (zIndex > maxZIndex) maxZIndex = zIndex;
  });
  const newZIndex = maxZIndex + 10; // 새 모달은 위로

  // 오버레이 생성
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6); /* 어둡게 */
    z-index: ${newZIndex};
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.2s ease-out;
  `;

  // 모달 컨테이너 (다크모드 스타일 적용)
  const modal = document.createElement('div');
  modal.className = 'modal-container';
  modal.style.cssText = `
    background: var(--bg-dark-2); /* 다크모드 배경 */
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    border-radius: 12px;
    padding: 24px;
    min-width: 300px;
    max-width: 600px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    animation: scaleIn 0.2s ease-out;
  `;

  // 제목
  const titleEl = document.createElement('h2');
  titleEl.textContent = title;
  titleEl.style.cssText = `
    margin: 0 0 16px 0;
    font-size: 20px;
    color: var(--text-primary);
  `;
  modal.appendChild(titleEl);

  // 내용
  const contentEl = document.createElement('div');
  contentEl.className = 'modal-content';
  contentEl.style.cssText = `
    margin-bottom: 20px;
    color: var(--text-secondary);
    line-height: 1.5;
  `;
  if (typeof content === 'string') {
    contentEl.innerHTML = content;
  } else {
    // [신규] 스타일 상속을 위해 모달 컨텐츠 내부 엘리먼트 스타일 조정
    contentEl.appendChild(content);
    contentEl.querySelectorAll('input, textarea, select, label').forEach(el => {
        el.style.color = 'var(--text-primary)';
        if(el.tagName === 'LABEL') el.style.marginBottom = '4px';
        if(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.style.width = '100%';
    });
  }
  modal.appendChild(contentEl);

  // 버튼 영역
  const buttonArea = document.createElement('div');
  buttonArea.style.cssText = `
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  `;

  // 모달 닫기 함수
  function closeModal() {
    overlay.style.animation = 'fadeIn 0.2s ease-out reverse';
    setTimeout(() => {
      if (document.body.contains(overlay)) {
          document.body.removeChild(overlay);
      }
    }, 200);
  }

  buttons.forEach(btn => {
    const button = document.createElement('button');
    button.textContent = btn.text;
    // [수정] 다크모드 버튼 스타일 적용
    button.style.cssText = `
      padding: 10px 16px;
      border: ${btn.primary ? '0' : '1px solid var(--border-color)'};
      border-radius: 8px;
      background: ${btn.primary ? 'var(--accent-blue)' : 'var(--bg-dark-3)'};
      color: ${btn.primary ? '#fff' : 'var(--text-primary)'};
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
    `;
    button.onclick = (e) => {
      // [신규] 버튼 비활성화 (규칙 #3)
      // 모달 닫기 전 작업이 오래 걸릴 수 있으므로 비활성화
      button.disabled = true;
      if (btn.onClick) {
        // onClick이 Promise를 반환할 경우를 대비 (하지만 현재는 동기/닫기만)
        btn.onClick(e);
      }
      closeModal();
    };
    buttonArea.appendChild(button);
  });
  modal.appendChild(buttonArea);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // 애니메이션 스타일 추가 (한 번만)
  if (!document.getElementById('modal-animation-style')) {
    const style = document.createElement('style');
    style.id = 'modal-animation-style';
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes scaleIn {
        from { transform: scale(0.9); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  // 배경 클릭 시 닫기
  if (closeOnBackdrop) {
    overlay.onclick = (e) => {
      if (e.target === overlay) closeModal();
    };
  }

  return {
    close: closeModal,
    element: overlay
  };
}

/**
 * 확인 모달 (예/아니오) (규칙 #3)
 * @param {string} message - 확인 메시지
 * @param {Function} onConfirm - 확인 시 콜백
 * @param {Function} onCancel - 취소 시 콜백
 */
export function confirmModal(message, onConfirm, onCancel = null) {
  return showModal({
    title: '확인',
    content: message,
    buttons: [
      { text: '취소', onClick: onCancel, primary: false },
      { text: '확인', onClick: onConfirm, primary: true }
    ]
  });
}

/**
 * 버튼 로딩 상태 토글 (규칙 #3: 버튼 비활성화)
 * @param {HTMLButtonElement} button - 버튼 엘리먼트
 * @param {boolean} loading - 로딩 상태
 * @param {string} loadingText - 로딩 중 텍스트 (기본: '처리 중...')
 */
export function toggleButtonLoading(button, loading, loadingText = '처리 중...') {
  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
  } else {
    // 버튼이 DOM에서 제거되었을 수 있음 (예: 뷰 전환)
    if (button) {
        button.textContent = button.dataset.originalText || button.textContent;
        button.disabled = false;
        delete button.dataset.originalText;
    }
  }
}
