export const Tooltip = {
  element: null,
  create() {
    if (!this.element) {
      this.element = document.createElement('div');
      this.element.className = 'tooltip';
      document.body.appendChild(this.element);
    }
    return this.element;
  },
  show(e, text) {
    const tooltip = this.create();
    // Reset and ensure not stuck
    tooltip.classList.remove('visible');
    if (text.includes('\n')) {
      tooltip.innerHTML = text.split('\n').map(line => line ? `<div>${line}</div>` : '<div style="height: 8px;"></div>').join('');
    } else {
      tooltip.textContent = text;
    }
    tooltip.style.left = e.pageX + 10 + 'px';
    tooltip.style.top = e.pageY - 10 + 'px';
    tooltip.classList.add('visible');
  },
  hide() { if (this.element) { this.element.classList.remove('visible'); this.element.style.left = '-9999px'; this.element.style.top = '-9999px'; } },
  move(e) { if (this.element && this.element.classList.contains('visible')) { this.element.style.left = e.pageX + 'px'; this.element.style.top = e.pageY + 'px'; } }
};


