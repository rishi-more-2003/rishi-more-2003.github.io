// the small things around the page: notes left for me (the contact form, and `msg` in the terminal),
// the caption under the moon, the pause control, the feeding hint, and diagnostics that stay out of
// sight unless asked for (?debug, or `debug` in the terminal).
(() => {
  // ---------------------------------------------------------------- notes

  // a note has one way out, shared by the form and the terminal. if the form names a relay
  // (data-relay, plus data-key if the relay wants one) the note is posted there and lands in my inbox.
  // with no relay it opens the visitor's own mail app with the note ready to send.
  const noteForm = document.getElementById('msg-form');
  const mail = document.querySelector('[data-contact="email"]');
  const TO = mail ? mail.getAttribute('href').replace(/^mailto:/i, '') : '';
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  let lastSent = 0;
  const message = {
    max: 2000,
    to: TO,
    live: () => !!(noteForm && noteForm.dataset.relay),
    valid: s => EMAIL.test(String(s || '').trim()),
    mailto: (text, from) => `mailto:${TO}?subject=${encodeURIComponent('hello from your site')}&body=${encodeURIComponent(text + (from ? `\n\nreply to: ${from}` : ''))}`,
    open: url => { window.location.href = url; },
    async send({ email, message: text, via }) {
      if (!message.live()) return { ok: false, reason: 'no-relay' };
      if (Date.now() - lastSent < 15000) return { ok: false, reason: 'too-soon' };
      const body = { subject: `note from ${location.hostname || 'the site'}`, from_name: email, email, message: text, via };
      if (noteForm.dataset.key) body.access_key = noteForm.dataset.key;
      const stop = new AbortController(), timer = setTimeout(() => stop.abort(), 12000);
      try {
        const r = await fetch(noteForm.dataset.relay, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
          signal: stop.signal,
        });
        const j = await r.json().catch(() => ({}));
        const ok = r.ok && String(j.success) !== 'false';
        if (ok) lastSent = Date.now();
        return { ok, reason: ok ? '' : 'refused' };
      } catch (e) {
        return { ok: false, reason: 'network' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
  window.site = { message };

  if (noteForm) {
    const text = noteForm.querySelector('#msg-text');
    const email = noteForm.querySelector('#msg-email');
    const trap = noteForm.querySelector('[name="botcheck"]');
    const button = noteForm.querySelector('button[type="submit"]');
    const status = document.getElementById('msg-status');
    const loaded = Date.now();
    const live = message.live();
    noteForm.classList.toggle('is-relayed', live);
    button.textContent = live ? 'send message' : 'open in your mail app';

    const errorOf = field => document.getElementById(`${field.id}-error`);
    const flag = (field, why) => {
      field.setAttribute('aria-invalid', 'true');
      errorOf(field).textContent = why;
    };
    const clear = field => {
      field.removeAttribute('aria-invalid');
      errorOf(field).textContent = '';
    };
    const say = (...parts) => status.replaceChildren(...parts);
    const byMail = (label, body, from) => {
      const a = document.createElement('a');
      a.href = message.mailto(body, from);
      a.textContent = label;
      return a;
    };
    for (const f of [text, email]) f.addEventListener('input', () => clear(f));

    noteForm.addEventListener('submit', async e => {
      e.preventDefault();
      const body = text.value.trim(), from = email.value.trim();
      let first = null;
      if (!body) { flag(text, 'write a message first.'); first = text; }
      if (live && !message.valid(from)) {
        flag(email, from ? 'that does not look like an email address.' : 'add an email so i can reply.');
        first = first || email;
      }
      if (first) { first.focus(); return; }

      if (!live) {
        message.open(message.mailto(body));
        say('your mail app should open with the note ready to send. nothing opened? ', byMail(`email ${TO}`, body), '.');
        return;
      }
      // a field no person can see was filled in, or the form came back faster than anyone types
      if (trap.value || Date.now() - loaded < 2500) {
        noteForm.reset();
        say('sent. thank you, i will write back.');
        return;
      }
      button.disabled = true;
      say('sending…');
      const r = await message.send({ email: from, message: body, via: 'contact form' });
      button.disabled = false;
      if (r.ok) {
        noteForm.reset();
        say('sent. thank you, i will write back.');
      } else if (r.reason === 'too-soon') {
        say('one at a time. give it a few seconds, then send again.');
      } else {
        say('that did not go through. your note is still here: try again, or ', byMail('email it instead', body, from), '.');
      }
    });
  }

  // ---------------------------------------------------------------- the pond's small controls

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
