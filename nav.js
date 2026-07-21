/* Shared site switcher for every Dark Elf Modding section.
   Add <mms-site-switcher current="..."></mms-site-switcher> to a header.
   Valid current values: main, modjam, modathon, madness, map. */
(function () {
  'use strict';

  var SITES = [
    { id: 'main', href: '/', label: 'Dark Elf Modding' },
    { id: 'modjam', href: '/modjam/', label: 'ModJam' },
    { id: 'modathon', href: '/modathon/', label: 'Modathon' },
    { id: 'madness', href: '/madness/', label: 'Madness' },
    { id: 'map', href: '/map/', label: 'TES3 Mod Map' }
  ];

  function currentFromPath() {
    var section = location.pathname.split('/').filter(Boolean)[0] || 'main';
    return SITES.some(function (site) { return site.id === section; }) ? section : 'main';
  }

  function siteById(id) {
    return SITES.find(function (site) { return site.id === id; }) || SITES[0];
  }

  class MmsSiteSwitcher extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) {
        this._connectListeners();
        return;
      }

      var current = siteById(this.getAttribute('current') || currentFromPath());
      this.setAttribute('current', current.id);

      var links = SITES.map(function (site) {
        var currentAttrs = site.id === current.id ? ' aria-current="page"' : '';
        return '<a href="' + site.href + '"' + currentAttrs + '>' +
          '<span>' + site.label + '</span>' +
          (site.id === current.id ? '<small>Current</small>' : '') +
        '</a>';
      }).join('');

      var root = this.attachShadow({ mode: 'open' });
      root.innerHTML =
        '<style>' +
          ':host {' +
            '--switcher-accent: #d9bc7a;' +
            '--switcher-bg: rgba(13, 11, 8, .94);' +
            '--switcher-bg-hover: rgba(217, 188, 122, .13);' +
            '--switcher-border: rgba(217, 188, 122, .46);' +
            '--switcher-ink: #f0e3c0;' +
            '--switcher-muted: #b5a989;' +
            '--switcher-radius: 5px;' +
            '--switcher-font: Cinzel, Georgia, serif;' +
            'position: relative;' +
            'z-index: 1001;' +
            'display: inline-block;' +
            'flex: 0 0 auto;' +
            'line-height: 1;' +
            'pointer-events: auto;' +
          '}' +
          ':host([placement="overlay"]) {' +
            'position: absolute;' +
            'top: 18px;' +
            'right: clamp(16px, 3vw, 36px);' +
          '}' +
          ':host([current="modjam"]) {' +
            '--switcher-accent: #91c8e6;' +
            '--switcher-bg: rgba(12, 20, 32, .98);' +
            '--switcher-bg-hover: rgba(145, 200, 230, .12);' +
            '--switcher-border: rgba(145, 200, 230, .4);' +
            '--switcher-ink: #f5f9fc;' +
            '--switcher-muted: #a9b7c4;' +
            '--switcher-radius: 999px;' +
            '--switcher-font: "Fira Sans Condensed", Arial, sans-serif;' +
          '}' +
          ':host([current="modathon"]) {' +
            '--switcher-accent: #e6cd7a;' +
            '--switcher-bg: #2b3520;' +
            '--switcher-bg-hover: rgba(230, 205, 122, .13);' +
            '--switcher-border: rgba(230, 205, 122, .55);' +
            '--switcher-ink: #f0ead6;' +
            '--switcher-muted: #b8ad8e;' +
            '--switcher-radius: 2px;' +
            '--switcher-font: "Chakra Petch", Arial, sans-serif;' +
          '}' +
          ':host([current="madness"]) {' +
            '--switcher-accent: #e8b23a;' +
            '--switcher-bg: #1e1b19;' +
            '--switcher-bg-hover: rgba(232, 178, 58, .11);' +
            '--switcher-border: rgba(232, 224, 205, .35);' +
            '--switcher-ink: #e8e0cd;' +
            '--switcher-muted: #aaa28f;' +
            '--switcher-radius: 0;' +
            '--switcher-font: Cinzel, Georgia, serif;' +
          '}' +
          ':host([current="map"]) {' +
            '--switcher-accent: #d9b45b;' +
            '--switcher-bg: rgba(24, 25, 32, .94);' +
            '--switcher-bg-hover: rgba(217, 180, 91, .13);' +
            '--switcher-border: #3a3c48;' +
            '--switcher-ink: #e8e4d8;' +
            '--switcher-muted: #a9a494;' +
            '--switcher-radius: 6px;' +
            '--switcher-font: Georgia, "Times New Roman", serif;' +
          '}' +
          '* { box-sizing: border-box; }' +
          'details { position: relative; }' +
          'summary {' +
            'display: flex;' +
            'min-height: 36px;' +
            'padding: 0 12px;' +
            'align-items: center;' +
            'gap: 9px;' +
            'color: var(--switcher-ink);' +
            'background: var(--switcher-bg);' +
            'border: 1px solid var(--switcher-border);' +
            'border-radius: var(--switcher-radius);' +
            'font: 700 11px/1 var(--switcher-font);' +
            'letter-spacing: .13em;' +
            'list-style: none;' +
            'text-transform: uppercase;' +
            'white-space: nowrap;' +
            'cursor: pointer;' +
            'transition: color .15s ease, border-color .15s ease, background .15s ease;' +
          '}' +
          'summary::-webkit-details-marker { display: none; }' +
          'summary:hover, details[open] summary {' +
            'color: var(--switcher-accent);' +
            'background: var(--switcher-bg-hover);' +
            'border-color: var(--switcher-accent);' +
          '}' +
          'summary:focus-visible {' +
            'outline: 2px solid var(--switcher-accent);' +
            'outline-offset: 2px;' +
          '}' +
          '.chevron {' +
            'width: 7px;' +
            'height: 7px;' +
            'border-right: 1px solid currentColor;' +
            'border-bottom: 1px solid currentColor;' +
            'transform: translateY(-2px) rotate(45deg);' +
            'transition: transform .15s ease;' +
          '}' +
          'details[open] .chevron { transform: translateY(2px) rotate(225deg); }' +
          '.menu {' +
            'position: absolute;' +
            'top: calc(100% + 8px);' +
            'right: 0;' +
            'width: min(238px, calc(100vw - 24px));' +
            'padding: 7px;' +
            'overflow: hidden;' +
            'background: var(--switcher-bg);' +
            'border: 1px solid var(--switcher-border);' +
            'border-radius: 7px;' +
            'box-shadow: 0 16px 38px rgba(0, 0, 0, .48);' +
          '}' +
          '.menu-title {' +
            'display: block;' +
            'padding: 8px 10px 9px;' +
            'color: var(--switcher-muted);' +
            'font: 700 9px/1.2 var(--switcher-font);' +
            'letter-spacing: .16em;' +
            'text-transform: uppercase;' +
          '}' +
          'a {' +
            'display: flex;' +
            'min-height: 39px;' +
            'padding: 0 10px;' +
            'align-items: center;' +
            'justify-content: space-between;' +
            'gap: 12px;' +
            'color: var(--switcher-ink);' +
            'border-radius: 4px;' +
            'font: 600 13px/1.2 var(--switcher-font);' +
            'letter-spacing: .035em;' +
            'text-decoration: none;' +
          '}' +
          'a:hover, a:focus-visible { color: var(--switcher-accent); background: var(--switcher-bg-hover); outline: none; }' +
          'a:focus-visible { box-shadow: inset 0 0 0 1px var(--switcher-accent); }' +
          'a[aria-current="page"] { color: var(--switcher-accent); background: var(--switcher-bg-hover); }' +
          'small {' +
            'color: var(--switcher-muted);' +
            'font: 700 8px/1 var(--switcher-font);' +
            'letter-spacing: .12em;' +
            'text-transform: uppercase;' +
          '}' +
          '@media (prefers-reduced-motion: reduce) {' +
            'summary, .chevron { transition: none; }' +
          '}' +
        '</style>' +
        '<details>' +
          '<summary aria-label="Explore Dark Elf Modding sites. Current site: ' + current.label + '">' +
            '<span>Sites</span><span class="chevron" aria-hidden="true"></span>' +
          '</summary>' +
          '<nav class="menu" aria-label="Dark Elf Modding sites">' +
            '<span class="menu-title">Explore Dark Elf Modding</span>' + links +
          '</nav>' +
        '</details>';

      this._details = root.querySelector('details');
      this._onDocumentPointerDown = this._handleDocumentPointerDown.bind(this);
      this._onKeyDown = this._handleKeyDown.bind(this);
      this._connectListeners();
    }

    _connectListeners() {
      document.addEventListener('pointerdown', this._onDocumentPointerDown);
      this.shadowRoot.addEventListener('keydown', this._onKeyDown);
    }

    disconnectedCallback() {
      document.removeEventListener('pointerdown', this._onDocumentPointerDown);
      if (this.shadowRoot) this.shadowRoot.removeEventListener('keydown', this._onKeyDown);
    }

    _handleDocumentPointerDown(event) {
      var path = event.composedPath ? event.composedPath() : [];
      var clickedInside = path.indexOf(this) !== -1 || this.contains(event.target);
      if (this._details && this._details.open && !clickedInside) {
        this._details.open = false;
      }
    }

    _handleKeyDown(event) {
      if (event.key !== 'Escape' || !this._details || !this._details.open) return;
      this._details.open = false;
      this.shadowRoot.querySelector('summary').focus();
    }
  }

  if (!customElements.get('mms-site-switcher')) {
    customElements.define('mms-site-switcher', MmsSiteSwitcher);
  }
})();
