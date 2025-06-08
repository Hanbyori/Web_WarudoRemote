let buttons = [];
let categories = [];
let currentCategory = '미분류';
let editingButtonId = null;
let buttonIdCounter = 1;
let categoryIdCounter = 1;
let draggedElement = null;
let draggedButtonId = null;

let websocket = null;
let isConnected = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectDelay = 3000;

document.addEventListener('DOMContentLoaded', function() {
    loadCategories();
    loadButtons();
    loadTheme();
    updateCategoryTabs();
    updateDisplay();
    initializeEventListeners();
    connectWebSocket();
});

function initializeEventListeners() {
    document.getElementById('editInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            saveButtonName();
        }
    });

    document.getElementById('categoryInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            saveCategoryName();
        }
    });

    document.getElementById('editModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeEditModal();
        }
    });

    document.getElementById('categoryModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeCategoryModal();
        }
    });
}

function addNewButton() {
    const newButton = {
        id: buttonIdCounter++,
        name: `버튼 ${buttons.length + 1}`,
        image: null,
        order: buttons.length,
        favorited: false,
        category: currentCategory
    };
    buttons.push(newButton);
    saveButtons();
    updateDisplay();
}

function updateDisplay() {
    const container = document.getElementById('buttonsContainer');
    const emptyState = document.getElementById('emptyState');
    
    let displayButtons = buttons.filter(button => button.category === currentCategory);
    
    displayButtons.sort((a, b) => {
        if (a.favorited && !b.favorited) return -1;
        if (!a.favorited && b.favorited) return 1;
        return (a.order || 0) - (b.order || 0);
    });
    
    if (displayButtons.length === 0) {
        container.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    container.style.display = 'grid';
    emptyState.style.display = 'none';
    
    container.innerHTML = displayButtons.map(button => `
        <div class="custom-button" 
             draggable="true" 
             data-button-id="${button.id}"
             onclick="executeButton('${button.name}')">
            <div class="favorite-btn ${button.favorited ? 'favorited' : ''}" 
                 onclick="event.stopPropagation(); toggleFavorite(${button.id})">
                ${button.favorited ? '★' : '☆'}
            </div>
            <div class="drag-handle">⋮⋮</div>
            ${button.image ? 
                `<img src="${button.image}" alt="${button.name}" class="button-image">` :
                `<div class="default-icon">📋</div>`
            }
            <div class="button-name">${button.name}</div>
            <div class="button-controls">
                <button class="control-btn edit-btn" onclick="event.stopPropagation(); editButtonName(${button.id})">이름</button>
                <button class="control-btn image-btn" onclick="event.stopPropagation(); changeButtonImage(${button.id})">이미지</button>
                <button class="control-btn delete-btn" onclick="event.stopPropagation(); deleteButton(${button.id})">삭제</button>
            </div>
        </div>
    `).join('');
    
    addDragAndDropEvents();
}

function toggleFavorite(buttonId) {
    const button = buttons.find(b => b.id === buttonId);
    if (button) {
        button.favorited = !button.favorited;
        saveButtons();
        updateDisplay();
        
        const message = button.favorited ? '즐겨찾기에 추가되었습니다.' : '즐겨찾기에서 제거되었습니다.';
        showNotification(message, 'info');
    }
}

function addDragAndDropEvents() {
    const buttonElements = document.querySelectorAll('.custom-button');
    
    buttonElements.forEach(element => {
        element.addEventListener('dragstart', handleDragStart);
        element.addEventListener('dragover', handleDragOver);
        element.addEventListener('drop', handleDrop);
        element.addEventListener('dragend', handleDragEnd);
        element.addEventListener('dragenter', handleDragEnter);
        element.addEventListener('dragleave', handleDragLeave);
    });
    
    addCategoryDragEvents();
}

function addCategoryDragEvents() {
    const categoryTabs = document.querySelectorAll('.category-tab');
    
    categoryTabs.forEach(tab => {
        tab.addEventListener('dragover', handleCategoryDragOver);
        tab.addEventListener('drop', handleCategoryDrop);
        tab.addEventListener('dragenter', handleCategoryDragEnter);
        tab.addEventListener('dragleave', handleCategoryDragLeave);
    });
}

function handleDragStart(e) {
    draggedElement = this;
    draggedButtonId = parseInt(this.dataset.buttonId);
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.outerHTML);
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    this.classList.add('drag-over');
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    if (draggedElement !== this) {
        const draggedId = parseInt(draggedElement.dataset.buttonId);
        const targetId = parseInt(this.dataset.buttonId);
        
        reorderButtons(draggedId, targetId);
    }
    
    return false;
}

function handleDragEnd(e) {
    const buttonElements = document.querySelectorAll('.custom-button');
    const categoryTabs = document.querySelectorAll('.category-tab');
    
    buttonElements.forEach(element => {
        element.classList.remove('dragging', 'drag-over');
    });
    
    categoryTabs.forEach(tab => {
        tab.classList.remove('drag-over');
    });
    
    draggedElement = null;
    draggedButtonId = null;
}

function handleCategoryDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleCategoryDragEnter(e) {
    if (draggedButtonId) {
        this.classList.add('drag-over');
    }
}

function handleCategoryDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleCategoryDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    if (e.preventDefault) {
        e.preventDefault();
    }
    
    if (draggedButtonId) {
        const targetCategoryName = this.getAttribute('data-category-name');
        console.log('Drop 이벤트 : ', draggedButtonId, '→', targetCategoryName);
        moveButtonToCategory(draggedButtonId, targetCategoryName);
    }
    
    return false;
}

function moveButtonToCategory(buttonId, targetCategory) {
    console.log('moveButtonToCategory 호출 : ', buttonId, '→', targetCategory);
    const button = buttons.find(b => b.id === buttonId);
    
    if (button && button.category !== targetCategory) {
        const oldCategory = button.category;
        button.category = targetCategory;
        saveButtons();
        
        console.log('버튼 이동 완료 : ', oldCategory, '→', targetCategory);
        showNotification(`버튼이 "${targetCategory}" 카테고리로 이동되었습니다.`, 'success');
        
        updateDisplay();
    } else {
        console.log('버튼을 찾을 수 없음');
    }
}

function reorderButtons(draggedId, targetId) {
    const draggedIndex = buttons.findIndex(b => b.id === draggedId);
    const targetIndex = buttons.findIndex(b => b.id === targetId);
    
    if (draggedIndex !== -1 && targetIndex !== -1) {
        const draggedButton = buttons.splice(draggedIndex, 1)[0];
        buttons.splice(targetIndex, 0, draggedButton);
        
        buttons.forEach((button, index) => {
            button.order = index;
        });
        
        saveButtons();
        updateDisplay();
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    updateThemeIcon(newTheme);
    saveTheme(newTheme);
}

function updateThemeIcon(theme) {
    const themeIcon = document.getElementById('themeIcon');
    themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function saveTheme(theme) {
    try {
        localStorage.setItem('theme', theme);
    } catch (error) {
        console.warn('테마 저장에 실패 : ', error);
    }
}

function loadTheme() {
    try {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeIcon(savedTheme);
    } catch (error) {
        console.warn('테마 불러오기 실패 : ', error);
        document.documentElement.setAttribute('data-theme', 'light');
        updateThemeIcon('light');
    }
}

function executeButton(buttonName) {
    const sent = sendWebSocketMessage(buttonName);
    
    if (sent) {
        showNotification(`"${buttonName}" 전송됨 ✅`, 'success');
    } else {
        showNotification(`"${buttonName}" 전송 실패 ❌`, 'error');
    }
}

function showNotification(message, type = 'info') {
    const existingNotification = document.getElementById('notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.id = 'notification';
    notification.textContent = message;
    
    notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        padding: 15px 25px;
        border-radius: 25px;
        font-weight: bold;
        font-size: 16px;
        z-index: 1002;
        animation: fadeInOut 2s ease-in-out;
        pointer-events: none;
    `;
    
    switch (type) {
        case 'success':
            notification.style.background = '#28a745';
            notification.style.color = 'white';
            break;
        case 'error':
            notification.style.background = '#dc3545';
            notification.style.color = 'white';
            break;
        default:
            notification.style.background = '#007bff';
            notification.style.color = 'white';
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 2000);
}

function connectWebSocket() {
    try {
        websocket = new WebSocket('ws://localhost:19070');
        
        websocket.onopen = function(event) {
            console.log('웹소켓 연결 성공');
            isConnected = true;
            reconnectAttempts = 0;
            updateConnectionStatus(true);
        };
        
        websocket.onmessage = function(event) {
            console.log('메세지 수신 : ', event.data);
        };
        
        websocket.onclose = function(event) {
            console.log('웹소켓 연결 종료');
            isConnected = false;
            updateConnectionStatus(false);
            
            if (reconnectAttempts < maxReconnectAttempts) {
                reconnectAttempts++;
                console.log(`재연결 시도 ${reconnectAttempts}/${maxReconnectAttempts}`);
                setTimeout(connectWebSocket, reconnectDelay);
            } else {
                console.log('웹소켓 연결 실패');
            }
        };
        
        websocket.onerror = function(error) {
            console.error('웹소켓 오류 : ', error);
            isConnected = false;
            updateConnectionStatus(false);
        };
        
    } catch (error) {
        console.error('웹소켓 연결 실패 : ', error);
        isConnected = false;
        updateConnectionStatus(false);
    }
}

function updateConnectionStatus(connected) {
    let statusElement = document.getElementById('connectionStatus');
    
    if (!statusElement) {
        statusElement = document.createElement('div');
        statusElement.id = 'connectionStatus';
        statusElement.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 15px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            z-index: 1001;
            transition: all 0.3s ease;
        `;
        document.body.appendChild(statusElement);
    }
    
    if (connected) {
        statusElement.textContent = '🟢 Warudo 연결됨';
        statusElement.style.background = '#28a745';
        statusElement.style.color = 'white';
    } else {
        statusElement.textContent = '🔴 Warudo 연결 안됨';
        statusElement.style.background = '#dc3545';
        statusElement.style.color = 'white';
    }
}

function sendWebSocketMessage(message) {
    if (isConnected && websocket && websocket.readyState === WebSocket.OPEN) {
        try {
            const data = {
                action: 'button_click',
                data: {
                    button_name: message,
                    timestamp: new Date().toISOString()
                }
            };
            websocket.send(JSON.stringify(data));
            console.log('메시지 전송 : ', data);
            return true;
        } catch (error) {
            console.error('메시지 전송 실패 : ', error);
            return false;
        }
    } else {
        console.warn('웹소켓이 연결 에러');
        return false;
    }
}

function editButtonName(buttonId) {
    const button = buttons.find(b => b.id === buttonId);
    if (!button) return;

    editingButtonId = buttonId;
    document.getElementById('editInput').value = button.name;
    document.getElementById('editModal').style.display = 'flex';
    document.getElementById('editInput').focus();
}

function saveButtonName() {
    const newName = document.getElementById('editInput').value.trim();
    if (!newName) {
        alert('버튼 이름을 입력해주세요.');
        return;
    }

    const button = buttons.find(b => b.id === editingButtonId);
    if (button) {
        button.name = newName;
        saveButtons();
        updateDisplay();
    }
    closeEditModal();
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    editingButtonId = null;
}

function changeButtonImage(buttonId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            alert('이미지 파일 크기가 너무 큽니다. 5MB 이하의 파일을 선택해주세요.');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const button = buttons.find(b => b.id === buttonId);
            if (button) {
                button.image = e.target.result;
                saveButtons();
                updateDisplay();
            }
        };
        reader.readAsDataURL(file);
    };
    
    input.click();
}

function deleteButton(buttonId) {
    buttons = buttons.filter(b => b.id !== buttonId);
    saveButtons();
    updateDisplay();
}

function saveButtons() {
    try {
        localStorage.setItem('customButtons', JSON.stringify(buttons));
        localStorage.setItem('buttonIdCounter', buttonIdCounter.toString());
    } catch (error) {
        console.warn('데이터 저장 실패 : ', error);
    }
}

function loadButtons() {
    try {
        const savedButtons = localStorage.getItem('customButtons');
        const savedCounter = localStorage.getItem('buttonIdCounter');
        
        if (savedButtons) {
            buttons = JSON.parse(savedButtons);

            buttons.forEach(button => {
                if (button.favorited === undefined) {
                    button.favorited = false;
                }
                if (button.category === undefined) {
                    button.category = '미분류';
                }
            });
        }
        
        if (savedCounter) {
            buttonIdCounter = parseInt(savedCounter);
        }
    } catch (error) {
        console.warn('데이터 불러오기 실패 : ', error);
        buttons = [];
        buttonIdCounter = 1;
    }
}

function loadCategories() {
    try {
        const savedCategories = localStorage.getItem('categories');
        const savedCategoryCounter = localStorage.getItem('categoryIdCounter');
        
        if (savedCategories) {
            categories = JSON.parse(savedCategories);
        } else {
            categories = [{ id: 1, name: '미분류' }];
            categoryIdCounter = 2;
        }
        
        if (savedCategoryCounter) {
            categoryIdCounter = parseInt(savedCategoryCounter);
        }
        
        if (!categories.find(cat => cat.name === '미분류')) {
            categories.unshift({ id: categoryIdCounter++, name: '미분류' });
        }
        
    } catch (error) {
        console.warn('카테고리 불러오기 실패 : ', error);
        categories = [{ id: 1, name: '미분류' }];
        categoryIdCounter = 2;
    }
}

function saveCategories() {
    try {
        localStorage.setItem('categories', JSON.stringify(categories));
        localStorage.setItem('categoryIdCounter', categoryIdCounter.toString());
    } catch (error) {
        console.warn('카테고리 저장 실패 : ', error);
    }
}

function updateCategoryTabs() {
    const container = document.getElementById('categoryTabs');
    
    container.innerHTML = categories.map(category => `
        <div class="category-tab ${category.name === currentCategory ? 'active' : ''}" 
             onclick="switchCategory('${category.name}')"
             data-category-name="${category.name}">
            ${category.name}
            ${category.name !== '미분류' ? 
                `<button class="category-delete-btn" onclick="event.stopPropagation(); deleteCategory('${category.name}')">×</button>` : 
                ''
            }
        </div>
    `).join('');
    
    addCategoryDragEvents();
}

function switchCategory(categoryName) {
    currentCategory = categoryName;
    updateCategoryTabs();
    updateDisplay();
}

function addNewCategory() {
    document.getElementById('categoryModal').style.display = 'flex';
    document.getElementById('categoryInput').focus();
}

function saveCategoryName() {
    const newName = document.getElementById('categoryInput').value.trim();
    if (!newName) {
        alert('카테고리 이름을 입력해주세요.');
        return;
    }
    
    if (categories.find(cat => cat.name === newName)) {
        alert('이미 존재하는 카테고리입니다.');
        return;
    }
    
    const newCategory = {
        id: categoryIdCounter++,
        name: newName
    };
    
    categories.push(newCategory);
    saveCategories();
    updateCategoryTabs();
    closeCategoryModal();
    
    showNotification(`"${newName}" 카테고리가 생성되었습니다.`, 'success');
}

function closeCategoryModal() {
    document.getElementById('categoryModal').style.display = 'none';
    document.getElementById('categoryInput').value = '';
}

function deleteCategory(categoryName) {
    if (categoryName === '미분류') {
        alert('미분류 카테고리는 삭제할 수 없습니다.');
        return;
    }
    
    if (!confirm(`"${categoryName}" 카테고리를 삭제하시겠습니까?\n이 카테고리의 모든 버튼은 미분류로 이동됩니다.`)) {
        return;
    }
    
    buttons.forEach(button => {
        if (button.category === categoryName) {
            button.category = '미분류';
        }
    });
    
    categories = categories.filter(cat => cat.name !== categoryName);
    
    if (currentCategory === categoryName) {
        currentCategory = '미분류';
    }
    
    saveCategories();
    saveButtons();
    updateCategoryTabs();
    updateDisplay();
    
    showNotification(`"${categoryName}" 카테고리가 삭제되었습니다`, 'info');
}

// 데이터 내보내기/가져오기 기능
function exportData() {
    const exportData = {
        version: "1.0",
        timestamp: new Date().toISOString(),
        categories: categories,
        buttons: buttons.map(button => ({
            ...button,
            image: button.image
            // image: null // 이미지 제외
        })),
        settings: {
            theme: document.documentElement.getAttribute('data-theme') || 'light'
        }
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `warudo-remote-설정_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showNotification('설정을 내보냈습니다.', 'success');
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const importedData = JSON.parse(e.target.result);
                
                if (!importedData.categories || !importedData.buttons) {
                    throw new Error('올바르지 않은 파일 형식입니다.');
                }
                
                if (!confirm('현재 설정을 모두 덮어씌우시겠습니까?\n기존 데이터는 복구할 수 없습니다.')) {
                    return;
                }
                
                categories = importedData.categories;
                buttons = importedData.buttons.map(button => ({
                    ...button,
                    id: buttonIdCounter++
                }));
                
                if (categories.length > 0) {
                    categoryIdCounter = Math.max(...categories.map(c => c.id)) + 1;
                }
                
                const defaultCategory = categories.find(cat => cat.name === '미분류');
                currentCategory = defaultCategory ? defaultCategory.name : categories[0].name;
                
                if (importedData.settings && importedData.settings.theme) {
                    document.documentElement.setAttribute('data-theme', importedData.settings.theme);
                    updateThemeIcon(importedData.settings.theme);
                    saveTheme(importedData.settings.theme);
                }
                
                saveCategories();
                saveButtons();
                updateCategoryTabs();
                updateDisplay();
                
                showNotification('설정을 불러왔습니다.', 'success');
                
            } catch (error) {
                console.error('가져오기 오류 : ', error);
                alert('파일을 읽는 중 오류가 발생했습니다.\n올바른 설정 파일인지 확인해주세요.');
            }
        };
        reader.readAsText(file);
    };
    
    input.click();
}