const container = document.getElementById('memo-container');
const input = document.getElementById('memo-input');
const contextMenu = document.getElementById('context-menu');
const handle = document.getElementById('resize-handle');
let targetMemo = null;
let deletedMemo = null;
let isResizing = false;

// 上部ドラッグによるリサイズ
handle.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);
});

function resize(e) {
    if (!isResizing) return;
    const containerBottom = document.querySelector('.input-area').getBoundingClientRect().bottom;
    const newHeight = containerBottom - e.clientY;
    if (newHeight > 60) input.style.height = `${newHeight}px`;
}
function stopResize() { isResizing = false; document.removeEventListener('mousemove', resize); }

window.onload = () => {
    const savedMemos = JSON.parse(localStorage.getItem('myMemos') || '[]');
    savedMemos.forEach(text => createMemoElement(text));
};

function createMemoElement(text) {
    const div = document.createElement('div');
    div.className = 'memo-item';
    div.draggable = true;
    const textarea = document.createElement('textarea');
    textarea.className = 'memo-content';
    textarea.value = text;
    textarea.addEventListener('input', saveAll);
    div.appendChild(textarea);
    div.addEventListener('dragstart', () => div.classList.add('dragging'));
    div.addEventListener('dragend', () => { div.classList.remove('dragging'); saveAll(); });
    div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        targetMemo = div;
        contextMenu.style.display = 'block';
        contextMenu.style.left = `${e.pageX}px`;
        contextMenu.style.top = `${e.pageY}px`;
    });
    container.appendChild(div);
}

function saveAll() {
    const memos = [...document.querySelectorAll('.memo-content')].map(t => t.value);
    localStorage.setItem('myMemos', JSON.stringify(memos));
}

function addMemo() {
    const text = input.value.trim();
    if (text === "") return;
    createMemoElement(text);
    input.value = "";
    input.focus();
    saveAll();
}

document.getElementById('delete-option').addEventListener('click', () => {
    if (targetMemo) {
        deletedMemo = targetMemo.querySelector('.memo-content').value;
        targetMemo.remove();
        saveAll();
    }
    contextMenu.style.display = 'none';
});

document.addEventListener('click', () => contextMenu.style.display = 'none');
input.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') addMemo();
});

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (deletedMemo) {
            createMemoElement(deletedMemo);
            saveAll();
            deletedMemo = null;
        }
    }
});

container.addEventListener('dragover', (e) => {
    e.preventDefault();
    const draggingItem = document.querySelector('.dragging');
    const siblings = [...container.querySelectorAll('.memo-item:not(.dragging)')];
    let nextSibling = siblings.find(sibling => e.clientX <= sibling.offsetLeft + sibling.offsetWidth / 2);
    container.insertBefore(draggingItem, nextSibling);
});
