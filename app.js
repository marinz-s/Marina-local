/* global BOOK_CONTENT, St */

class HebrewBook {
  constructor() {
    this.content = window.bookContent || BOOK_CONTENT;
    this.pageFlip = null;
    this.pageList = [];      // flat ordered list: {type, data, pageNum}
    this.chapterPageMap = {}; // chapterId -> flat page index
    this.currentPage = 0;
    this.totalInnerPages = 0;
    this.editorOpen = false;

    this._onFlip = this._onFlip.bind(this);
    this._onResize = this._onResize.bind(this);
  }

  /* ─────────────────────────────── bootstrap ── */

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

  /* ─────────────────────────────── page list ── */

  _buildPageList() {
    this.pageList = [];
    let innerPageNum = 1;

    // front cover (counts as page 0 — not numbered)
    this.pageList.push({ type: 'cover-front', data: this.content });

    // TOC
    this.pageList.push({ type: 'toc', data: this.content });

    // chapters
    this.content.chapters.forEach((ch) => {
      this.chapterPageMap[ch.id] = this.pageList.length;
      ch.pages.forEach((pg) => {
        const entry = { type: pg.type === 'chapter-header' ? 'chapter-header' : 'text', data: pg };
        if (pg.type !== 'chapter-header') {
          entry.pageNum = innerPageNum++;
        }
        this.pageList.push(entry);
      });
    });

    this.totalInnerPages = innerPageNum - 1;

    // back cover
    this.pageList.push({ type: 'cover-back', data: this.content });
  }

  /* ─────────────────────────────── DOM rendering ── */

  _renderAllPages() {
    const container = document.getElementById('flip-book');
    container.innerHTML = '';
    this.pageList.forEach((entry, idx) => {
      const el = this._buildPageEl(entry, idx);
      container.appendChild(el);
    });
    this._updateDots();
  }

  _buildPageEl(entry, idx) {
    const div = document.createElement('div');
    div.className = 'page';
    div.dataset.pageIndex = idx;

    switch (entry.type) {
      case 'cover-front':
        div.classList.add('page-cover', 'page-cover-front');
        div.innerHTML = this._tmplCoverFront(entry.data);
        break;
      case 'cover-back':
        div.classList.add('page-back-cover');
        div.innerHTML = this._tmplCoverBack(entry.data);
        break;
      case 'toc':
        div.classList.add('page-inner', 'toc-page');
        div.innerHTML = this._tmplTOC(entry.data);
        break;
      case 'chapter-header':
        div.classList.add('page-inner', 'chapter-header-page');
        div.innerHTML = this._tmplChapterHeader(entry.data);
        break;
      case 'text':
        div.classList.add('page-inner');
        div.innerHTML = this._tmplTextPage(entry.data, entry.pageNum);
        break;
    }

    return div;
  }

  /* ─────────────────────────────── templates ── */

  _tmplCoverFront(data) {
    return `
      <div class="cover-cross">✠</div>
      <div class="cover-title">${data.title}</div>
      <div class="cover-rule"></div>
      <div class="cover-subtitle">${data.subtitle}</div>
      <div class="cover-rule"></div>
      <div class="cover-author">${data.author}</div>
    `;
  }

  _tmplCoverBack(data) {
    return `
      <div class="back-cover-seal">
        <span>✠</span>
      </div>
    `;
  }

  _tmplTOC(data) {
    const items = data.chapters.map((ch, i) => {
      // page offset: cover(1) + toc(1) + prior chapter pages
      const priorPages = data.chapters
        .slice(0, i)
        .reduce((sum, c) => sum + c.pages.length, 0);
      const pageNum = 2 + priorPages + 1;
      return `
        <div class="toc-item" data-chapter="${ch.id}">
          <span class="toc-chapter-num">${this._numToHebrew(i + 1)}</span>
          <span class="toc-chapter-title">${ch.title}</span>
          <span class="toc-page-num">${pageNum}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="page-content">
        <div class="toc-title">תוכן עניינים</div>
        ${items}
        <div class="page-number">—</div>
      </div>
    `;
  }

  _tmplChapterHeader(pg) {
    return `
      <div class="page-content">
        <div class="chapter-top-rule"></div>
        <div class="chapter-number">פרק ${pg.chapterNumber}</div>
        <div class="chapter-title">${pg.title}</div>
        <div class="chapter-subtitle">${pg.subtitle || ''}</div>
        <div class="chapter-bottom-rule"></div>
      </div>
    `;
  }

  _tmplTextPage(pg, pageNum) {
    const blocks = (pg.content || []).map(b => this._tmplBlock(b)).join('');
    return `
      <div class="page-content body-text">
        ${blocks}
        <div class="page-number">${pageNum}</div>
      </div>
    `;
  }

  _tmplBlock(block) {
    switch (block.type) {
      case 'verse':
        return `
          <div class="verse-block">
            <span class="verse-number">${block.number}</span>
            <span class="verse-text">${this._esc(block.text)}</span>
          </div>
        `;
      case 'callout':
        return `<div class="callout-block">${this._esc(block.text)}</div>`;
      case 'italic':
        return `<p class="italic-block">${this._esc(block.text)}</p>`;
      case 'paragraph':
        return `<p style="margin-bottom:14px">${this._esc(block.text)}</p>`;
      default:
        return '';
    }
  }

  /* ─────────────────────────────── StPageFlip ── */

  _getDimensions() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isMobile = vw < 768;
    const isLandscape = vw > vh;
    const spineW = isMobile ? 18 : 28;

    let pageW, pageH;

    if (isMobile) {
      if (isLandscape) {
        // landscape mobile: show as spread if possible
        pageH = vh - 80;
        pageW = Math.min((vw - spineW) / 2 - 4, pageH * 0.72);
      } else {
        // portrait mobile: single page, full width
        pageW = vw - spineW - 16;
        pageH = Math.min(vh - 100, pageW * 1.42);
      }
    } else {
      // desktop
      pageW = Math.min(440, (vw - spineW - 40) / 2);
      pageH = Math.min(vh - 80, pageW * 1.45);
      pageH = Math.max(pageH, 400);
    }

    return { pageW: Math.floor(pageW), pageH: Math.floor(pageH), isMobile, isLandscape, spineW };
  }

  _initPageFlip() {
    const { pageW, pageH, isMobile, isLandscape } = this._getDimensions();
    const container = document.getElementById('flip-book');

    // apply container size
    container.style.width = pageW + 'px';
    container.style.height = pageH + 'px';

    // update spine height
    document.getElementById('spine').style.height = pageH + 'px';

    const usePortrait = isMobile && !isLandscape;

    this.pageFlip = new St.PageFlip(container, {
      width: pageW,
      height: pageH,
      size: 'fixed',
      minWidth: 200,
      maxWidth: 600,
      minHeight: 300,
      maxHeight: 900,
      drawShadow: true,
      flippingTime: 600,
      usePortrait: usePortrait,
      showCover: true,
      mobileScrollSupport: false,
      swipeDistance: 20,
      clickEventForward: false,
      useMouseEvents: true,
      startPage: 0,
      maxShadowOpacity: 0.6,
    });

    this.pageFlip.loadFromHTML(document.querySelectorAll('#flip-book .page'));
    this.pageFlip.on('flip', this._onFlip);
    this.pageFlip.on('changeState', () => this._updateDots());
  }

  _destroyAndRebuild() {
    if (this.pageFlip) {
      try { this.pageFlip.destroy(); } catch (_) {}
      this.pageFlip = null;
    }
    this._buildPageList();
    this._renderAllPages();
    this._initPageFlip();
    this._initDots();
  }

  /* ─────────────────────────────── events ── */

  _onFlip(e) {
    this.currentPage = e.data;
    this._updateDots();
    this._updateProgress();
  }

  _updateProgress() {
    const total = this.pageList.length - 1;
    const pct = total > 0 ? (this.currentPage / total) * 100 : 0;
    const bar = document.getElementById('progress-bar');
    if (bar) bar.style.width = pct + '%';
  }

  _onResize() {
    const { pageW, pageH, isMobile, isLandscape } = this._getDimensions();
    const container = document.getElementById('flip-book');
    container.style.width = pageW + 'px';
    container.style.height = pageH + 'px';
    document.getElementById('spine').style.height = pageH + 'px';

    if (this.pageFlip) {
      try {
        this.pageFlip.updateState();
      } catch (_) {
        this._destroyAndRebuild();
      }
    }
  }

  /* ─────────────────────────────── navigation ── */

  _initNavZones() {
    // Hebrew RTL: LEFT side = forward (next page), RIGHT side (spine) = back
    const navLeft  = document.getElementById('nav-left');
    const navRight = document.getElementById('nav-right');

    navLeft.addEventListener('click', () => {
      if (this.pageFlip) this.pageFlip.flipNext('bottom');
    });
    navRight.addEventListener('click', () => {
      if (this.pageFlip) this.pageFlip.flipPrev('bottom');
    });

    // Touch hint ripple on tap
    [navLeft, navRight].forEach(zone => {
      zone.addEventListener('touchstart', (e) => {
        const r = document.createElement('div');
        r.className = 'tap-ripple';
        const rect = zone.getBoundingClientRect();
        const touch = e.touches[0];
        r.style.left = (touch.clientX - rect.left) + 'px';
        r.style.top  = (touch.clientY - rect.top) + 'px';
        zone.appendChild(r);
        setTimeout(() => r.remove(), 500);
      }, { passive: true });
    });

    // Keyboard (RTL mapped)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowDown')  this.pageFlip && this.pageFlip.flipNext();
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp')    this.pageFlip && this.pageFlip.flipPrev();
    });
  }

  _initDots() {
    const wrap = document.getElementById('chapter-dots');
    wrap.innerHTML = '';

    // dot for cover
    const coverDot = document.createElement('div');
    coverDot.className = 'chapter-dot';
    coverDot.title = 'כריכה';
    coverDot.addEventListener('click', () => this.pageFlip && this.pageFlip.flip(0));
    wrap.appendChild(coverDot);

    // dot per chapter
    this.content.chapters.forEach((ch) => {
      const dot = document.createElement('div');
      dot.className = 'chapter-dot';
      dot.title = ch.title;
      dot.dataset.chapterId = ch.id;
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

    // find which chapter we're in
    let activeChapter = null;
    this.content.chapters.forEach((ch) => {
      const start = this.chapterPageMap[ch.id];
      const end = start + ch.pages.length;
      if (pg >= start && pg < end) activeChapter = ch.id;
    });

    if (pg === 0) {
      dots[0] && dots[0].classList.add('active');
    } else if (activeChapter) {
      const idx = this.content.chapters.findIndex(c => c.id === activeChapter);
      dots[idx + 1] && dots[idx + 1].classList.add('active');
    }
  }

  /* ─────────────────────────────── editor ── */

  _initEditor() {
    const btn = document.getElementById('edit-btn');
    const drawer = document.getElementById('editor-drawer');
    const closeBtn = document.getElementById('editor-close');
    const applyBtn = document.getElementById('editor-apply');
    const textarea = document.getElementById('json-editor');
    const errEl = document.getElementById('editor-error');

    btn.addEventListener('click', () => this._toggleEditor());
    closeBtn.addEventListener('click', () => this._toggleEditor(false));

    applyBtn.addEventListener('click', () => {
      errEl.textContent = '';
      try {
        const parsed = JSON.parse(textarea.value);
        window.bookContent = parsed;
        this.content = parsed;
        this._destroyAndRebuild();
        this._toggleEditor(false);
      } catch (err) {
        errEl.textContent = 'שגיאת JSON: ' + err.message;
      }
    });

    // TOC clicks → jump to chapter
    document.getElementById('flip-book').addEventListener('click', (e) => {
      const item = e.target.closest('[data-chapter]');
      if (item) {
        const chId = parseInt(item.dataset.chapter, 10);
        const idx = this.chapterPageMap[chId];
        if (idx != null && this.pageFlip) this.pageFlip.flip(idx);
      }
    });
  }

  _toggleEditor(force) {
    const drawer = document.getElementById('editor-drawer');
    const textarea = document.getElementById('json-editor');
    this.editorOpen = force !== undefined ? force : !this.editorOpen;

    if (this.editorOpen) {
      textarea.value = JSON.stringify(this.content, null, 2);
      drawer.classList.add('open');
    } else {
      drawer.classList.remove('open');
    }
  }

  /* ─────────────────────────────── loader ── */

  _hideLoader() {
    // wait for fonts + flip init
    setTimeout(() => {
      const loader = document.getElementById('loading');
      loader && loader.classList.add('hidden');
      setTimeout(() => loader && loader.remove(), 700);
    }, 800);
  }

  /* ─────────────────────────────── utils ── */

  _esc(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  _numToHebrew(n) {
    const map = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י'];
    return map[n] || String(n);
  }

  _debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }
}

/* ─────────────────────────────── boot ── */
document.addEventListener('DOMContentLoaded', () => {
  const book = new HebrewBook();
  book.init();
  window._hebrewBook = book;
});
