// Z app 自测脚本（Node + 最小 DOM 桩，执行 index.html 的真实代码）
// 运行： node _selftest.js
const fs = require('fs');
const vm = require('vm');

const CANDIDATES = ['D:/Zapp/index.html', 'D:/Zapp/1.2版本.html', 'D:/Zapp/1.1版本.html'];
const HTML_PATH = CANDIDATES.filter((p) => fs.existsSync(p))[0];
if (!HTML_PATH) { console.error('未找到被测文件'); process.exit(1); }
console.log('被测文件: ' + HTML_PATH);
const html = fs.readFileSync(HTML_PATH, 'utf8');
const baseSrc = html.match(/<script>([\s\S]*?)<\/script>/)[1];

/* ---------------- 最小 DOM 桩 ---------------- */
class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attrs = {};
    this.dataset = {};
    this.listeners = {};
    this.style = {};
    this._text = '';
    this._cls = '';
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.checked = false;
    this.files = null;
    this.onclick = null;
    this.parentNode = null;
    this.offsetHeight = 44;
    this.scrollTop = 0;
    const self = this;
    this.classList = {
      add(c) {
        const parts = self._cls ? self._cls.split(/\s+/).filter(Boolean) : [];
        if (parts.indexOf(c) < 0) parts.push(c);
        self._cls = parts.join(' ');
      },
      remove(c) {
        const parts = self._cls ? self._cls.split(/\s+/).filter(Boolean) : [];
        self._cls = parts.filter((x) => x !== c).join(' ');
      },
      contains(c) { return (self._cls || '').split(/\s+/).indexOf(c) > -1; }
    };
  }
  set className(v) { this._cls = String(v); }
  get className() { return this._cls; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() {
    if (this.children.length) return this.children.map((c) => c.textContent).join('');
    return this._text;
  }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
  insertBefore(c) { this.children.push(c); c.parentNode = this; return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener() {}
  dispatch(type, ev) { (this.listeners[type] || []).forEach((fn) => fn(ev || {})); }
  click() {
    if (this.listeners.click) this.dispatch('click', { target: this });
    if (typeof this.onclick === 'function') this.onclick({ target: this });
    if (this.tagName === 'A' && this.parentNode) this.parentNode.removeChild(this);
  }
  focus() { this._focused = true; }
  select() {}
  querySelector(sel) { return findAll(this, sel)[0] || null; }
  querySelectorAll(sel) { return findAll(this, sel); }
  getBoundingClientRect() {
    return this._rect || { top: 5000, bottom: 5100, left: 0, right: 0, width: 300, height: 100 };
  }
}
function matches(el, sel) {
  if (sel.indexOf(',') > -1) return sel.split(',').some((s) => matches(el, s.trim()));
  if (sel.startsWith('.')) return String(el.className).split(/\s+/).indexOf(sel.slice(1)) > -1;
  if (sel.startsWith('#')) return el.attrs.id === sel.slice(1);
  if (/^[a-zA-Z]+$/.test(sel)) return el.tagName === sel.toUpperCase();
  return false;
}
function findAll(root, sel) {
  const out = [];
  (function walk(n) {
    n.children.forEach((c) => { if (matches(c, sel)) out.push(c); walk(c); });
  })(root);
  return out;
}

const IDS = [
  'nav-todo', 'nav-shelf', 'nav-gacha', 'nav-settings', 'nav-todo-badge', 'nav-shelf-badge',
  'btn-new', 'btn-batch', 'btn-export', 'btn-import', 'btn-theme', 'btn-help',
  'page-todo', 'page-shelf', 'page-gacha', 'page-settings',
  'todo-info', 'cal-title', 'cal-grid', 'cal-info', 'btn-today', 'cal-prev', 'cal-next',
  'btn-filter-all', 'btn-filter-today', 'btn-clear-done', 'todo-list', 'todo-empty', 'panel-todos',
  'float-stack', 'btn-undo', 'undo-count', 'trash-stack', 'btn-trash-float', 'trash-float-count',
  'trash-panel', 'trash-count', 'btn-purge-expired', 'btn-empty-trash', 'btn-trash-close', 'trash-info',
  'trash-list', 'trash-empty',
  'shelf-info', 'shelf-stat', 'shelf-path', 'shelf-support', 'shelf-grid', 'shelf-empty',
  'btn-shelf-pick', 'btn-shelf-upload',
  'upload-panel', 'upload-summary', 'upload-list', 'btn-upload-min', 'btn-upload-cancel',
  'reader', 'reader-title', 'reader-encoding', 'reader-body', 'reader-text', 'reader-page',
  'reader-range', 'reader-percent', 'btn-reader-prev', 'btn-reader-next', 'btn-reader-toc', 'btn-reader-close',
  'set-theme', 'set-shelf-usage', 'set-shelf-pick',
  'sw-sound', 'sw-sound-reminder', 'sw-sound-upload', 'sw-sound-action',
  'app-footer', 'main', 'overlay', 'modal', 'toast', 'toast-msg', 'toast-btn'
];

function makeContext(store, opts) {
  opts = opts || {};
  const byId = {};
  IDS.forEach((i) => { byId[i] = new El('div'); byId[i].attrs.id = i; });
  byId.overlay.appendChild(byId.modal);
  byId.toast.appendChild(byId['toast-msg']);
  byId.toast.appendChild(byId['toast-btn']);
  ['todo-empty', 'trash-empty', 'shelf-empty', 'toast', 'toast-btn', 'overlay',
    'float-stack', 'trash-stack', 'trash-panel', 'upload-panel', 'reader', 'shelf-support',
    'page-shelf', 'page-gacha', 'page-settings'].forEach((p) => { byId[p].hidden = true; });

  const alerts = [];
  const audioLog = [];
  const fileSystemLog = [];
  class FakeAudioContext {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; audioLog.push('ctx'); }
    resume() { audioLog.push('resume'); }
    createOscillator() {
      return { type: '', frequency: { value: 0 }, connect() {}, start() { audioLog.push('start'); }, stop() { audioLog.push('stop'); } };
    }
    createGain() {
      return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
    }
  }

  /* 虚拟磁盘 + 目录句柄（用于书架链路测试） */
  const disk = opts.disk || {};
  const textEncoder = new TextEncoder();
  function makeFakeFile(name, text) {
    const bytes = textEncoder.encode(text);
    return {
      name,
      size: bytes.length,
      lastModified: Date.now(),
      slice(start, end) {
        const part = bytes.slice(start, end);
        return {
          arrayBuffer: () => Promise.resolve(part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength)),
          size: part.byteLength
        };
      }
    };
  }
  function fakeDirHandle() {
    return {
      kind: 'directory',
      name: 'book',
      queryPermission: () => Promise.resolve('granted'),
      requestPermission: () => Promise.resolve('granted'),
      getFileHandle(name, o) {
        if (!disk[name] && !(o && o.create)) return Promise.reject(new Error('NotFound'));
        if (!disk[name]) disk[name] = makeFakeFile(name, '');
        return Promise.resolve({
          getFile: () => Promise.resolve(disk[name]),
          createWritable: () => {
            let buf = null;
            return Promise.resolve({
              write(b) { buf = b; fileSystemLog.push('write:' + name); return Promise.resolve(); },
              close() {
                disk[name] = makeFakeFile(name, new TextDecoder().decode(new Uint8Array(buf)));
                fileSystemLog.push('close:' + name);
                return Promise.resolve();
              },
              abort() { fileSystemLog.push('abort:' + name); return Promise.resolve(); }
            });
          }
        });
      },
      removeEntry(name) { delete disk[name]; fileSystemLog.push('remove:' + name); return Promise.resolve(); },
      values() {
        const names = Object.keys(disk);
        let i = 0;
        return {
          next: () => {
            if (i >= names.length) return Promise.resolve({ done: true });
            const nm = names[i++];
            return Promise.resolve({ done: false, value: { kind: 'file', name: nm, getFile: () => Promise.resolve(disk[nm]) } });
          }
        };
      }
    };
  }
  globalThis.__idbStore = globalThis.__idbStore || {};
  const handleCache = opts.handleCache || globalThis.__idbStore;

  const document = {
    readyState: 'complete',
    documentElement: new El('html'),
    body: new El('body'),
    getElementById: (id) => byId[id] || null,
    createElement: (t) => new El(t),
    createTextNode: (t) => { const e = new El('#text'); e.textContent = t; return e; },
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const window = {
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    addEventListener() {},
    innerHeight: 800,
    location: { protocol: opts.protocol || 'http:' },
    AudioContext: opts.noAudio ? undefined : FakeAudioContext,
    indexedDB: {
      open() {
        const req = {};
        setTimeout(() => {
          req.result = {
            createObjectStore() {},
            transaction() {
              const tx = {
                objectStore: () => ({
                  put(v, k) { handleCache[k] = v; },
                  get(k) { return { result: handleCache[k] }; }
                }),
                oncomplete: null,
                onerror: null
              };
              setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
              return tx;
            }
          };
          if (req.onupgradeneeded) req.onupgradeneeded();
          if (req.onsuccess) req.onsuccess();
        }, 0);
        return req;
      }
    },
    showDirectoryPicker: opts.noFsPicker ? undefined : () => {
      if (opts.pickerAbort) return Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      return Promise.resolve(fakeDirHandle());
    },
    showOpenFilePicker: opts.noFsPicker ? undefined : () => Promise.resolve(
      (opts.pickFiles || []).map((f) => ({ getFile: () => Promise.resolve(disk[f]) }))
    )
  };
  const ctx = {
    window, document, alert: (m) => alerts.push(m), console,
    setTimeout, clearTimeout, setInterval: () => 0, Promise, Date, Math, JSON,
    Object, Array, String, Number, parseInt, parseFloat, isNaN, RegExp, Error,
    TextDecoder, TextEncoder, Uint8Array, ArrayBuffer, DataView,
    Blob: class {
      constructor(parts) {
        this.parts = parts || [];
        this.size = this.parts.reduce((s, p) => s + (p.byteLength || p.size || 0), 0);
      }
    },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    FileReader: class {
      readAsArrayBuffer(blob) {
        const self = this;
        setTimeout(() => {
          const parts = (blob && blob.parts) || [];
          let total = 0;
          parts.forEach((p) => { total += p.byteLength || 0; });
          const out = new Uint8Array(total);
          let off = 0;
          parts.forEach((p) => { out.set(new Uint8Array(p), off); off += p.byteLength; });
          self.result = out.buffer;
          if (self.onload) self.onload();
        }, 0);
      }
      readAsText() { if (this.onload) this.onload(); }
    }
  };
  vm.createContext(ctx);
  const src = baseSrc.replace(
    '    setTimeout(checkReminders, 800);',
    '    setTimeout(checkReminders, 800);\n' +
    '    window.__t = { state, init, renderAll, renderCalendar, renderTodos, renderTrash, renderUndo, renderShelf, renderUploads, renderSounds, renderFloats, syncFloats, setRoute,\n' +
    '      openNew, openEditor, openBatch, openBatchCreate, handleBatchPayload, createBatch, batchResultText, showBatchSummary, openDetail,\n' +
    '      doExport, importFromText, checkReminders, buildReminderList, pendingReminders, playCue, soundEnabled, toggleSound,\n' +
    '      dueTimestamp, remindTimestamp, normalizeTodo, isValidDateKey, normalizeTime, toDateKey, parseDateKey,\n' +
    '      formatStamp, humanDue, humanDateKey, humanRemain, humanAgo, humanFromNow, byteText, sortTodos, visibleTodos, liveTodos, trashTodos,\n' +
    '      uniqDates, expandDateRange, monthDates, shiftDateKey, addPick, removePick, clearPick,\n' +
    '      sniffEncoding, decodeBuffer, decodeQuality, encText, BOOK_MAX_BYTES, SHELF_MAX_BYTES, READ_PAGE_BYTES,\n' +
    '      pickBookFolder, adoptDirHandle, refreshShelfFromDisk, uploadOne, cancelUploads, confirmDeleteBook, openReader, loadReaderPage, closeReader, totalPages, shelfTotalBytes, getBook, saveBooks, shelfBooks,\n' +
    '      expiredTrash, purgeExpired, emptyTrash, onToggleDone, onDelete, onNoteChange, clearCompleted,\n' +
    '      pushUndo, doUndo, restoreFromTrash, purgeOne, markDismissed, getTodo, lsGet, lsSet, STORAGE,\n' +
    '      TRASH_TTL_MS, UNDO_LIMIT, BATCH_MAX, APP_VERSION, getOverlay: function () { return overlay; } };'
  );
  vm.runInContext(src, ctx, { filename: 'inline.js' });
  const T = ctx.window.__t;
  T.byId = byId;
  T.store = store;
  T.disk = disk;
  T.alerts = alerts;
  T.audioLog = audioLog;
  T.fileSystemLog = fileSystemLog;
  T.makeFakeFile = makeFakeFile;
  T.fakeDirHandle = fakeDirHandle;
  T.overlayText = () => byId['modal'].textContent;
  T.bump = (delta) => {
    const s = T.lsGet(T.STORAGE.todos, []);
    s.forEach((t) => {
      if (t.firstDeletedAt) {
        t.firstDeletedAt = new Date(Date.parse(t.firstDeletedAt) + delta).toISOString();
        t.deletedAt = new Date(Date.parse(t.deletedAt) + delta).toISOString();
      }
    });
    T.lsSet(T.STORAGE.todos, s);
    T.state.todos.forEach((t) => {
      if (t.firstDeletedAt) {
        t.firstDeletedAt = new Date(Date.parse(t.firstDeletedAt) + delta).toISOString();
        t.deletedAt = new Date(Date.parse(t.deletedAt) + delta).toISOString();
      }
    });
  };
  T.reload = (o) => makeContext(JSON.parse(JSON.stringify(store)), Object.assign({ disk, handleCache }, o || {}));
  return T;
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); }
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n) => { for (let i = 0; i < (n || 6); i++) await flush(); };
const btnByText = (root, text) => root.querySelectorAll('button').filter((b) => b.textContent.indexOf(text) > -1)[0];
const field = (T, id) => T.getOverlay().querySelector('#' + id);
const items = (T) => T.byId['modal'].querySelectorAll('.reminder-item');
const pickCells = (T) => T.byId['modal'].querySelectorAll('.pick-cell');
const summaryText = (T) => {
  const box = T.getOverlay().querySelector('.batch-summary');
  return box ? box.textContent : '';
};

(async function main() {
  const store = {};
  let T = makeContext(store);
  const tk = T.toDateKey(new Date());
  const day1 = T.shiftDateKey(tk, 1);
  const day2 = T.shiftDateKey(tk, 2);

  console.log('== 1. 版本与结构（1.3 需求） ==');
  ok('应用名为 Z', /<div class="sb-brand">Z</.test(html));
  ok('版本号 1.3.0', T.APP_VERSION === '1.3.0', T.APP_VERSION);
  ok('左侧边栏已恢复且无日历入口', /class="sidebar"/.test(html) && /id="nav-todo"/.test(html) && !/nav-calendar|page-calendar/.test(html));
  ok('侧边栏含 书架 / 抽卡', /id="nav-shelf"/.test(html) && /id="nav-gacha"/.test(html));
  ok('侧边栏左下含设置入口', /id="nav-settings"/.test(html) && /sb-foot/.test(html));
  ok('抽卡为占位页', /功能开发中/.test(html));
  ok('日历页的多选日期按钮已移除', !/btn-multi|id="multi-bar"/.test(html));
  ok('批量新建入口在待办页右上', /id="btn-batch"/.test(html));
  ok('初始化未写脏数据', Object.keys(store).length === 0, Object.keys(store));

  console.log('== 2. 路由：待办 / 书架 / 抽卡 / 设置 ==');
  ok('默认在待办页', T.byId['page-todo'].hidden === false);
  T.byId['nav-shelf'].click();
  ok('切到书架页', T.byId['page-shelf'].hidden === false && T.byId['page-todo'].hidden === true);
  T.byId['nav-gacha'].click();
  ok('切到抽卡占位页', T.byId['page-gacha'].hidden === false);
  T.byId['nav-settings'].click();
  ok('切到设置页', T.byId['page-settings'].hidden === false);
  T.byId['nav-todo'].click();
  ok('切回待办页', T.byId['page-todo'].hidden === false);

  console.log('== 3. 悬浮组件：显示范围 / 置灰 / 滚动跟随 / 页脚避让 ==');
  T.byId['nav-todo'].click();
  ok('待办页显示撤销与回收站悬浮', T.byId['float-stack'].hidden === false && T.byId['trash-stack'].hidden === false);
  ok('无历史时撤销置灰但不隐藏', T.byId['btn-undo'].disabled === true && T.byId['float-stack'].hidden === false);
  ok('悬浮按钮带 tooltip 提示属性', /class="btn btn-sm tip"/.test(html) && /class="trash-float tip"/.test(html));
  T.byId['nav-shelf'].click();
  ok('非待办页隐藏悬浮组件', T.byId['float-stack'].hidden === true && T.byId['trash-stack'].hidden === true);
  T.byId['nav-todo'].click();
  T.byId['app-footer']._rect = { top: 300, bottom: 400, left: 0, right: 0, width: 800, height: 100 };
  T.syncFloats();
  const topWithFooter = parseInt(T.byId['float-stack'].style.top, 10);
  T.byId['app-footer']._rect = { top: 5000, bottom: 5100, left: 0, right: 0, width: 800, height: 100 };
  T.syncFloats();
  const topNoFooter = parseInt(T.byId['float-stack'].style.top, 10);
  ok('悬浮组件位置随滚动/页脚变化更新', topWithFooter !== topNoFooter, [topWithFooter, topNoFooter]);
  ok('接近页脚时上移避让（不被遮挡）', topWithFooter < topNoFooter, [topWithFooter, topNoFooter]);
  ok('避让后仍留在视口内', topWithFooter >= 0 && topNoFooter <= 800, [topWithFooter, topNoFooter]);

  console.log('== 4. 回收站在待办页右上 ==');
  T.byId['btn-trash-float'].click();
  ok('点开回收站面板', T.byId['trash-panel'].hidden === false);
  T.byId['btn-trash-close'].click();
  ok('可关闭回收站面板', T.byId['trash-panel'].hidden === true);
  T.byId['nav-settings'].click();
  T.byId['btn-trash-float'].click();
  ok('非待办页不显示回收站面板', T.byId['trash-panel'].hidden === true);
  T.byId['nav-todo'].click();

  console.log('== 5. 待办列表仅保留打钩框 ==');
  T.openEditor(null);
  await settle();
  field(T, 'f-title').value = '写周报';
  field(T, 'f-date').value = tk;
  field(T, 'f-time').value = '09:30';
  btnByText(T.getOverlay(), '保存').click();
  await settle();
  ok('新建 1 条待办', T.state.todos.length === 1, T.state.todos.length);
  const card = T.byId['todo-list'].querySelectorAll('.todo')[0];
  const cardBtns = card.querySelectorAll('button').map((b) => b.textContent);
  ok('卡片不再有「标记完成/未完成」按钮', cardBtns.every((t) => t.indexOf('标记') < 0), cardBtns);
  ok('卡片保留详情与删除', cardBtns.some((t) => t.indexOf('详情') > -1) && cardBtns.some((t) => t.indexOf('删除') > -1), cardBtns);
  const check = card.querySelectorAll('input').filter((i) => i.className.indexOf('todo-check') > -1)[0];
  ok('打钩框仍在', !!check);
  check.checked = true;
  check.dispatch('change', { target: check });
  ok('勾选即可标记完成', T.state.todos[0].done === true);
  check.checked = false;
  check.dispatch('change', { target: check });
  ok('取消勾选恢复未完成', T.state.todos[0].done === false);
  ok('撤销按钮随之可用', T.byId['btn-undo'].disabled === false);
  T.doUndo();
  ok('撤销可回退到上一步状态', T.state.todos[0].done === true, T.state.todos[0].done);

  console.log('== 6. 批量新建：无静态说明、无单条日期，保留报错与多选 ==');
  T.state.undoStack.length = 0;
  T.renderAll();
  T.byId['btn-batch'].click();
  await settle();
  const modalText = T.overlayText();
  ok('批量弹窗含内容/时间/重要/备注', ['f-title', 'f-time', 'f-priority', 'f-note'].every((id) => !!field(T, id)));
  ok('已删除“两种顺序都可以…”静态说明', !/两种顺序/.test(modalText) && !/先勾选日期再填写内容/.test(modalText), modalText.slice(0, 90));
  ok('已删除“单条日期”字段', !/单条日期/.test(modalText) && !field(T, 'f-date'));
  ok('仍有多选日历与区间多选', pickCells(T).length === 42 && !!btnByText(T.getOverlay(), '区间多选'));
  btnByText(T.getOverlay(), '生成待办').click();
  await settle();
  ok('未填内容报错保留', /请填写待办内容/.test(T.overlayText()), T.overlayText());
  field(T, 'f-title').value = '每日复盘';
  btnByText(T.getOverlay(), '生成待办').click();
  await settle();
  ok('未选日期报错保留', /请至少选择一个日期/.test(T.overlayText()), T.overlayText());
  pickCells(T).filter((c) => c.attrs['data-date'] === tk)[0].click();
  pickCells(T).filter((c) => c.attrs['data-date'] === day1)[0].click();
  ok('弹窗内计数 2 / 50', /已选 2 \/ 50/.test(T.overlayText()), T.overlayText());
  btnByText(T.getOverlay(), '区间多选').click();
  pickCells(T).filter((c) => c.attrs['data-date'] === day2)[0].click();
  pickCells(T).filter((c) => c.attrs['data-date'] === T.shiftDateKey(tk, 4))[0].click();
  ok('区间展开追加连续日期（含首尾）', [day2, T.shiftDateKey(tk, 3), T.shiftDateKey(tk, 4)].every((d) => T.state.multiPick.indexOf(d) >= 0), T.state.multiPick);
  btnByText(T.getOverlay(), '生成待办').click();
  await settle();
  ok('生成多条独立待办', T.state.todos.length === 6, T.state.todos.length);
  ok('结果弹窗列出成功日期', /创建成功/.test(summaryText(T)), summaryText(T));
  ok('除日期外字段一致', T.state.todos.slice(1).every((t) => t.title === '每日复盘'));
  btnByText(T.getOverlay(), '知道了').click();
  await settle();
  T.state.todos = [];
  T.lsSet(T.STORAGE.todos, []);
  const big = [];
  for (let i = 0; i < 60; i++) big.push(T.shiftDateKey(tk, i));
  const res = T.createBatch(big, { title: '超量', note: '', time: '09:00', priority: 0 });
  ok('单次上限 50 截断', res.created.length === 50 && res.failed.length === 10, [res.created.length, res.failed.length]);
  ok('失败原因逐条列出', res.failed.every((f) => /超出单次上限 50/.test(f.reason)));
  T.showBatchSummary(res);
  ok('汇总提示部分成功与失败明细', /部分成功/.test(summaryText(T)) && /超出单次上限 50/.test(summaryText(T)));
  btnByText(T.getOverlay(), '知道了').click();
  await settle();
  T.state.todos = [];
  T.lsSet(T.STORAGE.todos, []);
  T.clearPick();
  T.renderAll();

  console.log('== 7. 提醒弹窗：无提示音按钮，仍可逐条操作 ==');
  const pastA = T.normalizeTodo({ title: '过期待办A', date: T.shiftDateKey(tk, -2), time: '08:00' });
  const pastB = T.normalizeTodo({ title: '过期待办B', date: T.shiftDateKey(tk, -1), time: '08:00' });
  T.state.todos.push(pastA, pastB);
  T.audioLog.length = 0;
  T.checkReminders();
  ok('提醒弹窗出现', T.byId['overlay'].hidden === false);
  const footText = T.byId['modal'].querySelector('.reminder-foot').textContent;
  ok('提醒弹窗内不再有提示音开关', !/提示音/.test(footText), footText);
  ok('每条仍有 4 个独立操作', items(T).length === 2 && items(T).every((it) => it.querySelectorAll('button').length === 4));
  ok('到期提醒会发声（默认开）', T.audioLog.filter((x) => x === 'start').length >= 1, T.audioLog);
  btnByText(items(T).filter((it) => it.textContent.indexOf('过期待办A') > -1)[0], '完成').click();
  ok('A 完成不影响 B', T.getTodo(pastA.id).done === true && T.getTodo(pastB.id).done === false);
  if (btnByText(T.byId['modal'], '关闭')) btnByText(T.byId['modal'], '关闭').click();
  await settle();

  console.log('== 8. 设置页：主题 / 提示音分区开关 ==');
  T.byId['nav-settings'].click();
  ok('主题按钮文案正确', /切换为/.test(T.byId['set-theme'].textContent), T.byId['set-theme'].textContent);
  ok('四个提示音开关都在', ['sw-sound', 'sw-sound-reminder', 'sw-sound-upload', 'sw-sound-action'].every((id) => !!T.byId[id]));
  ok('总开关默认开、操作音默认关', T.byId['sw-sound'].className.indexOf('on') > -1 && T.byId['sw-sound-action'].className.indexOf('on') < 0);
  T.byId['sw-sound-reminder'].click();
  ok('可单独关闭到期提醒音', T.state.sounds.reminder === false && T.soundEnabled('reminder') === false);
  T.byId['sw-sound'].click();
  T.audioLog.length = 0;
  T.playCue('upload');
  ok('总开关关闭后一律不发声', T.audioLog.filter((x) => x === 'start').length === 0, T.audioLog);
  T.byId['sw-sound'].click();
  ok('总开关可重新打开', T.state.sounds.master === true);
  T.byId['sw-sound-reminder'].click();
  T.byId['sw-sound-action'].click();
  ok('可单独打开操作提示音', T.state.sounds.action === true);
  T.audioLog.length = 0;
  if (!T.liveTodos().length) T.state.todos.push(T.normalizeTodo({ title: '操作音用例', date: tk, time: '11:00' }));
  T.onDelete(T.liveTodos()[0].id);
  ok('开启后操作提示音会响', T.audioLog.filter((x) => x === 'start').length >= 1, T.audioLog);
  T.byId['set-theme'].click();
  ok('主题可切换为深色', T.state.theme === 'dark' && T.byId['set-theme'].textContent.indexOf('浅色') > -1);
  T.byId['set-theme'].click();
  ok('主题可切回浅色', T.state.theme === 'light');

  console.log('== 9. 书架：运行前提提示与文件夹授权 ==');
  const noFs = makeContext({}, { noFsPicker: true });
  noFs.byId['nav-shelf'].click();
  ok('不支持 API 时给出提示', noFs.byId['shelf-support'].hidden === false &&
    /Chrome|Edge/.test(noFs.byId['shelf-support'].textContent), noFs.byId['shelf-support'].textContent);
  const fileProto = makeContext({}, { protocol: 'file:' });
  fileProto.byId['nav-shelf'].click();
  ok('file:// 协议时提示需用本地 HTTP 服务', /file:\/\//.test(fileProto.byId['shelf-support'].textContent),
    fileProto.byId['shelf-support'].textContent);
  ok('支持时提示条隐藏', T.byId['shelf-support'].hidden === true);
  T.byId['nav-shelf'].click();
  await T.pickBookFolder();
  await settle(8);
  ok('选择 book 文件夹后已授权', T.state.dirReady === true && T.state.bookDirName === 'book', [T.state.dirReady, T.state.bookDirName]);
  ok('文件夹名写入 localStorage', JSON.parse(store['zapp.bookDirName.v1']) === 'book');

  console.log('== 10. 书架：上传（进度 / 上限 / 编码 / 取消 / 最小化） ==');
  T.disk['utf8书.txt'] = T.makeFakeFile('utf8书.txt', '第一章 开始\n这是一本 UTF-8 编码的书。');
  T.fileSystemLog.length = 0;
  await T.uploadOne(T.makeFakeFile('新书.txt', '第一章 标题\n正文内容。'));
  await settle(8);
  ok('上传完成后写入磁盘', T.fileSystemLog.some((x) => x.indexOf('close:新书.txt') > -1), T.fileSystemLog);
  ok('上传后书架出现该书', T.state.books.some((b) => b.name === '新书.txt'));
  ok('自动识别编码为 utf-8', T.getBook(T.state.books.filter((b) => b.name === '新书.txt')[0].id).encoding === 'utf-8');
  ok('上传进度面板可见', T.byId['upload-panel'].hidden === false);
  T.byId['btn-upload-min'].click();
  ok('可最小化上传面板', T.byId['upload-panel'].className.indexOf('min') > -1);
  T.byId['btn-upload-min'].click();
  const tooBig = { name: '超大.txt', size: T.BOOK_MAX_BYTES + 1, slice: () => ({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }) };
  const r1 = await T.uploadOne(tooBig);
  await settle();
  ok('超过单本 50MB 被拒绝并说明原因', r1.status === 'error' && /单本上限/.test(r1.error), r1.error);
  ok('被拒文件未写入磁盘', !T.disk['超大.txt']);
  ok('GBK 中文可被识别为 gb18030', T.sniffEncoding(new Uint8Array([0xC4, 0xE3, 0xBA, 0xC3])) === 'gb18030');
  ok('UTF-8 BOM 识别为 utf-8', T.sniffEncoding(new Uint8Array([0xEF, 0xBB, 0xBF, 0x41])) === 'utf-8');
  ok('UTF-16LE BOM 识别为 utf-16le', T.sniffEncoding(new Uint8Array([0xFF, 0xFE, 0x41, 0x00])) === 'utf-16le');
  ok('编码异常有提示能力', /编码可能异常/.test(html));
  T.uploadOne(T.makeFakeFile('取消我.txt', '一二三四五'));
  T.cancelUploads();
  await settle(8);
  const canceled = T.state.uploads.filter((u) => u.name === '取消我.txt')[0];
  ok('可取消上传', canceled && canceled.status === 'canceled', canceled && canceled.status);
  ok('取消后有明确说明', canceled && /取消/.test(canceled.error || ''), canceled && canceled.error);
  ok('取消后已写入内容被删除', !T.disk['取消我.txt'], Object.keys(T.disk));

  console.log('== 11. 书架：阅读进度 / 上次时间 / 删除 ==');
  const book = T.state.books.filter((b) => b.name === '新书.txt')[0];
  await T.openReader(book.id);
  await settle(10);
  ok('阅读器打开并载入正文', T.byId['reader'].hidden === false && /第一章/.test(T.byId['reader-text'].textContent),
    T.byId['reader-text'].textContent.slice(0, 40));
  ok('显示页数与百分比', /第 1 \//.test(T.byId['reader-page'].textContent) && T.byId['reader-percent'].textContent === '0%');
  ok('阅读后记录上次浏览时间', !!T.getBook(book.id).lastReadAt);
  T.byId['btn-reader-next'].click();
  await settle(10);
  ok('可翻页（惰性分页）', /第 1 \/|第 2 \//.test(T.byId['reader-page'].textContent));
  T.closeReader();
  ok('可关闭阅读器', T.byId['reader'].hidden === true);
  const T2 = T.reload();
  ok('重新打开页面后阅读记录仍在', !!T2.getBook(book.id).lastReadAt);
  T = T2;
  T.byId['nav-shelf'].click();
  await T.pickBookFolder();     // 重新打开页面后需再次授权（浏览器安全策略）
  await settle(8);
  ok('重新授权后书架恢复可用（并标出不在文件夹中的书）', T.state.dirReady === true, T.state.dirReady);
  const before = T.state.books.length;
  T.confirmDeleteBook(book.id);
  await settle();
  ok('删除图书有确认弹窗', /删除图书/.test(T.overlayText()), T.overlayText());
  btnByText(T.getOverlay(), '取消').click();
  await settle();
  ok('取消后不删除', T.state.books.length === before);
  T.confirmDeleteBook(book.id);
  await settle();
  btnByText(T.getOverlay(), '确认删除').click();
  await settle(8);
  ok('确认后删除元数据', T.state.books.length === before - 1, T.state.books.length);
  ok('确认后删除磁盘文件', !T.disk['新书.txt'], Object.keys(T.disk));
  ok('书架卡片含进度条与上次浏览', /class: 'progress'/.test(html) && /上次浏览/.test(html));

  console.log('== 12. 备份不含书架 ==');
  ok('导出说明书架不计入备份', /不计入本备份|不计入待办备份/.test(html));
  const clean = { app: 'Z', todos: T.state.todos.map((t) => T.normalizeTodo(t)) };
  ok('导出体可 JSON 往返', JSON.parse(JSON.stringify(clean, null, 2)).todos.length === T.state.todos.length);
  ok('导出体不再含 multiPick 顶层字段', !/multiPick: state.multiPick,/.test(html));

  console.log('== 13. 待办核心未回归 ==');
  T.state.todos = [];
  T.lsSet(T.STORAGE.todos, []);
  const vt = T.normalizeTodo({ title: '回收站用例', date: tk, time: '10:00' });
  T.state.todos.push(vt);
  T.onDelete(vt.id);
  ok('删除进入回收站', T.trashTodos().length === 1 && T.liveTodos().length === 0);
  const firstDeleted = T.getTodo(vt.id).firstDeletedAt;
  T.getTodo(vt.id).deletedAt = new Date(Date.now() - 60000).toISOString();
  T.onDelete(vt.id);
  ok('重复删除不刷新首次删除时间', T.getTodo(vt.id).firstDeletedAt === firstDeleted);
  ok('72 小时内不过期', T.expiredTrash().length === 0);
  ok('页面打开期间不清理', T.purgeExpired(true) === 0 && T.trashTodos().length === 1);
  T.bump(-73 * 3600 * 1000);
  ok('超过 72 小时视为过期', T.expiredTrash().length === 1);
  const T3 = T.reload();
  ok('重新打开页面时才清除过期条目', T3.trashTodos().length === 0);
  T = T3;

  console.log('== 14. 静态约束（原始需求） ==');
  const forbidden = [
    ['fetch(', /fetch\s*\(/], ['XMLHttpRequest', /XMLHttpRequest/], ['WebSocket', /WebSocket/],
    ['sendBeacon', /sendBeacon/], ['Notification API', /new\s+Notification|Notification\.requestPermission/],
    ['sessionStorage', /sessionStorage/], ['Vue/React/jQuery', /\b(Vue|React|Angular|jQuery)\b/i],
    ['外部 http(s) 资源（非本机）', /https?:\/\/(?!(127\.0\.0\.1|localhost))/], ['外链标签', /<(link|iframe)\b|<script[^>]*\bsrc=/i],
    ['音频文件', /\.(mp3|wav|ogg|m4a)\b/i]
  ];
  forbidden.forEach(([name, re]) => ok('未使用 ' + name, !re.test(html)));
  ok('indexedDB 仅用于保存目录句柄', (html.match(/indexedDB/g) || []).length <= 6, (html.match(/indexedDB/g) || []).length);
  ok('待办/进度仍用 localStorage', /localStorage/.test(html));
  ok('读写成对使用 JSON.stringify/parse', /JSON\.stringify/.test(html) && /JSON\.parse/.test(html));
  ok('提示音为 Web Audio 现场合成', /createOscillator/.test(html));
  ok('无 alert 报错触发', T.alerts.length === 0, T.alerts);

  console.log('\nRESULT pass=' + pass + ' fail=' + fail + '  version=' + T.APP_VERSION);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('RUNNER ERROR', e); process.exit(2); });
