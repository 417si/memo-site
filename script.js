const container = document.getElementById('memo-container');
const input = document.getElementById('memo-input');
const contextMenu = document.getElementById('context-menu');
let targetMemo = null;
let deletedMemo = null; // 削除取り消し用（直近1件）

// 1. ページ読み込み時に保存されたデータを表示
window.onload = () => {
    const savedMemos = JSON.parse(localStorage.getItem('myMemos') || '[]');
    savedMemos.forEach(text => createMemoElement(text));
};

// 2. メモ要素を生成する関数
function createMemoElement(text) {
    const div = document.createElement('div');
    div.className = 'memo-item';
    div.draggable = true;
    
    const textarea = document.createElement('textarea');
    textarea.className = 'memo-content';
    textarea.value = text;
    
    // 内容変更時に保存
    textarea.addEventListener('input', saveAll);
    
    div.appendChild(textarea);
    
    // ドラッグ操作（並び替え）
    div.addEventListener('dragstart', () => div.classList.add('dragging'));
    div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
        saveAll();
    });

    // 右クリックメニューの表示
    div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        targetMemo = div;
        contextMenu.style.display = 'block';
        contextMenu.style.left = `${e.pageX}px`;
        contextMenu.style.top = `${e.pageY}px`;
    });
    
    container.appendChild(div);
}

// 3. データをlocalStorageに保存する関数
function saveAll() {
    const memos = [...document.querySelectorAll('.memo-content')].map(t => t.value);
    localStorage.setItem('myMemos', JSON.stringify(memos));
}

// 4. 新規メモ追加
function addMemo() {
    const text = input.value.trim();
    if (text === "") return;
    
    createMemoElement(text);
    input.value = "";
    input.focus();
    saveAll();
}

// 右クリックメニューの「削除」アクション
document.getElementById('delete-option').addEventListener('click', () => {
    if (targetMemo) {
        // 削除直前にデータを退避
        deletedMemo = targetMemo.querySelector('.memo-content').value;
        targetMemo.remove();
        saveAll();
    }
    contextMenu.style.display = 'none';
});

// メニュー以外をクリックで閉じる
document.addEventListener('click', () => contextMenu.style.display = 'none');

// Ctrl + Enter で追加
input.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') addMemo();
});

// Ctrl + Z (Undo) で削除の取り消し
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

// 並び替えのドラッグ＆ドロップロジック
container.addEventListener('dragover', (e) => {
    e.preventDefault();
    const draggingItem = document.querySelector('.dragging');
    const siblings = [...container.querySelectorAll('.memo-item:not(.dragging)')];
    
    let nextSibling = siblings.find(sibling => {
        return e.clientX <= sibling.offsetLeft + sibling.offsetWidth / 2;
    });

    container.insertBefore(draggingItem, nextSibling);
});