/* global BOOK_CONTENT, St */

class HebrewBook {
  constructor() {
    this.content = window.bookContent || BOOK_CONTENT;
    this.pageFlip = null;
    this.pageList = [];
    this.chapterPageMap = {};
    this.currentPage = 0;
    this.editorOpen = false;
    this._onFlip = this._onFlip.bind(this);
    this._onResize = this._onResize.bind(this);
  }

  init() {
    this._buildPageList();
    this._renderAllPages();
    this._initPageFlip();
    this._initDots();
    this._initEditor();
    this._initNavZones();
    window.addEventListener('resize', this._debounce(this._onResize, 250));
    this._hideLoader();
  }

  /* ── page list ── */

  _buildPageList() {
    this.pageList = [];
    let n = 1;

    this.pageList.push({ type: 'cover-front', data: this.content });

    if (this.content.dedication) {
      this.pageList.push({ type: 'dedication', data: this.content });
    }

    if (this.content.preface) {
      this.pageList.push({ type: 'preface-header', data: this.content.preface });
      this.content.preface.pages.forEach(pg => {
        this.pageList.push({ type: 'text', data: pg, pageNum: n++ });
      });
    }

    this.pageList.push({ type: 'toc', data: this.content });

    this.content.chapters.forEach((ch) => {
      this.chapterPageMap[ch.id] = this.pageList.length;
      ch.pages.forEach((pg) => {
        const entry = { type: pg.type === 'chapter-header' ? 'chapter-header' : 'text', data: pg };
        if (pg.type !== 'chapter-header') entry.pageNum = n++;
        this.pageList.push(entry);
      });
    });

    if (this.content.blessing) {
      this.pageList.push({ type: 'blessing', data: this.content.blessing });
    }

    this.pageList.push({ type: 'cover-back', data: this.content });
  }

  /* ── DOM rendering ── */

  _renderAllPages() {
    const container = document.getElementById('flip-book');
    container.innerHTML = '';
    this.pageList.forEach((entry, idx) => container.appendChild(this._buildPageEl(entry, idx)));
    this._updateDots();
  }

  _buildPageEl(entry, idx) {
    const div = document.createElement('div');
    div.className = 'page';
    div.dataset.pageIndex = idx;
    switch (entry.type) {
      case 'cover-front':    div.classList.add('page-cover', 'page-cover-front');       div.innerHTML = this._tmplCoverFront(entry.data);   break;
      case 'cover-back':     div.classList.add('page-back-cover');                       div.innerHTML = this._tmplCoverBack();               break;
      case 'dedication':     div.classList.add('page-inner', 'dedication-page');         div.innerHTML = this._tmplDedication(entry.data);    break;
      case 'preface-header': div.classList.add('page-inner', 'chapter-header-page');    div.innerHTML = this._tmplPrefaceHeader(entry.data); break;
      case 'toc':            div.classList.add('page-inner', 'toc-page');               div.innerHTML = this._tmplTOC(entry.data);           break;
      case 'chapter-header': div.classList.add('page-inner', 'chapter-header-page');    div.innerHTML = this._tmplChapterHeader(entry.data); break;
      case 'text':           div.classList.add('page-inner');                            div.innerHTML = this._tmplTextPage(entry.data, entry.pageNum); break;
      case 'blessing':       div.classList.add('page-inner', 'blessing-page');          div.innerHTML = this._tmplBlessing(entry.data);     break;
    }
    return div;
  }

  /* ── templates ── */

  _tmplCoverFront(d) {
    return `
      <div class="cover-church">${this._esc(d.church || '')}</div>
      <div class="cover-cross">✠</div>
      <div class="cover-title">${this._esc(d.title)}</div>
      <div class="cover-rule"></div>
      <div class="cover-subtitle">${this._esc(d.subtitle)}</div>
      <div class="cover-rule"></div>
      <div class="cover-year">${this._esc(d.year || '')}</div>
    `;
  }

  _tmplCoverBack() {
    return `<div class="back-cover-seal"><span>✠</span></div>`;
  }

  _tmplDedication(d) {
    const lines = d.dedication.map(l => `<div class="dedication-line">${this._esc(l)}</div>`).join('');
    return `<div class="page-content dedication-content">
      <div class="dedication-symbol"> · ✠ · </div>
      ${lines}
    </div>`;
  }

  _tmplPrefaceHeader(preface) {
    return `<div class="page-content">
      <div class="chapter-top-rule"></div>
      <div class="chapter-number">הקדמה</div>
      <div class="chapter-title">${this._esc(preface.title)}</div>
      <div class="chapter-bottom-rule"></div>
    </div>`;
  }

  _tmplTOC(data) {
    const items = data.chapters.map((ch, i) => `
      <div class="toc-item" data-chapter="${ch.id}">
        <span class="toc-chapter-num">${ch.pages[0].chapterNumber || ''}</span>
        <span class="toc-chapter-title">${this._esc(ch.title)}</span>
      </div>
    `).join('');
    return `<div class="page-content">
      <div class="toc-title">תוכן עניינים</div>
      ${items}
      <div class="page-number">—</div>
    </div>`;
  }

  _tmplChapterHeader(pg) {
    return `<div class="page-content">
      <div class="chapter-top-rule"></div>
      <div class="chapter-number">פרק ${this._esc(pg.chapterNumber)}</div>
      <div class="chapter-title">${this._esc(pg.title)}</div>
      ${pg.subtitle ? `<div class="chapter-subtitle">${this._esc(pg.subtitle)}</div>` : ''}
      <div class="chapter-bottom-rule"></div>
    </div>`;
  }

  _tmplTextPage(pg, pageNum) {
    const blocks = (pg.content || []).map(b => this._tmplBlock(b)).join('');
    return `<div class="page-content body-text">${blocks}${pageNum ? `<div class="page-number">${pageNum}</div>` : ''}</div>`;
  }

  _tmplBlessing(b) {
    const blocks = (b.content || []).map(bl => this._tmplBlock(bl)).join('');
    return `<div class="page-content body-text blessing-content">
      <div class="chapter-top-rule"></div>
      <div class="blessing-title">${this._esc(b.title)}</div>
      <div class="blessing-cross">✠</div>
      <div class="chapter-bottom-rule" style="margin-bottom:20px"></div>
      ${blocks}
      <div class="blessing-footer">${this._esc(b.footer || '')}</div>
    </div>`;
  }

  _tmplBlock(b) {
    switch (b.type) {
      case 'verse':
        return `<div class="verse-block"><span class="verse-number">${b.number}</span><span class="verse-text">${this._esc(b.text)}</span></div>`;
      case 'callout':
        return `<div class="callout-block">${this._esc(b.text)}</div>`;
      case 'italic':
        return `<p class="italic-block">${this._esc(b.text)}</p>`;
      case 'paragraph':
        return `<p class="body-paragraph">${this._esc(b.text)}</p>`;
      case 'listitem':
        return `<div class="list-item-block"><span class="list-label">${this._esc(b.label)}</span><span class="list-dash"> — </span><span class="list-value">${this._esc(b.text)}</span></div>`;
      default:
        return '';
    }
  }

  /* ── StPageFlip ── */

  _getDimensions() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const isMobile = vw < 768, isLandscape = vw > vh;
    const spineW = isMobile ? 18 : 28;
    let pageW, pageH;
    if (isMobile) {
      if (isLandscape) { pageH = vh - 80; pageW = Math.min((vw - spineW) / 2 - 4, pageH * 0.72); }
      else             { pageW = vw - spineW - 16; pageH = Math.min(vh - 100, pageW * 1.42); }
    } else {
      pageW = Math.min(440, (vw - spineW - 40) / 2);
      pageH = Math.max(Math.min(vh - 80, pageW * 1.45), 400);
    }
    return { pageW: Math.floor(pageW), pageH: Math.floor(pageH), isMobile, isLandscape };
  }

  _initPageFlip() {
    const { pageW, pageH, isMobile, isLandscape } = this._getDimensions();
    const container = document.getElementById('flip-book');
    container.style.width  = pageW + 'px';
    container.style.height = pageH + 'px';
    document.getElementById('spine').style.height = pageH + 'px';

    this.pageFlip = new St.PageFlip(container, {
      width: pageW, height: pageH, size: 'fixed',
      minWidth: 200, maxWidth: 600, minHeight: 300, maxHeight: 900,
      drawShadow: true, flippingTime: 600,
      usePortrait: isMobile && !isLandscape,
      showCover: true, mobileScrollSupport: false,
      swipeDistance: 20, clickEventForward: false,
      useMouseEvents: true, startPage: 0, maxShadowOpacity: 0.6,
    });

    this.pageFlip.loadFromHTML(document.querySelectorAll('#flip-book .page'));
    this.pageFlip.on('flip', this._onFlip);
    this.pageFlip.on('changeState', () => this._updateDots());
  }

  _destroyAndRebuild() {
    if (this.pageFlip) { try { this.pageFlip.destroy(); } catch (_) {} this.pageFlip = null; }
    this._buildPageList(); this._renderAllPages(); this._initPageFlip(); this._initDots();
  }

  /* ── events ── */

  _onFlip(e) {
    this.currentPage = e.data;
    this._updateDots();
    const bar = document.getElementById('progress-bar');
    if (bar) bar.style.width = ((e.data / (this.pageList.length - 1)) * 100) + '%';
  }

  _onResize() {
    const { pageW, pageH } = this._getDimensions();
    const c = document.getElementById('flip-book');
    c.style.width = pageW + 'px'; c.style.height = pageH + 'px';
    document.getElementById('spine').style.height = pageH + 'px';
    if (this.pageFlip) { try { this.pageFlip.updateState(); } catch (_) { this._destroyAndRebuild(); } }
  }

  /* ── navigation ──
     Hebrew RTL: the spine is on the RIGHT.
     "Forward" in the book = tapping the LEFT side (open side).
     StPageFlip flipNext moves to higher page indices (later pages),
     which visually peels from the left — correct for RTL.
  ── */
  _initNavZones() {
    const nL = document.getElementById('nav-left');
    const nR = document.getElementById('nav-right');

    // LEFT tap = next page (forward / deeper into book)
    nL.addEventListener('click', () => this.pageFlip && this.pageFlip.flipNext('bottom'));
    // RIGHT tap = prev page (back toward cover/spine)
    nR.addEventListener('click', () => this.pageFlip && this.pageFlip.flipPrev('bottom'));

    [nL, nR].forEach(z => z.addEventListener('touchstart', (e) => {
      const r = document.createElement('div'); r.className = 'tap-ripple';
      const rect = z.getBoundingClientRect(), t = e.touches[0];
      r.style.left = (t.clientX - rect.left) + 'px';
      r.style.top  = (t.clientY - rect.top)  + 'px';
      z.appendChild(r); setTimeout(() => r.remove(), 500);
    }, { passive: true }));

    // Arrow keys: ← = forward (next), → = back (prev) — RTL convention
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowDown')  this.pageFlip && this.pageFlip.flipNext();
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp')    this.pageFlip && this.pageFlip.flipPrev();
    });
  }

  /* ── dots ── */

  _initDots() {
    const wrap = document.getElementById('chapter-dots');
    wrap.innerHTML = '';

    const cDot = document.createElement('div');
    cDot.className = 'chapter-dot'; cDot.title = 'כריכה';
    cDot.addEventListener('click', () => this.pageFlip && this.pageFlip.flip(0));
    wrap.appendChild(cDot);

    this.content.chapters.forEach((ch) => {
      const dot = document.createElement('div');
      dot.className = 'chapter-dot'; dot.title = ch.title; dot.dataset.chapterId = ch.id;
      dot.addEventListener('click', () => {
        const idx = this.chapterPageMap[ch.id];
        if (idx != null && this.pageFlip) this.pageFlip.flip(idx);
      });
      wrap.appendChild(dot);
    });

    this._updateDots();
  }

  _updateDots() {
    const dots = document.querySelectorAll('.chapter-dot');
    dots.forEach(d => d.classList.remove('active'));
    const pg = this.pageFlip ? this.pageFlip.getCurrentPageIndex() : 0;
    let activeChapter = null;
    this.content.chapters.forEach((ch) => {
      const start = this.chapterPageMap[ch.id];
      const end = start + ch.pages.length;
      if (pg >= start && pg < end) activeChapter = ch.id;
    });
    if (pg === 0) { dots[0] && dots[0].classList.add('active'); }
    else if (activeChapter) {
      const idx = this.content.chapters.findIndex(c => c.id === activeChapter);
      dots[idx + 1] && dots[idx + 1].classList.add('active');
    }
  }

  /* ── editor ── */

  _initEditor() {
    document.getElementById('edit-btn').addEventListener('click', () => this._toggleEditor());
    document.getElementById('editor-close').addEventListener('click', () => this._toggleEditor(false));
    document.getElementById('editor-apply').addEventListener('click', () => {
      const errEl = document.getElementById('editor-error');
      errEl.textContent = '';
      try {
        const parsed = JSON.parse(document.getElementById('json-editor').value);
        window.bookContent = parsed; this.content = parsed;
        this._destroyAndRebuild(); this._toggleEditor(false);
      } catch (err) { errEl.textContent = 'שגיאת JSON: ' + err.message; }
    });
    document.getElementById('flip-book').addEventListener('click', (e) => {
      const item = e.target.closest('[data-chapter]');
      if (item) {
        const idx = this.chapterPageMap[parseInt(item.dataset.chapter, 10)];
        if (idx != null && this.pageFlip) this.pageFlip.flip(idx);
      }
    });
  }

  _toggleEditor(force) {
    this.editorOpen = force !== undefined ? force : !this.editorOpen;
    if (this.editorOpen) document.getElementById('json-editor').value = JSON.stringify(this.content, null, 2);
    document.getElementById('editor-drawer').classList.toggle('open', this.editorOpen);
  }

  /* ── loader ── */

  _hideLoader() {
    setTimeout(() => {
      const loader = document.getElementById('loading');
      loader && loader.classList.add('hidden');
      setTimeout(() => loader && loader.remove(), 700);
    }, 900);
  }

  /* ── utils ── */

  _esc(s) { return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''; }

  _debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const book = new HebrewBook();
  book.init();
  window._hebrewBook = book;
});
