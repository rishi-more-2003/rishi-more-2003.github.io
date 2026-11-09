// hud: the live top bar, the telemetry log, and the dock that picks how the pond is drawn.
// every number in the log is read from the pond as it runs.
(() => {
  const statEl = document.getElementById('hud-stat');
  const moonEl = document.getElementById('hud-moon');
  const logEl = document.getElementById('hud-log');
  const dock = document.getElementById('dock');
  const pond = window.pond && typeof window.pond.view === 'function' ? window.pond : null;
  if (!pond) {
    if (dock) dock.hidden = true;
    return;
  }

  const PHASES = ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon', 'waning gibbous', 'last quarter', 'waning crescent'];
  if (moonEl) moonEl.textContent = PHASES[Math.round(pond.moon().phase * 8) % 8];

  if (dock) {
    if (!pond.view().gl) dock.hidden = true; // without webgl there's only the plain picture
    const sync = () => {
      const current = pond.view().glyphs;
      for (const b of dock.querySelectorAll('button[data-set]')) {
        const on = b.dataset.set === current;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-checked', String(on));
      }
    };
    dock.addEventListener('click', e => {
      const b = e.target.closest('button[data-set]');
      if (!b) return;
      if (b.dataset.set === 'decoded') pond.decode(true);
      else pond.glyphs(b.dataset.set);
    });
    addEventListener('pond:view', sync);
    sync();
  }

  const lines = [];
  const t0 = performance.now();
  setInterval(() => {
    const v = pond.view(), s = pond.stats();
    const secs = ((performance.now() - t0) / 1000).toFixed(2).padStart(6, '0');
    const pick = Math.floor(performance.now() / 200) % 4;
    const line = pick === 0 ? `> t+${secs}  koi ${s.koi}  fed ${s.fed}  eaten ${s.eaten}`
      : pick === 1 ? `> t+${secs}  cell ${v.cell.toFixed(1)}px  lens ${v.lens ? 'open' : 'idle'}`
        : pick === 2 ? `> t+${secs}  scene ${Math.round(v.scale * 100)}%  ${v.fps} fps`
          : `> t+${secs}  ${v.glyphs}  decode ${String(Math.round(v.decode * 100)).padStart(3, '0')}%`;
    lines.push(line);
    if (lines.length > 12) lines.shift();
    if (logEl) logEl.textContent = lines.join('\n');
    if (statEl) statEl.textContent = `${Math.round(v.cell)}px · ${v.fps} fps`;
  }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 1000 : 200);
})();
