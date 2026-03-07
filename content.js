/* ============================================
  PageNote - Content Script
  便签创建 / 拖动 / 调整大小 / 关闭
  ============================================ */

(() => {
  'use strict';

  /* =====================
     注入 Google Fonts 手写字体
     ===================== */
  if (!document.querySelector('link[href*="fonts.googleapis.com/css2?family=Caveat"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600&family=Long+Cang&display=swap';
    document.head.appendChild(link);
  }

  // 把关键样式注入页面 DOM，提升 Edge 自带网页截图对便签的兼容性
  ensureInPageNoteStyles();

  function ensureInPageNoteStyles() {
    if (document.getElementById('pagenote-inpage-style')) return;
    const style = document.createElement('style');
    style.id = 'pagenote-inpage-style';
    style.textContent = `
      .pagenote-sticky{position:absolute;z-index:2147483640;min-width:110px;min-height:36px;width:300px;height:40px;display:flex;flex-direction:column;opacity:0;transform:scale(0.85) translateY(12px);animation:pagenote-enter .3s cubic-bezier(.22,1,.36,1) forwards;transition:width .15s ease,height .15s ease,left .15s ease}
      @keyframes pagenote-enter{to{opacity:1;transform:scale(1) translateY(0)}}
      .pagenote-sticky.pagenote-removing{animation:pagenote-exit .25s cubic-bezier(.55,.06,.68,.19) forwards}
      @keyframes pagenote-exit{from{opacity:1;transform:scale(1) translateY(0)}to{opacity:0;height:40px;transform:scale(0.8) translateY(16px)}}
      .pagenote-editor{box-sizing:border-box;width:100%;height:100%;padding:14px 18px;font-family:'Caveat','Long Cang',cursive;font-size:22px;line-height:32px;color:#2c2c2c;background-color:#fffef5;background-image:linear-gradient(to bottom,transparent 31px,#e5e0d2 31px,#e5e0d2 32px);background-size:100% 32px;background-position-y:14px;background-attachment:local;border:1px solid #e0dbd0;border-radius:6px;overflow:clip;outline:none;cursor:text;white-space:pre-wrap;word-break:break-word;box-shadow:0 1px 5px rgba(0,0,0,.07)}
      .pagenote-editor:empty::before{content:attr(data-placeholder);color:#c0b9a8;font-style:italic;pointer-events:none}
      .pagenote-drag-handle{position:absolute;top:0;left:0;right:0;height:18px;cursor:grab;z-index:3;opacity:0;transition:opacity .2s ease}
      .pagenote-drag-handle::after{content:'';position:absolute;top:4px;left:50%;transform:translateX(-50%);width:40px;max-width:calc(100% - 50px);height:5px;background:#d5d0c4;border-radius:3px}
      .pagenote-sticky.pagenote-fixed{position:fixed}
      .pagenote-pin{position:absolute;top:-5px;right:8px;width:13px;height:13px;background:#e8b93d;border:2px solid #fffef5;border-radius:50%;cursor:pointer;opacity:0;transition:opacity .2s ease,transform .15s ease,background .15s ease;z-index:3;padding:0;outline:none}
      .pagenote-pin.pagenote-pinned{background:#5b9bd5}
      .pagenote-pin:hover{transform:scale(1.3)}
      .pagenote-close{position:absolute;top:-5px;right:-5px;width:13px;height:13px;background:#e85d5d;border:2px solid #fffef5;border-radius:50%;cursor:pointer;opacity:0;transition:opacity .2s ease,transform .15s ease;z-index:3;padding:0;outline:none}
      .pagenote-resize-br{position:absolute;bottom:0;right:0;width:20px;height:20px;cursor:nwse-resize;z-index:3;opacity:0;transition:opacity .2s ease;border-radius:0 0 6px 0;overflow:hidden}
      .pagenote-resize-br svg{position:absolute;bottom:3px;right:3px;width:10px;height:10px;pointer-events:none}
      .pagenote-sticky:hover .pagenote-drag-handle,.pagenote-sticky:hover .pagenote-close,.pagenote-sticky:hover .pagenote-pin,.pagenote-sticky:hover .pagenote-resize-br{opacity:1}
      .pagenote-dragging .pagenote-sticky{transition:none !important}
      .pagenote-sticky.pagenote-singleline{overflow:visible}
      .pagenote-sticky.pagenote-singleline .pagenote-editor{padding:0 12px;background-image:none;white-space:nowrap;overflow:visible;display:flex;align-items:center;justify-content:center;text-align:center}
      .pagenote-sticky.pagenote-singleline .pagenote-drag-handle::after{top:2px;transform:translateX(-50%)}
      .pagenote-stats{position:absolute;top:3px;left:8px;font-size:10px;font-family:monospace,sans-serif;color:#c0b9a8;pointer-events:none;z-index:2;opacity:0;transition:opacity .2s ease;user-select:none;line-height:1}
      .pagenote-sticky:hover .pagenote-stats{opacity:1}
      .pagenote-sticky.pagenote-singleline .pagenote-stats{display:none}
    `;
    document.head.appendChild(style);
  }

  /* =====================
     持久化：存储 key 生成 & 读写
     ===================== */
  function storageKey() {
    return 'pagenote:' + location.href.split('#')[0];
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /** 收集当前页面所有便签数据 */
  function collectNotes() {
    const notes = document.querySelectorAll('.pagenote-sticky');
    return Array.from(notes).map(n => ({
      id: n.dataset.noteId,
      left: n.style.left,
      top: n.style.top,
      width: n.style.width,
      height: n.style.height,
      html: n.querySelector('.pagenote-editor').innerHTML,
      pinned: n.classList.contains('pagenote-fixed'),
    }));
  }

  /** 保存所有便签到 storage */
  function saveNotes() {
    try {
      const data = collectNotes();
      chrome.storage.local.set({ [storageKey()]: data });
    } catch (_e) { /* storage 不可用时静默忽略 */ }
  }

  /** 防抖保存 */
  let _saveTimer = null;
  function debounceSave() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(saveNotes, 400);
  }

  /** 页面加载时恢复便签 */
  function restoreNotes() {
    try {
      const key = storageKey();
      chrome.storage.local.get(key, (result) => {
        const list = result[key];
        if (!Array.isArray(list) || list.length === 0) return;
        list.forEach(data => {
          createNote(null, null, data);
        });
      });
    } catch (_e) { /* storage 不可用时静默忽略 */ }
  }

  // 页面加载后恢复
  restoreNotes();

  /* =====================
     消息监听
     ===================== */
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'addNote') {
      createNote(msg.x, msg.y);
      sendResponse({ ok: true });
    }
  });

  /* =====================
     创建便签
     ===================== */
  function createNote(x, y, saved) {
    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const posX = saved ? parseInt(saved.left, 10) : ((x ?? (window.innerWidth / 2 - 150)) + scrollX);
    const posY = saved ? parseInt(saved.top, 10) : ((y ?? (window.innerHeight / 3)) + scrollY);

    // 容器
    const note = document.createElement('div');
    note.className = 'pagenote-sticky';
    note.dataset.noteId = saved ? saved.id : generateId();
    note.style.left = posX + 'px';
    note.style.top = posY + 'px';
    if (saved && saved.width) note.style.width = saved.width;
    if (saved && saved.height) note.style.height = saved.height;

    // 拖拽把手
    const handle = document.createElement('div');
    handle.className = 'pagenote-drag-handle';

    // 定位切换按钮 (小黄点)
    const pinBtn = document.createElement('button');
    pinBtn.className = 'pagenote-pin';
    pinBtn.title = '切换：固定在屏幕 / 跟随页面';
    if (saved && saved.pinned) {
      pinBtn.classList.add('pagenote-pinned');
      note.classList.add('pagenote-fixed');
      // 固定模式：saved 坐标即为视口坐标，直接使用
    }
    pinBtn.addEventListener('click', () => {
      const isFixed = note.classList.contains('pagenote-fixed');
      const scrollX = window.scrollX || document.documentElement.scrollLeft;
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const curLeft = parseInt(note.style.left, 10) || 0;
      const curTop = parseInt(note.style.top, 10) || 0;
      if (isFixed) {
        // fixed → absolute：视口坐标 → 页面坐标
        note.classList.remove('pagenote-fixed');
        pinBtn.classList.remove('pagenote-pinned');
        note.style.left = (curLeft + scrollX) + 'px';
        note.style.top = (curTop + scrollY) + 'px';
        pinBtn.title = '切换：固定在屏幕 / 跟随页面';
      } else {
        // absolute → fixed：页面坐标 → 视口坐标
        note.classList.add('pagenote-fixed');
        pinBtn.classList.add('pagenote-pinned');
        note.style.left = (curLeft - scrollX) + 'px';
        note.style.top = (curTop - scrollY) + 'px';
        pinBtn.title = '切换：固定在屏幕 / 跟随页面';
      }
      saveNotes();
    });

    // 关闭按钮 (小红点)
    const closeBtn = document.createElement('button');
    closeBtn.className = 'pagenote-close';
    closeBtn.title = '删除便签';
    closeBtn.addEventListener('click', () => {
      note.classList.add('pagenote-removing');
      note.addEventListener('animationend', () => {
        note.remove();
        saveNotes();
      }, { once: true });
    });

    // 编辑区域（不用 textarea，提升 Edge 自带网页截图兼容性）
    const editor = document.createElement('div');
    editor.className = 'pagenote-editor';
    editor.contentEditable = 'true';
    editor.setAttribute('data-placeholder', '写点什么…');
    editor.spellcheck = false;
    editor.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text');
      document.execCommand('insertText', false, text);
    });
    if (saved && saved.html) editor.innerHTML = saved.html;

    // Resize 把手 - 右下角 (SVG 斜纹)
    const resizeBR = document.createElement('div');
    resizeBR.className = 'pagenote-resize-br';
    resizeBR.innerHTML =
      '<svg viewBox="0 0 10 10"><line x1="9" y1="1" x2="1" y2="9" stroke="#c5bfb0" stroke-width="1.2" stroke-linecap="round"/>' +
      '<line x1="9" y1="5" x2="5" y2="9" stroke="#c5bfb0" stroke-width="1.2" stroke-linecap="round"/></svg>';

    // 统计信息（多行模式左上角）
    const statsEl = document.createElement('div');
    statsEl.className = 'pagenote-stats';

    note.appendChild(handle);
    note.appendChild(pinBtn);
    note.appendChild(closeBtn);
    note.appendChild(editor);
    note.appendChild(resizeBR);
    note.appendChild(statsEl);
    document.body.appendChild(note);

    if (!saved) {
      setTimeout(() => placeCaretAtEnd(editor), 50);
      debounceSave();
    }

    initDrag(note, handle);
    initResize(note, resizeBR);
    editor.addEventListener('input', () => {
      // contenteditable 删空后会留下孤立 <br>，导致 :empty 不匹配、再退格才显示 placeholder
      if (editor.innerHTML === '<br>') editor.innerHTML = '';
      autoGrowHeight(note, editor);
      updateStats(editor, statsEl);
      debounceSave();
    });
    // re-check single-line mode on restore
    autoGrowHeight(note, editor);
    updateStats(editor, statsEl);
  }

  /* =====================
     拖拽 (绝对定位，跟随页面)
     ===================== */
  function initDrag(note, handle) {
    let dragging = false;
    let useClient = false;
    let startMouseX, startMouseY, startLeft, startTop;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = true;
      useClient = note.classList.contains('pagenote-fixed');
      startMouseX = useClient ? e.clientX : e.pageX;
      startMouseY = useClient ? e.clientY : e.pageY;
      startLeft = parseInt(note.style.left, 10) || 0;
      startTop = parseInt(note.style.top, 10) || 0;
      document.body.classList.add('pagenote-dragging');
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const mx = useClient ? e.clientX : e.pageX;
      const my = useClient ? e.clientY : e.pageY;
      note.style.left = (startLeft + mx - startMouseX) + 'px';
      note.style.top = (startTop + my - startMouseY) + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (dragging) {
        dragging = false;
        document.body.classList.remove('pagenote-dragging');
        saveNotes();
      }
    });
  }

  /* =====================
     自定义 resize（仅右下角，左右对称延伸）
     ===================== */
  function initResize(note, resizeHandle) {
    let resizing = false;
    let startX, startY, startW, startH, startCenterX;

    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      resizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startW = note.offsetWidth;
      startH = note.offsetHeight;
      const startLeft = parseInt(note.style.left, 10) || 0;
      startCenterX = startLeft + startW / 2;
      document.body.classList.add('pagenote-dragging');
    });

    document.addEventListener('mousemove', (e) => {
      if (!resizing) return;
      // 高度：仅向下拖动改变
      const dy = e.clientY - startY;
      const newH = Math.max(SINGLE_LINE_H, startH + dy);
      note.style.height = newH + 'px';
      applySingleLineMode(note, newH);

      // 宽度：右侧拖动，左侧镜像，中心点不动
      // 最小宽度：单行模式下不得低于文本所需宽度（含左右 padding）
      const editor = note.querySelector('.pagenote-editor');
      let minW = MIN_W;
      if (note.classList.contains('pagenote-singleline') && editor) {
        editor.style.width = 'max-content';
        minW = Math.max(MIN_W, editor.offsetWidth);
        editor.style.width = '';
      }
      const dx = e.clientX - startX;
      const newW = Math.max(minW, startW + dx * 2);
      note.style.width = newW + 'px';
      note.style.left = Math.round(startCenterX - newW / 2) + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (resizing) {
        resizing = false;
        document.body.classList.remove('pagenote-dragging');
        saveNotes();
      }
    });
  }

  /* =====================
     尺寸常量
     ===================== */
  const SINGLE_LINE_H = 36;   // 单行模式阈值高度(px)
  const MULTI_LINE_H  = 94;   // 多行模式最小高度(px)：PAD_V + LINE_H + PAD_V*2
  const MIN_W = 110;           // 最小宽度(px)
  const LINE_H = 32;           // 行高(px)
  const PAD_V = 14;            // 上下留白(px)

  function applySingleLineMode(note, h) {
    if (h <= SINGLE_LINE_H) {
      note.classList.add('pagenote-singleline');
    } else {
      note.classList.remove('pagenote-singleline');
    }
  }

  /* =====================
     自动增减高度（内容驱动）
     ===================== */
  function autoGrowHeight(note, editor) {
    const curH = note.offsetHeight;
    applySingleLineMode(note, curH);

    if (note.classList.contains('pagenote-singleline')) {
      autoGrowWidth(note, editor);
      return;
    }

    // scrollHeight 含上下 padding，是内容的自然高度
    const naturalH = editor.scrollHeight;

    // 若当前便签比自然高度高出超过一行 → 用户刻意留了空间，不收缩
    if (curH - naturalH > LINE_H + 4) return;

    // 扩展时：底部额外留 PAD_V 使上下空余对称；收缩时：直接对齐自然高度
    const growing = naturalH > curH;
    const targetH = Math.max(MULTI_LINE_H, growing ? naturalH + PAD_V : naturalH);
    if (Math.abs(targetH - curH) > 2) {
      note.style.height = targetH + 'px';
    }
  }

  /* =====================
     单行模式：自动横向扩宽（两侧对称）
     ===================== */
  function autoGrowWidth(note, editor) {
    // 临时设为 max-content 以测量文本实际所需宽度
    editor.style.width = 'max-content';
    const textW = editor.offsetWidth; // 含左右 padding
    editor.style.width = '';          // 还原 CSS width: 100%

    // 用 getBoundingClientRect 获取当前视觉位置（正确处理 transition 进行中的情况）
    const rect = note.getBoundingClientRect();
    const isFixed = note.classList.contains('pagenote-fixed');
    const scrollX = isFixed ? 0 : (window.scrollX || document.documentElement.scrollLeft);
    const visualLeft = rect.left + scrollX;  // 页面坐标系下的左边位置
    const visualW = rect.width;

    const targetW = Math.max(MIN_W, textW);
    if (Math.abs(targetW - visualW) > 1) {
      const centerX = visualLeft + visualW / 2;
      note.style.width = targetW + 'px';
      note.style.left = Math.round(centerX - targetW / 2) + 'px';
    }
  }

  /* =====================
     统计字数 / 词数
     ===================== */
  function updateStats(editor, statsEl) {
    const text = editor.innerText || '';
    // 字数：非空白字符数
    const charCount = text.replace(/\s/g, '').length;
    // 词数：每个 CJK 字符各计 1 词，连续非 CJK 非空白序列计 1 词
    const wordCount = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7a3]|[^\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7a3\s]+/g) || []).length;
    statsEl.textContent = wordCount + '|' + charCount;
  }

  function placeCaretAtEnd(element) {
    element.focus();
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
})();
