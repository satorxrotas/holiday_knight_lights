/* Holiday Knight Lights — design switcher for client review.
   Add a version by adding a line to VERSIONS. Remove this script tag from each page before launch. */
(function () {
  const VERSIONS = [
    { id: 'evergreen', name: 'Evergreen', href: 'index.html' },
    { id: 'midnight',  name: 'Midnight',  href: 'midnight.html' }
  ];
  const current = document.documentElement.dataset.version;

  const style = document.createElement('style');
  style.textContent = `
    .vswitch {
      position: fixed; z-index: 50; left: 50%; transform: translateX(-50%);
      top: calc(env(safe-area-inset-top, 0px) + 6px);
      display: flex; align-items: center; gap: 2px; padding: 3px;
      border-radius: 999px;
      background: rgba(12,12,12,.72); border: 1px solid rgba(255,255,255,.18);
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      box-shadow: 0 4px 18px rgba(0,0,0,.35);
      font: 600 11px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
      letter-spacing: .04em;
    }
    .vswitch span { color: rgba(255,255,255,.55); padding: 0 6px 0 8px; text-transform: uppercase; font-size: 9.5px; letter-spacing: .12em; }
    .vswitch a {
      color: rgba(255,255,255,.85); text-decoration: none;
      padding: 7px 11px; border-radius: 999px; white-space: nowrap;
    }
    .vswitch a[aria-current="page"] { background: #f5f3ec; color: #111; }
    .vswitch a:focus-visible { outline: 2px solid #f2c35b; outline-offset: 2px; }
    body.sheet-open .vswitch { display: none; }
  `;
  document.head.appendChild(style);

  const nav = document.createElement('nav');
  nav.className = 'vswitch';
  nav.setAttribute('aria-label', 'Design versions');
  nav.innerHTML = '<span>Design</span>' + VERSIONS.map(v =>
    `<a href="${v.href}"${v.id === current ? ' aria-current="page"' : ''}>${v.name}</a>`).join('');
  document.body.appendChild(nav);
})();
