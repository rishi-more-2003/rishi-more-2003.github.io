// the small things around the pond: the caption under the moon, the pause control, the feeding hint,
// and diagnostics that stay out of sight unless asked for (?debug, or `debug` in the terminal).
(() => {
  const toggle = document.getElementById('motion-toggle');
  const label = document.getElementById('motion-label');
  const hint = document.getElementById('water-hint');
  const note = document.getElementById('moon-note');
  // the canvas has id="pond", so window.pond is that element unless pond.js swapped in the api
  const pond = window.pond && typeof window.pond.stats === 'function' ? window.pond : null;
  if (!pond) {
    for (const e of [toggle, hint, note]) if (e) e.hidden = true;
    return;
  }

  const coarse = matchMedia('(pointer: coarse)').matches;
  const PHASES = ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon', 'waning gibbous', 'last quarter', 'waning crescent'];
  const QUALITY = ['full', 'dpr 1', 'no glow', 'lean'];
  const { phase, lit } = pond.moon();
  const moonName = lit < 0.03 ? 'new moon' : PHASES[Math.round(phase * 8) % 8];

  // the caption: tonight's phase, drawn small and named, set just under the reflection
  if (note) {
    const path = document.getElementById('moon-lit');
    const name = document.getElementById('moon-label');
    if (name) name.textContent = moonName;
    if (path) {
      // the lit part of a disc: half the rim, closed by the terminator's ellipse
      const r = 6.5, rx = (Math.abs(Math.cos(2 * Math.PI * phase)) * r).toFixed(2);
      const waxing = phase < 0.5, thin = waxing ? phase < 0.25 : phase > 0.75;
      path.setAttribute('d', lit < 0.01 ? '' : waxing
        ? `M0,${-r} A${r},${r} 0 0 1 0,${r} A${rx},${r} 0 0 ${thin ? 0 : 1} 0,${-r} Z`
        : `M0,${-r} A${r},${r} 0 0 0 0,${r} A${rx},${r} 0 0 ${thin ? 1 : 0} 0,${-r} Z`);
    }
    const seat = () => {
      const l = pond.layout();
      note.style.left = `${Math.round(l.mx)}px`;
      note.style.top = `${Math.round(l.my + l.mr * 1.55 + 12)}px`;
      note.hidden = false;
      requestAnimationFrame(() => note.classList.add('is-placed'));
    };
    seat();
    addEventListener('pond:compose', seat);
  }

  const FEED = coarse ? 'tap the water to feed the koi' : 'click the water to feed the koi';
  let nudge = 0;
  function reflect() {
    const paused = pond.paused();
    if (toggle) toggle.dataset.state = paused ? 'paused' : 'playing';
    if (label) label.textContent = paused ? 'wake the pond' : 'pause the pond';
    if (hint) hint.textContent = paused ? 'the pond is paused. wake it to feed the koi' : FEED;
  }
  reflect();
  addEventListener('pond:state', reflect);
  if (toggle) toggle.addEventListener('click', () => pond.pause(!pond.paused()));

  // the hint is also a button, so the koi can be fed from the keyboard
  if (hint) {
    hint.addEventListener('click', () => {
      if (pond.paused()) pond.pause(false);
      pond.feed();
    });
    // someone clicked the water while it was still: point at the way to wake it
    addEventListener('pond:still', () => {
      hint.classList.add('is-nudged');
      clearTimeout(nudge);
      nudge = setTimeout(() => hint.classList.remove('is-nudged'), 1600);
    });
  }

  // diagnostics: off unless asked for
  let panel = null, timer = 0;
  function debug(on) {
    if (on && !panel) {
      panel = document.createElement('pre');
      panel.className = 'debug';
      panel.setAttribute('aria-hidden', 'true');
      document.body.append(panel);
      const tick = () => {
        const s = pond.stats();
        panel.textContent = [
          `koi ${s.koi}  fed ${s.fed}  eaten ${s.eaten}  lanterns ${s.lanterns}`,
          `${s.fps == null ? '--' : s.fps} fps  render ${QUALITY[s.quality]}  dpr ${s.dpr}`,
          `${s.size}  ${s.running ? 'running' : pond.paused() ? 'paused' : 'idle'}  ${s.visible ? 'in view' : 'out of view'}`,
          `moon ${moonName}  ${Math.round(lit * 100)}% lit`,
        ].join('\n');
      };
      tick();
      timer = setInterval(tick, 250);
    } else if (!on && panel) {
      clearInterval(timer);
      panel.remove();
      panel = null;
    }
  }
  if (new URLSearchParams(location.search).has('debug')) debug(true);
  addEventListener('site:debug', () => debug(!panel));
})();
