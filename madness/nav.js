/* Shared navigation for the Morrowind Modding Madness section.
   Usage inside a page template (styles come from style.css):
     <madness-nav active="home"></madness-nav>
   `active` is one of: home, mods, modders, teams, rules. When omitted,
   it is derived from location.pathname.

   The nav renders into shadow DOM on purpose: the dc-runtime snapshots
   x-dc's innerHTML as its React template and reconciles all light-DOM
   children, so light-DOM injection here would get baked into the
   template and then fought over by React. Shadow content is invisible
   to both. The shadow root links style.css itself (cached, so no
   second request). */
(function () {
  'use strict';

  var LINKS = [
    { id: 'home',    href: './',      label: 'HOME' },
    { id: 'mods',    href: 'mods',    label: 'THE MODS' },
    { id: 'modders', href: 'modders', label: 'MODDERS' },
    { id: 'teams',   href: 'teams',   label: 'TEAMS' },
    { id: 'rules',   href: 'rules',   label: 'RULES' }
  ];

  function activeFromPath() {
    var base = (location.pathname.split('/').pop() || '').replace(/\.html?$/, '');
    if (base === '' || base === 'index' || base === 'madness') return 'home';
    return LINKS.some(function (l) { return l.id === base; }) ? base : '';
  }

  class MadnessNav extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;

      var active = this.getAttribute('active') || activeFromPath();
      var links = LINKS.map(function (l) {
        var attrs = l.id === active ? ' class="mm-active" aria-current="page"' : '';
        return '<a href="' + l.href + '"' + attrs + '>' + l.label + '</a>';
      }).join('');

      var root = this.attachShadow({ mode: 'open' });
      root.innerHTML =
        '<link rel="stylesheet" href="./style.css">' +
        '<nav class="mm-nav" aria-label="Modding Madness">' +
          '<a class="mm-nav-brand" href="./">MODDING&nbsp;MADNESS</a>' +
          '<button class="mm-nav-toggle" type="button" aria-expanded="false" aria-controls="mm-nav-links">MENU</button>' +
          '<div class="mm-nav-links" id="mm-nav-links">' + links + '</div>' +
        '</nav>';

      var nav = root.querySelector('.mm-nav');
      var toggle = root.querySelector('.mm-nav-toggle');
      toggle.addEventListener('click', function () {
        var open = nav.classList.toggle('mm-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }
  }

  if (!customElements.get('madness-nav')) {
    customElements.define('madness-nav', MadnessNav);
  }
})();
