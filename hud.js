// hud: the live top bar and the telemetry log. every number is read from the pond as it runs.
(() => {
  const statEl = document.getElementById('hud-stat');
  const moonEl = document.getElementById('hud-moon');
  const logEl = document.getElementById('hud-log');
  const pond = window.pond && typeof window.pond.stats === 'function' ? window.pond : null;
  if (!pond) return;

  const PHASES = ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon', 'waning gibbous', 'last quarter', 'waning crescent'];
  const QUALITY = ['full', 'dpr 1', 'no glow', 'lean'];
  const { phase, lit } = pond.moon();
  const moon = PHASES[Math.round(phase * 8) % 8];
  if (moonEl) moonEl.textContent = moon;

  const lines = [];
  const t0 = performance.now();
  setInterval(() => {
    const s = pond.stats();
    const secs = ((performance.now() - t0) / 1000).toFixed(2).padStart(6, '0');
    const pick = Math.floor(performance.now() / 200) % 4;
    const line = pick === 0 ? `> t+${secs}  koi ${s.koi}  fed ${s.fed}  eaten ${s.eaten}`
      : pick === 1 ? `> t+${secs}  ${s.fps} fps  render ${QUALITY[s.quality]}`
        : pick === 2 ? `> t+${secs}  moon ${moon.replace(/ moon$/, '')}  ${Math.round(lit * 100)}% lit`
          : `> t+${secs}  lanterns ${s.lanterns}  great carp ${s.golden ? 'seen' : '???'}`;
    lines.push(line);
    if (lines.length > 12) lines.shift();
    if (logEl) logEl.textContent = lines.join('\n');
    if (statEl) statEl.textContent = `${s.koi} koi · ${s.fps} fps`;
  }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 1000 : 200);
})();
