// <lu-i name="clock" size="18" stroke="1.5"> — Lucide icon at the design system's 1.5 stroke.
(function () {
  if (customElements.get('lu-i')) return;
  const pascal = n => n.split('-').map(s => s ? s[0].toUpperCase() + s.slice(1) : '').join('');
  customElements.define('lu-i', class extends HTMLElement {
    static get observedAttributes() { return ['name', 'size', 'stroke']; }
    connectedCallback() { this.r(); }
    attributeChangedCallback() { if (this.isConnected) this.r(); }
    r() {
      const L = window.lucide;
      if (!L || !L.icons) { clearTimeout(this._t); this._t = setTimeout(() => this.r(), 80); return; }
      const ic = L.icons[pascal(this.getAttribute('name') || '')];
      const s = this.getAttribute('size') || '18';
      this.style.display = 'inline-flex'; this.style.flex = 'none'; this.style.width = s + 'px'; this.style.height = s + 'px';
      const root = this._root || (this._root = this.attachShadow({ mode: 'open' }));
      if (!ic) { root.innerHTML = ''; return; }
      const node = ic[0] === 'svg' ? ic[2] : ic;
      const inner = node.map(([t, a]) => '<' + t + ' ' + Object.entries(a).map(([k, v]) => k + '="' + v + '"').join(' ') + '/>').join('');
      root.innerHTML = '<style>:host{display:inline-flex;flex:none}svg{display:block}</style><svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (this.getAttribute('stroke') || '1.5') + '" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
    }
  });
})();
// <bp-c> — blueprint "+" registration marks on the four corners of its positioned parent.
(function () {
  if (customElements.get('bp-c')) return;
  customElements.define('bp-c', class extends HTMLElement {
    static get observedAttributes() { return ['color']; }
    connectedCallback() { this.r(); }
    attributeChangedCallback() { if (this.isConnected) this.r(); }
    r() {
      const c = this.getAttribute('color') || '#8b8c8e';
      const g = 'linear-gradient(' + c + ',' + c + ')';
      const v = '1px 11px no-repeat', h = '11px 1px no-repeat';
      Object.assign(this.style, {
        position: 'absolute', inset: '-6px', pointerEvents: 'none', display: 'block',
        background: [
          g + ' 5px 0/' + v, g + ' 0 5px/' + h,
          g + ' calc(100% - 5px) 0/' + v, g + ' 100% 5px/' + h,
          g + ' 5px 100%/' + v, g + ' 0 calc(100% - 5px)/' + h,
          g + ' calc(100% - 5px) 100%/' + v, g + ' 100% calc(100% - 5px)/' + h
        ].join(',')
      });
    }
  });
})();
