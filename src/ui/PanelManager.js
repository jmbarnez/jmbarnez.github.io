export const PanelManager = {
  panels: [
    { id: 'panel-equipment', containerSelector: '.game-content', defaultPos: { x: 16, y: 80 } },
    { id: 'panel-inventory', containerSelector: '.game-content', defaultPos: { x: 380, y: 80 } },
    { id: 'panel-skills', containerSelector: '.game-content', defaultPos: { x: 720, y: 80 } },
    { id: 'panel-zones', containerSelector: '.game-content', defaultPos: { x: 1080, y: 80 } },
    { id: 'panel-chat', containerSelector: '.game-content', defaultPos: { x: 16, y: 420 } },
    { id: 'panel-market', containerSelector: '.game-content', defaultPos: { x: 200, y: 150 } }
  ],
  dragging: null,
  offsetX: 0,
  offsetY: 0,
  containerRect: null,
  zCounter: 10,

  init() {
    this.panels.forEach(cfg => this.setupPanel(cfg));
    window.addEventListener('resize', () => this.clampAll());
    // Ensure saved positions are clamped to the current container on load
    this.clampAll();
  },

  setupPanel({ id, containerSelector, defaultPos }) {
    const el = document.getElementById(id);
    const container = document.querySelector(containerSelector);
    if (!el || !container) return;
    const key = `panel-pos:${id}`;
    const saved = localStorage.getItem(key);
    let pos = saved ? JSON.parse(saved) : defaultPos;
    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';
    const handle = el.querySelector('.drag-handle') || el;
    const bringToFront = () => { this.zCounter += 1; el.style.zIndex = String(this.zCounter); };
    handle.addEventListener('mousedown', (e) => { if (e.button !== 0) return; bringToFront(); this.startDrag(el, container, e); });
    handle.addEventListener('click', () => bringToFront());
    handle.addEventListener('touchstart', (e) => { const t = e.touches[0]; this.startDrag(el, container, t); e.preventDefault(); }, { passive: false });
  },

  startDrag(el, container, ePoint) {
    this.dragging = el;
    el.classList.add('dragging');
    const rect = el.getBoundingClientRect();
    this.containerRect = container.getBoundingClientRect();
    this.offsetX = ePoint.clientX - rect.left;
    this.offsetY = ePoint.clientY - rect.top;
    const move = (ev) => { const p = ev.touches ? ev.touches[0] : ev; this.onMove(p); };
    const up = () => this.endDrag(move, up);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up, { once: true });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', up, { once: true });
  },

  onMove(p) {
    if (!this.dragging) return;
    let x = p.clientX - this.containerRect.left - this.offsetX;
    let y = p.clientY - this.containerRect.top - this.offsetY;
    const maxX = this.containerRect.width - this.dragging.offsetWidth;
    const maxY = this.containerRect.height - this.dragging.offsetHeight;
    x = Math.max(0, Math.min(maxX, x));
    y = Math.max(0, Math.min(maxY, y));
    this.dragging.style.left = x + 'px';
    this.dragging.style.top = y + 'px';
  },

  endDrag(move, up) {
    if (!this.dragging) return;
    const el = this.dragging;
    el.classList.remove('dragging');
    document.removeEventListener('mousemove', move);
    document.removeEventListener('touchmove', move);
    const pos = { x: parseInt(el.style.left || '0', 10), y: parseInt(el.style.top || '0', 10) };
    localStorage.setItem(`panel-pos:${el.id}`, JSON.stringify(pos));
    
    // Auto-save when panel positions change
    try {
      import('../systems/SaveManager.js').then(({ SaveManager }) => {
        SaveManager.debouncedSave();
      });
    } catch {}
    
    this.dragging = null;
  },

  clampAll() {
    this.panels.forEach(({ id, containerSelector }) => {
      const el = document.getElementById(id);
      const container = document.querySelector(containerSelector);
      if (!el || !container) return;
      const crect = container.getBoundingClientRect();
      const x = Math.min(Math.max(0, parseInt(el.style.left || '0', 10)), Math.max(0, crect.width - el.offsetWidth));
      const y = Math.min(Math.max(0, parseInt(el.style.top || '0', 10)), Math.max(0, crect.height - el.offsetHeight));
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    });
  }
};


