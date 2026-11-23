(() => {
    'use strict';

    // ---------- 定数 ----------
    const KEY = 'memo-site:v2';
    const LEGACY_KEY = 'myMemos';          // 旧バージョンのデータ（読み取りのみ・削除しない）
    const LAST_KEY = 'memo-site:last';
    const COLLAPSE_KEY = 'memo-site:collapsed';
    const MOBILE = window.matchMedia('(max-width: 720px)');
    const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

    const $ = (id) => document.getElementById(id);
    const el = {
        app: $('app'), list: $('list'), search: $('search'), count: $('count'),
        newBtn: $('new-btn'), navBtn: $('nav-btn'), pinBtn: $('pin-btn'), deleteBtn: $('delete-btn'),
        scroll: $('scroll'), editor: $('editor'), empty: $('empty'), emptyNew: $('empty-new'),
        title: $('title'), body: $('body'), meta: $('meta'),
        toast: $('toast'), toastText: $('toast-text'), toastUndo: $('toast-undo'),
    };

    // ---------- 状態 ----------
    let memos = [];
    let currentId = null;
    let query = '';
    let lastDeleted = null;
    let saveTimer = null;
    let toastTimer = null;

    // ---------- ストレージ ----------
    const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
    const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 容量超過など */ } };

    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    function isValid(m) {
        return m && typeof m.id === 'string' && typeof m.title === 'string' && typeof m.body === 'string';
    }

    // 旧形式（文字列の配列）から移行する
    function migrateLegacy(legacy) {
        const now = Date.now();
        return legacy
            .filter((t) => typeof t === 'string' && t.trim() !== '')
            .map((text, i) => {
                const lines = text.replace(/\r\n/g, '\n').split('\n');
                const first = lines[0].trim();
                const splittable = first !== '' && first.length <= 60;
                return {
                    id: uid() + i,
                    title: splittable ? first : '',
                    body: splittable ? lines.slice(1).join('\n').replace(/^\n+/, '') : text,
                    pinned: false,
                    createdAt: now - i * 1000,
                    updatedAt: now - i * 1000, // 元の並び順を保つ
                };
            });
    }

    function load() {
        try {
            const raw = read(KEY);
            if (raw) {
                const data = JSON.parse(raw);
                if (Array.isArray(data)) return data.filter(isValid);
            }
            const legacy = JSON.parse(read(LEGACY_KEY) || '[]');
            if (Array.isArray(legacy) && legacy.length) {
                const migrated = migrateLegacy(legacy);
                write(KEY, JSON.stringify(migrated));
                return migrated;
            }
        } catch { /* 壊れたデータは無視 */ }
        return [];
    }

    function save() {
        clearTimeout(saveTimer);
        saveTimer = null;
        write(KEY, JSON.stringify(memos));
    }
    function scheduleSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(save, 250);
    }
    function flush() { if (saveTimer) save(); }

    // ---------- 日付 ----------
    const pad = (n) => String(n).padStart(2, '0');
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const DAY = 86400000;
    const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

    function shortDate(ts) {
        const d = new Date(ts), n = new Date();
        const diff = (startOfDay(n) - startOfDay(d)) / DAY;
        if (diff === 0) return hm(d);
        if (diff === 1) return '昨日';
        if (d.getFullYear() === n.getFullYear()) return `${d.getMonth() + 1}/${d.getDate()}`;
        return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    }

    function longDate(ts) {
        const d = new Date(ts), n = new Date();
        const diff = (startOfDay(n) - startOfDay(d)) / DAY;
        if (diff === 0) return `今日 ${hm(d)}`;
        if (diff === 1) return `昨日 ${hm(d)}`;
        const y = d.getFullYear() === n.getFullYear() ? '' : `${d.getFullYear()}年`;
        return `${y}${d.getMonth() + 1}月${d.getDate()}日 ${hm(d)}`;
    }

    function groupOf(m) {
        if (m.pinned) return 'ピン留め';
        const diff = (startOfDay(new Date()) - startOfDay(new Date(m.updatedAt))) / DAY;
        if (diff <= 0) return '今日';
        if (diff <= 1) return '昨日';
        if (diff <= 7) return '過去7日間';
        if (diff <= 30) return '過去30日間';
        return 'それ以前';
    }

    // ---------- 表示用ユーティリティ ----------
    function summarize(m) {
        const lines = m.body.split('\n').map((s) => s.trim()).filter(Boolean);
        if (m.title.trim()) return { title: m.title.trim(), preview: lines[0] || '', untitled: false };
        if (lines.length) return { title: lines[0], preview: lines[1] || '', untitled: false };
        return { title: '無題のメモ', preview: '', untitled: true };
    }

    const isEmpty = (m) => !m.title.trim() && !m.body.trim();
    const current = () => memos.find((m) => m.id === currentId) || null;

    function fit(t) {
        t.style.height = 'auto';
        t.style.height = t.scrollHeight + 'px';
    }

    // ---------- 一覧の描画 ----------
    function visibleMemos() {
        const q = query.trim().toLowerCase();
        const list = q
            ? memos.filter((m) => (m.title + '\n' + m.body).toLowerCase().includes(q))
            : memos.slice();
        return list.sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
    }

    const PIN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6Z"/><path d="M12 15v5"/></svg>';

    function renderList() {
        const items = visibleMemos();
        const frag = document.createDocumentFragment();

        if (!items.length) {
            const div = document.createElement('div');
            div.className = 'list-empty';
            div.textContent = query.trim() ? '見つかりませんでした' : 'メモはまだありません';
            frag.appendChild(div);
        }

        let label = null;
        for (const m of items) {
            const g = groupOf(m);
            if (g !== label) {
                label = g;
                const h = document.createElement('div');
                h.className = 'group-label';
                h.textContent = g;
                frag.appendChild(h);
            }
            const { title, preview, untitled } = summarize(m);
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'item' + (m.id === currentId ? ' selected' : '');
            b.dataset.id = m.id;

            const t = document.createElement('div');
            t.className = 'item-title';
            const ts = document.createElement('span');
            ts.textContent = title;
            if (untitled) ts.className = 'untitled';
            t.appendChild(ts);
            if (m.pinned) t.insertAdjacentHTML('beforeend', PIN_SVG);

            const sub = document.createElement('div');
            sub.className = 'item-sub';
            const d = document.createElement('span');
            d.className = 'item-date';
            d.textContent = shortDate(m.updatedAt);
            const p = document.createElement('span');
            p.className = 'item-preview';
            p.textContent = preview;
            sub.append(d, p);

            b.append(t, sub);
            frag.appendChild(b);
        }

        const scrollTop = el.list.scrollTop;
        el.list.replaceChildren(frag);
        el.list.scrollTop = scrollTop;
        el.count.textContent = `${memos.length}件のメモ`;
    }

    // ---------- エディタの描画 ----------
    function updateMeta() {
        const m = current();
        if (!m) return;
        const chars = m.body.replace(/\n/g, '').length;
        el.meta.textContent = `${longDate(m.updatedAt)}　·　${chars.toLocaleString()}文字`;
    }

    function renderEditor({ keepFields = false } = {}) {
        const m = current();
        el.editor.hidden = !m;
        el.empty.hidden = !!m;
        el.pinBtn.hidden = !m;
        el.deleteBtn.hidden = !m;
        if (!m) return;

        if (!keepFields) {
            el.title.value = m.title;
            el.body.value = m.body;
        }
        el.pinBtn.setAttribute('aria-pressed', String(m.pinned));
        const pinLabel = m.pinned ? 'ピン留めを外す' : 'ピン留め';
        el.pinBtn.title = pinLabel;
        el.pinBtn.setAttribute('aria-label', pinLabel);
        fit(el.title);
        updateMeta();
    }

    // ---------- 操作 ----------
    function setView(view) { el.app.dataset.view = view; }

    function removeIfEmpty(id) {
        const idx = memos.findIndex((m) => m.id === id);
        if (idx !== -1 && isEmpty(memos[idx])) memos.splice(idx, 1);
    }

    function select(id, { focus = null, scrollTop = true } = {}) {
        flush();
        if (currentId && currentId !== id) removeIfEmpty(currentId);
        currentId = memos.some((m) => m.id === id) ? id : null;
        if (currentId) write(LAST_KEY, currentId);
        save();
        renderList();
        renderEditor();
        if (currentId) {
            setView('editor');
            if (scrollTop) el.body.scrollTop = 0;
            if (focus) (focus === 'title' ? el.title : el.body).focus();
        }
    }

    function newMemo() {
        // すでに空のメモを開いているなら、それをそのまま使う
        const cur = current();
        if (cur && isEmpty(cur)) { setView('editor'); el.title.focus(); return; }
        if (query) { query = ''; el.search.value = ''; }
        const now = Date.now();
        const m = { id: uid(), title: '', body: '', pinned: false, createdAt: now, updatedAt: now };
        memos.unshift(m);
        select(m.id, { focus: 'title' });
    }

    function deleteCurrent() {
        const m = current();
        if (!m) return;
        flush();
        const sorted = visibleMemos();
        const pos = sorted.findIndex((x) => x.id === m.id);
        const next = sorted[pos + 1] || sorted[pos - 1] || null;
        const index = memos.findIndex((x) => x.id === m.id);
        memos.splice(index, 1);
        currentId = null;
        save();
        if (!isEmpty(m)) {
            lastDeleted = { memo: m, index };
            showToast('メモを削除しました');
        }
        if (MOBILE.matches || !next) {
            renderList();
            renderEditor();
            setView('list');
        } else {
            select(next.id);
        }
    }

    function undoDelete() {
        if (!lastDeleted) return;
        const { memo, index } = lastDeleted;
        lastDeleted = null;
        hideToast();
        memos.splice(Math.min(index, memos.length), 0, memo);
        select(memo.id);
    }

    function togglePin() {
        const m = current();
        if (!m) return;
        m.pinned = !m.pinned;
        save();
        renderList();
        renderEditor({ keepFields: true });
    }

    // ---------- トースト ----------
    function showToast(text) {
        el.toastText.textContent = text;
        el.toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(hideToast, 6000);
    }
    function hideToast() {
        el.toast.classList.remove('show');
        clearTimeout(toastTimer);
    }

    // ---------- 入力イベント ----------
    function onEdit() {
        const m = current();
        if (!m) return;
        m.title = el.title.value.replace(/\n/g, ' ');
        m.body = el.body.value;
        m.updatedAt = Date.now();
        fit(el.title);
        updateMeta();
        renderList();
        scheduleSave();
    }

    el.title.addEventListener('input', onEdit);
    el.body.addEventListener('input', onEdit);

    el.title.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) {
            e.preventDefault();
            el.body.focus();
            el.body.setSelectionRange(0, 0);
        }
    });
    el.body.addEventListener('keydown', (e) => {
        // 本文の先頭で Backspace → タイトル末尾へ
        if (e.key === 'Backspace' && !e.isComposing && el.body.selectionStart === 0 && el.body.selectionEnd === 0) {
            e.preventDefault();
            el.title.focus();
            el.title.setSelectionRange(el.title.value.length, el.title.value.length);
        }
    });

    // ---------- 一覧・ツールバー ----------
    el.list.addEventListener('click', (e) => {
        const item = e.target.closest('.item');
        if (item) select(item.dataset.id);
    });

    el.list.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        const items = [...el.list.querySelectorAll('.item')];
        const i = items.indexOf(document.activeElement);
        if (i === -1) return;
        e.preventDefault();
        const next = items[i + (e.key === 'ArrowDown' ? 1 : -1)];
        if (next) next.focus();
        else if (e.key === 'ArrowUp') el.search.focus();
    });

    el.search.addEventListener('input', () => {
        query = el.search.value;
        renderList();
    });
    el.search.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            el.search.value = '';
            query = '';
            renderList();
            el.search.blur();
        } else if (e.key === 'ArrowDown') {
            const first = el.list.querySelector('.item');
            if (first) { e.preventDefault(); first.focus(); }
        } else if (e.key === 'Enter' && !e.isComposing) {
            const first = el.list.querySelector('.item');
            if (first) select(first.dataset.id);
        }
    });

    el.newBtn.addEventListener('click', newMemo);
    el.emptyNew.addEventListener('click', newMemo);
    el.pinBtn.addEventListener('click', togglePin);
    el.deleteBtn.addEventListener('click', deleteCurrent);
    el.toastUndo.addEventListener('click', undoDelete);

    el.navBtn.addEventListener('click', () => {
        if (MOBILE.matches) {
            flush();
            if (currentId) removeIfEmpty(currentId), currentId = null, save();
            renderList();
            renderEditor();
            setView('list');
        } else {
            const collapsed = el.app.classList.toggle('collapsed');
            write(COLLAPSE_KEY, collapsed ? '1' : '0');
        }
    });

    // ---------- ショートカット ----------
    const inField = (t) => t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT');

    document.addEventListener('keydown', (e) => {
        const mod = e.metaKey || e.ctrlKey;
        if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            if (!MOBILE.matches) el.app.classList.remove('collapsed');
            else setView('list');
            el.search.focus();
            el.search.select();
        } else if (e.code === 'KeyN' && !e.shiftKey && ((mod && !e.altKey) || (e.altKey && !mod))) {
            e.preventDefault();
            newMemo();
        } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'z' && !inField(e.target) && lastDeleted) {
            e.preventDefault();
            undoDelete();
        }
    });

    // 他のタブでの変更を反映
    window.addEventListener('storage', (e) => {
        if (e.key !== KEY) return;
        memos = load();
        if (!memos.some((m) => m.id === currentId)) currentId = null;
        renderList();
        renderEditor({ keepFields: inField(document.activeElement) });
    });

    // 離脱時に確実に保存
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

    // 画面幅の変更時にフォームの高さを調整し直す
    window.addEventListener('resize', () => { if (!el.editor.hidden) fit(el.title); });

    // モバイル⇔デスクトップの切り替え時（回転・ウィンドウ幅変更）
    MOBILE.addEventListener('change', () => {
        if (MOBILE.matches) {
            setView(currentId ? 'editor' : 'list');
        } else {
            if (!currentId && memos.length) select(visibleMemos()[0].id, { scrollTop: false });
            else setView(currentId ? 'editor' : 'list');
        }
    });

    // ---------- 起動 ----------
    function init() {
        el.search.nextElementSibling.textContent = IS_MAC ? '⌘K' : 'Ctrl K';
        el.newBtn.title = IS_MAC ? '新規メモ (⌘N / Option+N)' : '新規メモ (Ctrl+N / Alt+N)';
        if (read(COLLAPSE_KEY) === '1') el.app.classList.add('collapsed');

        memos = load();
        const last = read(LAST_KEY);
        const start = memos.find((m) => m.id === last) || visibleMemos()[0];

        if (start && !MOBILE.matches) {
            currentId = start.id;
            renderList();
            renderEditor();
            setView('editor');
        } else {
            renderList();
            renderEditor();
            setView('list');
        }
    }

    init();
})();
