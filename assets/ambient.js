/* Holiday Knight Lights — shared ambient effects.
   Light border: <svg id="lights" data-colors="#hex,#hex,..."> (wire colors come from page CSS).
   Snow: <canvas id="snow" data-color="#hex" data-density="1"> */
(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- light border ---------- */
  const svg = document.getElementById('lights');
  if (svg) {
    const NS = 'http://www.w3.org/2000/svg';
    const COLORS = (svg.dataset.colors || '#ff4d55,#3fd17a,#ffc94d,#5aa8ff,#ff9a3c,#f6f2ff').split(',');
    const el = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };

    function draw() {
      const w = window.innerWidth, h = window.innerHeight, wide = w >= 720;
      const inset = wide ? 18 : 12, sag = wide ? 12 : 9, target = wide ? 58 : 44;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.innerHTML = '';
      const defs = el('defs', {});
      const f = el('filter', { id: 'glow', x: '-150%', y: '-150%', width: '400%', height: '400%' });
      f.appendChild(el('feGaussianBlur', { stdDeviation: wide ? 6 : 5 }));
      defs.appendChild(f); svg.appendChild(defs);

      const L = inset, R = w - inset, T = inset, B = h - inset;
      const edges = [
        { a: [L, T], b: [R, T], n: [0, 1], rot: 0 },
        { a: [R, T], b: [R, B], n: [-1, 0], rot: 90 },
        { a: [R, B], b: [L, B], n: [0, -1], rot: 180 },
        { a: [L, B], b: [L, T], n: [1, 0], rot: 270 }
      ];
      let d = `M ${L} ${T}`; const bulbs = [];
      edges.forEach(e => {
        const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
        const count = Math.max(2, Math.round(len / target));
        for (let i = 0; i < count; i++) {
          const t1 = (i + 1) / count, tm = (i + .5) / count;
          const x1 = e.a[0] + (e.b[0] - e.a[0]) * t1, y1 = e.a[1] + (e.b[1] - e.a[1]) * t1;
          const mx = e.a[0] + (e.b[0] - e.a[0]) * tm, my = e.a[1] + (e.b[1] - e.a[1]) * tm;
          d += ` Q ${mx + e.n[0] * sag * 2} ${my + e.n[1] * sag * 2} ${x1} ${y1}`;
          bulbs.push({ x: mx + e.n[0] * sag, y: my + e.n[1] * sag, rot: e.rot });
        }
      });
      svg.appendChild(el('path', { d, class: 'wire' }));
      svg.appendChild(el('path', { d, class: 'wire-hi' }));
      const s = wide ? 1.25 : 1;
      bulbs.forEach((p, i) => {
        const color = COLORS[i % COLORS.length];
        const style = `--delay:${(-((i * 0.37) % 2.8)).toFixed(2)}s;--dur:${(2 + (i % 5) * 0.45).toFixed(2)}s`;
        const g = el('g', { transform: `translate(${p.x} ${p.y}) rotate(${p.rot}) scale(${s})` });
        g.appendChild(el('ellipse', { class: 'halo', cx: 0, cy: 12, rx: 9, ry: 11, fill: color, filter: 'url(#glow)', style }));
        g.appendChild(el('rect', { class: 'socket', x: -3.2, y: -1, width: 6.4, height: 6, rx: 1.2 }));
        g.appendChild(el('path', { class: 'bulb', style, fill: color, d: 'M -3.6 5 C -6 9 -5.6 15 -2.6 18.5 C -1.2 20 1.2 20 2.6 18.5 C 5.6 15 6 9 3.6 5 Z' }));
        g.appendChild(el('ellipse', { class: 'bulb', style, cx: -1.4, cy: 10, rx: 1, ry: 2.6, fill: '#fff', opacity: .55 }));
        svg.appendChild(g);
      });
    }
    let raf;
    window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); });
    draw();
  }

  /* ---------- snow ---------- */
  const canvas = document.getElementById('snow');
  if (canvas && !reduceMotion) {
    const ctx = canvas.getContext('2d');
    const color = canvas.dataset.color || '#f3f1e8';
    const density = parseFloat(canvas.dataset.density || '1');
    let w, h, dpr, flakes = [], last = 0, running = true;

    const makeFlake = randomY => {
      const depth = Math.random();
      return {
        x: Math.random() * w, y: randomY ? Math.random() * h : -10,
        r: 0.6 + depth * 1.9, vy: 12 + depth * 30,
        sway: 6 + Math.random() * 14, phase: Math.random() * Math.PI * 2, freq: 0.4 + Math.random() * 0.6,
        a: 0.25 + depth * 0.5
      };
    };
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.min(140, Math.round((w * h) / 9000 * density));
      while (flakes.length < target) flakes.push(makeFlake(true));
      flakes.length = target;
    }
    function frame(t) {
      if (!running) return;
      const dt = Math.min((t - (last || t)) / 1000, 0.05);
      last = t;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      for (const f of flakes) {
        f.y += f.vy * dt; f.phase += f.freq * dt;
        if (f.y > h + 10) Object.assign(f, makeFlake(false));
        ctx.globalAlpha = f.a;
        ctx.beginPath(); ctx.arc(f.x + Math.sin(f.phase) * f.sway, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(frame);
    }
    function setRunning(on) { if (on === running) return; running = on; if (on) { last = 0; requestAnimationFrame(frame); } }
    const check = () => setRunning(!document.hidden && !document.body.classList.contains('sheet-open'));
    document.addEventListener('visibilitychange', check);
    new MutationObserver(check).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', resize);
    resize();
    requestAnimationFrame(frame);
  }
})();
