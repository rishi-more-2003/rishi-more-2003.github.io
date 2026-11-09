// koi pond: the animated canvas behind the terminal. exposes window.pond for terminal.js.
// the look leans on sekiro: vermilion and ivory koi with long fins, maple leaves, mist, lanterns,
// fireflies, and a moon on the water that matches tonight's real phase.
(() => {
  const cv = document.getElementById('pond');
  if (!cv || !cv.getContext) return;
  const ctx = cv.getContext('2d');
  const MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.35 : 1;
  const hint = document.getElementById('water-hint');
  if (hint && matchMedia('(pointer: coarse)').matches) hint.textContent = 'tap the water to feed the koi';

  const rand = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const angDiff = (a, b) => {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  };

  // soft glows are pre-rendered sprites stretched into place; ctx.shadowBlur halved the frame rate
  function sprite(rgb, alpha) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, `rgba(${rgb}, ${alpha})`);
    grad.addColorStop(0.45, `rgba(${rgb}, ${alpha * 0.4})`);
    grad.addColorStop(1, `rgba(${rgb}, 0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return c;
  }

  // fins fade toward their tips. they're drawn in unit space, so one gradient per variety fits every fin
  function finGradient(rgb, a) {
    const g = ctx.createLinearGradient(0, 0, 1, 0);
    g.addColorStop(0, `rgba(${rgb}, ${a})`);
    g.addColorStop(0.6, `rgba(${rgb}, ${a * 0.55})`);
    g.addColorStop(1, `rgba(${rgb}, ${a * 0.12})`);
    return g;
  }

  // a maple leaf, five pointed lobes around a stem, built once and stamped everywhere
  const MAPLE = (() => {
    const p = new Path2D();
    const up = -Math.PI / 2;
    const tips = [[up - 2.05, 0.5], [up - 1, 0.82], [up, 1], [up + 1, 0.82], [up + 2.05, 0.5]];
    const at = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
    p.moveTo(0, 0.2);
    tips.forEach(([a, r], i) => {
      p.lineTo(...at(a - 0.3, r * 0.6));
      p.lineTo(...at(a, r));
      p.lineTo(...at(a + 0.3, r * 0.6));
      if (i < tips.length - 1) p.lineTo(...at((a + tips[i + 1][0]) / 2, 0.28));
    });
    p.closePath();
    return p;
  })();

  const INK = '#15100d';
  const CRIMSON = '#d23d27';
  const VARIETIES = {
    red:    { body: '#d8432c', edge: 'rgba(36, 8, 4, 0.45)', shine: 'rgba(255, 170, 130, 0.2)', gloss: 'rgba(255, 196, 168, 0.22)', fin: finGradient('226, 92, 64', 0.5), ray: 'rgba(255, 190, 162, 0.3)', patch: '#efe4d2', glow: sprite('230, 70, 40', 0.42) },
    kohaku: { body: '#ece2d0', edge: 'rgba(28, 20, 14, 0.4)', shine: 'rgba(255, 255, 250, 0.22)', gloss: 'rgba(255, 255, 255, 0.3)', fin: finGradient('238, 228, 212', 0.38), ray: 'rgba(255, 250, 240, 0.34)', patch: CRIMSON, glow: sprite('230, 190, 160', 0.2) },
    gold:   { body: '#d9a440', edge: 'rgba(48, 28, 6, 0.45)', shine: 'rgba(255, 228, 160, 0.24)', gloss: 'rgba(255, 240, 200, 0.3)', fin: finGradient('232, 182, 92', 0.5), ray: 'rgba(255, 225, 160, 0.36)', patch: '#efe4d2', glow: sprite('230, 170, 60', 0.6) },
  };
  // mostly vermilion, a few kohaku, one showa inked in black, one tancho with a red crown
  const LINEUP = ['red', 'kohaku', 'showa', 'red', 'tancho', 'red', 'kohaku', 'red'];
  const LEAVES = ['#b3261e', '#c8321f', '#d9472b', '#9e2a1a', '#c98a2e'];
  const FOOD_GLOW = sprite('235, 185, 100', 0.9);
  const MIST = sprite('205, 212, 216', 1);
  const MOON_GLOW = sprite('236, 226, 205', 0.5);
  const FIREFLY = sprite('240, 214, 140', 0.9);
  const LANTERN_GLOW = sprite('255, 176, 96', 0.6);
  const SEGS = 13;
  const GOLD_AT = 24;

  // tonight's moon: 0 is new, 0.5 is full, counted from the new moon of 2000-01-06 18:14 utc
  const SYNODIC = 29.530588853;
  const PHASE = ((((Date.now() - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % SYNODIC) + SYNODIC) % SYNODIC / SYNODIC;
  const LIT = (1 - Math.cos(2 * Math.PI * PHASE)) / 2;

  // steps down when frames run long: 0 full, 1 dpr 1, 2 no glow, 3 fewer koi and a more opaque window
  let quality = 0, dprCap = 1.5, glowOn = true;
  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, dprCap);
    W = innerWidth;
    H = innerHeight;
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resize();
  let resizeQueued = false;
  addEventListener('resize', () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => { resizeQueued = false; resize(); });
  });

  function makeKoi(o = {}) {
    const kind = o.kind || 'red';
    const v = VARIETIES[kind === 'tancho' ? 'kohaku' : kind === 'showa' ? 'red' : kind];
    const depth = o.depth ?? rand(0.05, 1);
    const scale = lerp(1.25, 0.72, depth) * (o.big ? 1.6 : 1) * (W < 600 ? 0.72 : 1);
    const angle = o.angle ?? rand(0, Math.PI * 2);
    const x = o.x ?? rand(0.15, 0.85) * W;
    const y = o.y ?? rand(0.15, 0.85) * H;
    const segLen = 8 * scale;
    const spine = Array.from({ length: SEGS }, (_, i) => ({ x: x - Math.cos(angle) * segLen * i, y: y - Math.sin(angle) * segLen * i }));
    // each marking is a few overlapping blobs, so the edges look organic instead of oval
    const patches = [];
    const add = (n, color) => {
      for (let j = 0; j < n; j++) {
        const rx = rand(6, 11), ry = rand(5, 8);
        const blobs = [{ dx: 0, dy: 0, rx, ry }];
        for (let q = 0; q < 2; q++) blobs.push({ dx: rand(-0.8, 0.8) * rx, dy: rand(-0.5, 0.5) * ry, rx: rx * rand(0.5, 0.75), ry: ry * rand(0.5, 0.75) });
        patches.push({ i: 1 + Math.floor(Math.random() * (SEGS - 5)), off: rand(-0.5, 0.5), rot: rand(-0.4, 0.4), blobs, color });
      }
    };
    if (kind === 'kohaku') add(2 + Math.floor(Math.random() * 2), v.patch);
    else if (kind === 'red' && Math.random() < 0.6) add(1 + Math.floor(Math.random() * 2), v.patch);
    else if (kind === 'showa') { add(2, INK); add(1, v.patch); }
    return {
      x, y, angle, depth, scale, segLen, spine, patches, v,
      cap: kind === 'tancho', gold: kind === 'gold',
      base: o.big ? rand(0.45, 0.55) : rand(0.7, 1), speed: 0, boost: 0, gulp: 0,
      wander: angle, wanderT: rand(1, 4), phase: rand(0, 10), fin: rand(0, 10),
      alpha: kind === 'gold' ? 0 : 1,
    };
  }

  const koi = Array.from({ length: W < 600 ? 5 : 8 }, (_, i) => makeKoi({ kind: LINEUP[i] }));
  const sortKoi = () => koi.sort((a, b) => b.depth - a.depth);
  sortKoi();

  const pads = Array.from({ length: W < 600 ? 2 : 4 }, (_, i) => ({
    x: rand(0.06, 0.94) * W, y: rand(0.08, 0.92) * H, r: rand(26, 46), rot: rand(0, 6.28),
    spin: rand(-0.05, 0.05), notch: rand(0.28, 0.42), vx: rand(-3, 3), vy: rand(-2, 2), lotus: i === 0,
  }));
  const leaf = anywhere => ({
    x: anywhere ? rand(0, W) : -30, y: rand(0, H), vx: rand(5, 12), vy: rand(-2.5, 2.5),
    rot: rand(0, 6.28), spin: rand(-0.4, 0.4), s: rand(6, 10), wob: rand(0, 6.28),
    color: pick(LEAVES), sakura: Math.random() < 0.25,
  });
  const leaves = Array.from({ length: W < 600 ? 6 : 12 }, () => leaf(true));
  const mists = Array.from({ length: W < 600 ? 3 : 5 }, () => ({
    x: rand(0, W), y: rand(0, H), r: rand(240, 460),
    vx: rand(3, 8) * (Math.random() < 0.5 ? -1 : 1), vy: rand(-2, 2), a: rand(0.035, 0.065),
  }));
  const fireflies = Array.from({ length: W < 600 ? 8 : 16 }, () => ({
    x: rand(0, W), y: rand(0, H), a: rand(0, 6.28), sp: rand(8, 18), turn: 0, ph: rand(0, 6.28), rate: rand(0.6, 1.4),
  }));
  const motes = Array.from({ length: 50 }, () => ({
    x: Math.random(), y: Math.random(), z: Math.random(), vx: rand(-0.003, 0.003), vy: rand(-0.006, -0.0015),
  }));
  const lanterns = [];
  const food = [];
  const ripples = [];
  const bubbles = [];
  let fed = 0, eaten = 0, goldSpawned = false, goldPending = false, raining = false, rainAcc = 0, idleBubble = 2, moonT = 0;
  let gatherUntil = 0, gatherX = 0, gatherY = 0, scatterUntil = 0;
  const cursor = { x: 0, y: 0, t: 0, speed: 0, over: false, rx: -1e4, ry: -1e4, rt: 0 };

  // sound is opt-in from the terminal: koto-ish plucks when koi eat, a temple bell for the big moments
  const SCALE = [293.66, 311.13, 392, 440, 523.25, 587.33, 622.25, 783.99]; // miyako-bushi on d
  let audio = null, soundOn = false, lastPluck = 0;

  function ensureAudio() {
    if (!audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audio = new AC();
    }
    if (audio.state === 'suspended') audio.resume();
    return audio;
  }

  function pluck(freq, gain = 0.08) {
    if (!soundOn || !audio) return;
    const t = audio.currentTime;
    if (t - lastPluck < 0.09) return;
    lastPluck = t;
    const out = audio.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    const lp = audio.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3600, t);
    lp.frequency.exponentialRampToValueAtTime(600, t + 0.6);
    out.connect(lp).connect(audio.destination);
    for (const [mult, type, level] of [[1, 'triangle', 1], [2.01, 'sine', 0.3], [3.02, 'sine', 0.12]]) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type;
      o.frequency.value = freq * mult;
      g.gain.value = level;
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 1.9);
    }
  }

  function bell(f = 98) {
    if (!soundOn || !audio) return;
    const t = audio.currentTime;
    const out = audio.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 5.5);
    out.connect(audio.destination);
    for (const [mult, level] of [[1, 1], [2.76, 0.4], [5.4, 0.18], [8.9, 0.08]]) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine';
      o.frequency.value = f * mult;
      g.gain.value = level;
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 5.6);
    }
  }

  // a random spot the terminal isn't covering, so you can watch what happens there
  function openWater() {
    const r = document.getElementById('term')?.getBoundingClientRect();
    for (let i = 0; i < 16; i++) {
      const x = rand(0.08, 0.92) * W, y = rand(0.1, 0.9) * H;
      if (!r || x < r.left - 40 || x > r.right + 40 || y < r.top - 40 || y > r.bottom + 40) return [x, y];
    }
    return [rand(0.1, 0.9) * W, rand(0.04, 0.12) * H];
  }

  function feed(x, y) {
    if (x == null) [x, y] = openWater();
    fed++;
    const n = 6 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), r = rand(2, 26);
      food.push({
        x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
        vx: Math.cos(a) * rand(1, 6), vy: Math.sin(a) * rand(1, 6),
        age: 0, life: rand(10, 16), size: rand(1.8, 2.8),
      });
    }
    for (let k = 0; k < 3; k++) ripples.push({ x, y, t: -k * 0.16, dur: 1.6, max: 70 + k * 18, w: 1.2 });
    if (hint) hint.classList.add('gone');
  }
  cv.addEventListener('pointerdown', e => feed(e.clientX, e.clientY));

  // the cursor trails ripples through the water; koi drift toward a still one and bolt from a fast one
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const now = performance.now(), dt = (now - cursor.t) / 1000;
    if (cursor.t && dt > 0) cursor.speed = Math.hypot(e.clientX - cursor.x, e.clientY - cursor.y) / dt;
    cursor.x = e.clientX;
    cursor.y = e.clientY;
    cursor.t = now;
    cursor.over = e.target === cv;
    if (cursor.over && now - cursor.rt > 60 && Math.hypot(cursor.x - cursor.rx, cursor.y - cursor.ry) > 14) {
      cursor.rx = cursor.x;
      cursor.ry = cursor.y;
      cursor.rt = now;
      ripples.push({ x: cursor.x, y: cursor.y, t: 0, dur: 0.9, max: 12, w: 0.8 });
    }
  }, { passive: true });
  document.addEventListener('mouseleave', () => { cursor.over = false; });

  function addLantern(x, y) {
    if (x == null) [x, y] = openWater();
    if (lanterns.length >= 10) lanterns.shift();
    lanterns.push({ x, y, vx: rand(2, 6), vy: rand(-1.5, 1.5), rot: rand(-0.3, 0.3), ph: rand(0, 6.28), born: 0 });
  }
  addLantern();
  addLantern();

  function bubbleFrom(k, count) {
    const d = k.segLen * 1.6;
    for (let i = 0; i < count; i++) {
      const a = k.angle + rand(-0.5, 0.5);
      bubbles.push({
        x: k.x + Math.cos(k.angle) * d, y: k.y + Math.sin(k.angle) * d,
        vx: Math.cos(a) * rand(4, 10), vy: Math.sin(a) * rand(4, 10),
        r: rand(1.3, 2.4) * (W < 600 ? 0.8 : 1), t: -i * 0.12, dur: rand(0.8, 1.2),
      });
    }
  }

  // the easter egg: a great carp, much bigger and in no hurry
  function spawnGold() {
    goldSpawned = true;
    const spots = [
      [-80, rand(0.25, 0.75) * H, 0], [W + 80, rand(0.25, 0.75) * H, Math.PI],
      [rand(0.25, 0.75) * W, -80, Math.PI / 2], [rand(0.25, 0.75) * W, H + 80, -Math.PI / 2],
    ];
    const [x, y, angle] = pick(spots);
    koi.push(makeKoi({ kind: 'gold', x, y, angle, depth: 0.02, big: true }));
    sortKoi();
    bell();
    dispatchEvent(new CustomEvent('pond:golden'));
  }

  // koi gather in open water near the terminal, as if around a shrine
  function gather(seconds) {
    const r = document.getElementById('term')?.getBoundingClientRect();
    gatherX = W / 2;
    gatherY = !r ? H * 0.75 : r.bottom + 90 < H ? r.bottom + 70 : Math.max(60, r.top - 70);
    gatherUntil = performance.now() + seconds * 1000;
  }

  function update(dt) {
    const now = performance.now();
    moonT += dt * MOTION;
    for (const m of motes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
      if (m.x < -0.02) m.x = 1.02; else if (m.x > 1.02) m.x = -0.02;
    }
    for (const p of pads) {
      p.rot += p.spin * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < -p.r) p.x = W + p.r; else if (p.x > W + p.r) p.x = -p.r;
      if (p.y < -p.r) p.y = H + p.r; else if (p.y > H + p.r) p.y = -p.r;
    }
    for (const l of leaves) {
      l.wob += dt;
      l.rot += l.spin * dt * MOTION;
      l.x += l.vx * dt * MOTION;
      l.y += (l.vy + Math.sin(l.wob) * 3) * dt * MOTION;
      if (l.x > W + 30) Object.assign(l, leaf(false));
      if (l.y < -30) l.y = H + 30; else if (l.y > H + 30) l.y = -30;
    }
    for (const m of mists) {
      m.x += m.vx * dt * MOTION;
      m.y += m.vy * dt * MOTION;
      if (m.x < -m.r) m.x = W + m.r; else if (m.x > W + m.r) m.x = -m.r;
      if (m.y < -m.r) m.y = H + m.r; else if (m.y > H + m.r) m.y = -m.r;
    }
    for (const f of fireflies) {
      f.turn = clamp(f.turn + rand(-1, 1) * dt, -0.8, 0.8);
      f.a += f.turn * dt;
      f.x += Math.cos(f.a) * f.sp * dt * MOTION;
      f.y += Math.sin(f.a) * f.sp * dt * MOTION;
      f.ph += dt * f.rate;
      if (f.x < -20) f.x = W + 20; else if (f.x > W + 20) f.x = -20;
      if (f.y < -20) f.y = H + 20; else if (f.y > H + 20) f.y = -20;
    }
    for (let i = lanterns.length - 1; i >= 0; i--) {
      const l = lanterns[i];
      l.born = Math.min(1, l.born + dt * 0.8);
      l.ph += dt;
      l.x += l.vx * dt * MOTION;
      l.y += (l.vy + Math.sin(moonT * 0.5 + l.ph) * 1.5) * dt * MOTION;
      if (l.x > W + 60) {
        if (lanterns.length > 2) lanterns.splice(i, 1);
        else l.x = -60;
      }
      if (l.y < -60) l.y = H + 60; else if (l.y > H + 60) l.y = -60;
    }
    for (let i = food.length - 1; i >= 0; i--) {
      const f = food[i];
      f.age += dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      const drag = Math.exp(-dt * 1.5);
      f.vx *= drag;
      f.vy *= drag;
      if (f.age > f.life) food.splice(i, 1);
    }
    if (raining) {
      rainAcc += dt * 14;
      for (; rainAcc >= 1; rainAcc--) ripples.push({ x: rand(0, W), y: rand(0, H), t: 0, dur: rand(0.7, 1.1), max: rand(8, 20), w: 0.8 });
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].t += dt;
      if (ripples[i].t > ripples[i].dur) ripples.splice(i, 1);
    }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.t += dt;
      if (b.t > 0) { b.x += b.vx * dt; b.y += b.vy * dt; }
      if (b.t > b.dur) bubbles.splice(i, 1);
    }
    idleBubble -= dt;
    if (idleBubble <= 0 && koi.length) {
      idleBubble = rand(2.5, 5);
      bubbleFrom(pick(koi), 1);
    }

    for (const k of koi) {
      if (k.alpha < 1) k.alpha = Math.min(1, k.alpha + dt * 0.4);
      k.gulp = Math.max(0, k.gulp - dt * 3);

      let turn = 1.1, spd = k.base;
      k.wanderT -= dt;
      if (k.wanderT <= 0) { k.wander = k.angle + rand(-1.2, 1.2); k.wanderT = rand(2, 5); }
      let desired = k.wander;

      let target = null, best = 620;
      for (const f of food) {
        const d = Math.hypot(f.x - k.x, f.y - k.y);
        if (d < best) { best = d; target = f; }
      }
      if (now < scatterUntil) {
        desired = Math.atan2(k.y - H / 2, k.x - W / 2);
        turn = 5;
        spd = k.base * 2.5;
      } else if (target) {
        desired = Math.atan2(target.y - k.y, target.x - k.x);
        turn = 4;
        spd = k.base * 2.8 * clamp(best / 110, 0.4, 1); // ease off on arrival so they don't orbit the pellet
        if (best < 10 * k.scale + 5) {
          food.splice(food.indexOf(target), 1);
          eaten++;
          k.boost = 1;
          k.gulp = 1;
          bubbleFrom(k, 1);
          pluck(pick(SCALE));
          ripples.push({ x: target.x, y: target.y, t: 0, dur: 0.6, max: 16, w: 1 });
          if (!goldSpawned && eaten >= GOLD_AT) goldPending = true;
        }
      } else if (now < gatherUntil) {
        if (Math.hypot(gatherX - k.x, gatherY - k.y) > 60) {
          desired = Math.atan2(gatherY - k.y, gatherX - k.x);
          turn = 2;
          spd = k.base * 1.4;
        }
      } else if (cursor.over) {
        const dx = cursor.x - k.x, dy = cursor.y - k.y, d = Math.hypot(dx, dy), idle = (now - cursor.t) / 1000;
        if (idle < 0.1 && cursor.speed > 900 && d < 150) {
          desired = Math.atan2(-dy, -dx);
          turn = 5;
          k.boost = Math.max(k.boost, 0.8);
        } else if (idle > 0.8 && idle < 12 && d > 70 && d < 340) {
          desired = Math.atan2(dy, dx);
          turn = 1.6;
          spd = k.base * 0.9;
        }
      }

      const m = 110;
      let ex = 0, ey = 0;
      if (k.x < m) ex = (m - k.x) / m; else if (k.x > W - m) ex = -(k.x - (W - m)) / m;
      if (k.y < m) ey = (m - k.y) / m; else if (k.y > H - m) ey = -(k.y - (H - m)) / m;
      if (ex || ey) {
        const s = clamp(Math.hypot(ex, ey), 0, 1);
        desired += angDiff(desired, Math.atan2(ey, ex)) * s;
        turn = Math.max(turn, 1.1 + 2 * s);
      }
      for (const o of koi) {
        if (o === k) continue;
        const dx = k.x - o.x, dy = k.y - o.y, d = Math.hypot(dx, dy), r = 56 * k.scale;
        if (d > 0 && d < r && Math.abs(k.depth - o.depth) < 0.35) desired += angDiff(desired, Math.atan2(dy, dx)) * 0.25 * (1 - d / r);
      }

      k.angle += clamp(angDiff(k.angle, desired), -turn * dt, turn * dt);
      k.boost = Math.max(0, k.boost - dt * 0.8);
      const goal = (spd + k.boost * 0.9) * 50 * k.scale * MOTION;
      k.speed = lerp(k.speed, goal, 1 - Math.exp(-dt * 4));
      k.phase += dt * (3 + k.speed * 0.06);
      k.fin += dt * (2 + k.speed * 0.05);
      const heading = k.angle + Math.sin(k.phase) * 0.06;
      k.x += Math.cos(heading) * k.speed * dt;
      k.y += Math.sin(heading) * k.speed * dt;

      const sp = k.spine;
      sp[0].x = k.x;
      sp[0].y = k.y;
      for (let i = 1; i < sp.length; i++) {
        const a = sp[i - 1], b = sp[i];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
        b.x = a.x + (dx / d) * k.segLen;
        b.y = a.y + (dy / d) * k.segLen;
      }
    }
    if (goldPending) { goldPending = false; spawnGold(); }
  }

  // round head, widest just behind it, a long taper into the tail
  const bodyW = u => u < 0.28
    ? lerp(0.7, 1, Math.sin((u / 0.28) * Math.PI / 2))
    : lerp(1, 0.14, Math.pow((u - 0.28) / 0.72, 1.35));

  function bodyPath(c, pts, n, ws, s) {
    const h = pts[0], last = pts[n - 1];
    const P = [[h.x + h.tx * h.w * ws * 1.1, h.y + h.ty * h.w * ws * 1.1]];
    for (let i = 0; i < n; i++) P.push([pts[i].x + pts[i].nx * pts[i].w * ws, pts[i].y + pts[i].ny * pts[i].w * ws]);
    P.push([last.x - last.tx * 2.5 * s, last.y - last.ty * 2.5 * s]);
    for (let i = n - 1; i >= 0; i--) P.push([pts[i].x - pts[i].nx * pts[i].w * ws, pts[i].y - pts[i].ny * pts[i].w * ws]);
    c.beginPath();
    c.moveTo((P[P.length - 1][0] + P[0][0]) / 2, (P[P.length - 1][1] + P[0][1]) / 2);
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = P[(i + 1) % P.length];
      c.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
    c.closePath();
  }

  // a long see-through fin with rays; bend swings the tip so it trails like silk
  function fin(c, x, y, ang, len, wid, v, bend) {
    const w = wid / len, b = bend / len;
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    c.scale(len, len);
    c.beginPath();
    c.moveTo(0, 0);
    c.bezierCurveTo(0.3, -w, 0.85, -w * 0.8 + b, 1, b);
    c.bezierCurveTo(0.9, w * 0.7 + b, 0.3, w * 0.9, 0, 0);
    c.fillStyle = v.fin;
    c.fill();
    c.strokeStyle = v.ray;
    c.lineWidth = 0.6 / len;
    c.beginPath();
    for (const f of [-0.5, -0.17, 0.17, 0.5]) {
      c.moveTo(0.08, 0);
      c.quadraticCurveTo(0.5, w * f, 0.92, w * f * 0.7 + b);
    }
    c.stroke();
    c.restore();
  }

  // butterfly tail: two long lobes that ripple out of step and fade toward the tips
  function tail(c, k, pts, n, s) {
    const tp = pts[n - 1], tl = 46 * s;
    const ang = Math.atan2(-tp.ty, -tp.tx) + Math.sin(k.phase - n * 0.5 + 0.8) * 0.38;
    const f = Math.sin(k.phase * 1.1) * 0.14, up = 1 + f, dn = 1 - f, b0 = -2 * s / tl;
    c.save();
    c.translate(tp.x, tp.y);
    c.rotate(ang);
    c.scale(tl, tl);
    c.beginPath();
    c.moveTo(b0, 0);
    c.bezierCurveTo(0.3, -0.1 * up, 0.62, -0.56 * up, 1, -0.5 * up);
    c.quadraticCurveTo(1.1, -0.38 * up, 0.9, -0.24 * up);
    c.quadraticCurveTo(0.78, -0.12 * up, 0.84, -0.03);
    c.quadraticCurveTo(0.72, 0, 0.84, 0.03);
    c.quadraticCurveTo(0.78, 0.12 * dn, 0.9, 0.24 * dn);
    c.quadraticCurveTo(1.1, 0.38 * dn, 1, 0.5 * dn);
    c.bezierCurveTo(0.62, 0.56 * dn, 0.3, 0.1 * dn, b0, 0);
    c.fillStyle = k.v.fin;
    c.fill();
    c.strokeStyle = k.v.ray;
    c.lineWidth = 0.6 / tl;
    c.beginPath();
    for (const r of [-0.46, -0.3, -0.14, 0.14, 0.3, 0.46]) {
      const m = r < 0 ? up : dn;
      c.moveTo(0, 0);
      c.quadraticCurveTo(0.5, r * 0.6 * m, 0.92, r * m);
    }
    c.stroke();
    c.restore();
  }

  function face(c, k, pts, s) {
    const h = pts[0], e = pts[1], fx = h.tx, fy = h.ty, a = Math.atan2(fy, fx);
    for (const sg of [1, -1]) {
      const ex = e.x + fx * 2.2 * s + e.nx * e.w * 0.6 * sg;
      const ey = e.y + fy * 2.2 * s + e.ny * e.w * 0.6 * sg;
      c.fillStyle = '#120a08';
      c.beginPath(); c.arc(ex, ey, 1.6 * s, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255, 240, 220, 0.85)';
      c.beginPath(); c.arc(ex - 0.45 * s, ey - 0.5 * s, 0.5 * s, 0, Math.PI * 2); c.fill();
    }
    if (k.gulp > 0) {
      c.fillStyle = 'rgba(40, 10, 6, 0.85)';
      c.beginPath(); c.arc(h.x + fx * h.w, h.y + fy * h.w, (0.8 + k.gulp) * s, 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = 'rgba(240, 220, 200, 0.35)';
    c.lineWidth = 0.6 * s;
    const wig = Math.sin(k.phase * 0.9) * 0.2;
    for (const sg of [1, -1]) {
      const bx = h.x + fx * h.w * 0.9 + h.nx * h.w * 0.3 * sg, by = h.y + fy * h.w * 0.9 + h.ny * h.w * 0.3 * sg;
      const wa = a + sg * (0.8 + wig);
      c.beginPath();
      c.moveTo(bx, by);
      c.quadraticCurveTo(bx + Math.cos(wa) * 3 * s, by + Math.sin(wa) * 3 * s, bx + Math.cos(wa + sg * 0.7) * 6 * s, by + Math.sin(wa + sg * 0.7) * 6 * s);
      c.stroke();
    }
  }

  function drawKoi(k, c) {
    const sp = k.spine, n = sp.length, s = k.scale, v = k.v, maxW = 14 * s;
    const swayAmp = 3.2 * s * (1 + k.boost * 0.6); // a happy wiggle after eating
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = sp[Math.max(0, i - 1)], b = sp[Math.min(n - 1, i + 1)];
      let tx = a.x - b.x, ty = a.y - b.y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const u = i / (n - 1), sway = Math.sin(k.phase - i * 0.5) * swayAmp * u * u;
      pts.push({ x: sp[i].x - ty * sway, y: sp[i].y + tx * sway, tx, ty, nx: -ty, ny: tx, w: maxW * bodyW(u) });
    }

    c.save();
    // depth reads through size and dimness alone; everything stays sharp
    c.globalAlpha = k.alpha * lerp(1, 0.55, k.depth);

    if (glowOn) {
      const mid = pts[5], a = Math.atan2(pts[0].y - pts[9].y, pts[0].x - pts[9].x);
      const len = k.segLen * n * 2, wid = maxW * 4.5;
      c.save();
      c.translate(mid.x, mid.y);
      c.rotate(a);
      c.drawImage(v.glow, -len / 2, -wid / 2, len, wid);
      c.restore();
    }

    tail(c, k, pts, n, s);
    const pf = pts[3], back = Math.atan2(-pf.ty, -pf.tx), flap = Math.sin(k.fin * 1.8) * 0.3;
    fin(c, pf.x + pf.nx * pf.w * 0.7, pf.y + pf.ny * pf.w * 0.7, back - 1.1 - flap, 24 * s, 8 * s, v, Math.sin(k.fin * 1.6) * 3 * s);
    fin(c, pf.x - pf.nx * pf.w * 0.7, pf.y - pf.ny * pf.w * 0.7, back + 1.1 + flap, 24 * s, 8 * s, v, Math.sin(k.fin * 1.6 + 1) * 3 * s);
    const vf = pts[7], vback = Math.atan2(-vf.ty, -vf.tx);
    fin(c, vf.x + vf.nx * vf.w * 0.7, vf.y + vf.ny * vf.w * 0.7, vback - 0.75 + flap * 0.5, 12 * s, 4.5 * s, v, 0);
    fin(c, vf.x - vf.nx * vf.w * 0.7, vf.y - vf.ny * vf.w * 0.7, vback + 0.75 - flap * 0.5, 12 * s, 4.5 * s, v, 0);

    // body, then a fine ink edge like a brush painting
    bodyPath(c, pts, n, 1, s);
    c.fillStyle = v.body;
    c.fill();
    c.strokeStyle = v.edge;
    c.lineWidth = 0.9 * s;
    c.stroke();

    if (k.patches.length || k.cap) {
      c.save();
      c.clip();
      for (const pa of k.patches) {
        const p = pts[pa.i];
        const cx = p.x + p.nx * p.w * pa.off, cy = p.y + p.ny * p.w * pa.off;
        const ang = Math.atan2(p.ty, p.tx) + pa.rot;
        c.fillStyle = pa.color;
        c.beginPath();
        for (const b of pa.blobs) {
          const bx = cx + (p.tx * b.dx + p.nx * b.dy) * s, by = cy + (p.ty * b.dx + p.ny * b.dy) * s;
          c.moveTo(bx + Math.cos(ang) * b.rx * s, by + Math.sin(ang) * b.rx * s);
          c.ellipse(bx, by, b.rx * s, b.ry * s, ang, 0, Math.PI * 2);
        }
        c.fill();
      }
      if (k.cap) {
        const p = pts[1];
        c.fillStyle = CRIMSON;
        c.beginPath();
        c.arc(p.x - p.tx * 1.5 * s, p.y - p.ty * 1.5 * s, p.w * 0.6, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }

    // two soft passes of light down the back make the body read as round and wet
    bodyPath(c, pts, n - 3, 0.62, s);
    c.fillStyle = v.shine;
    c.fill();
    bodyPath(c, pts, n - 6, 0.3, s);
    c.fillStyle = v.gloss;
    c.fill();
    const hg = pts[1];
    c.fillStyle = 'rgba(255, 255, 255, 0.16)';
    c.beginPath();
    c.ellipse(hg.x + hg.tx * 1.5 * s, hg.y + hg.ty * 1.5 * s, 3.2 * s, 1.6 * s, Math.atan2(hg.ty, hg.tx), 0, Math.PI * 2);
    c.fill();

    // dorsal fin, seen from above as a thin waving ridge
    c.beginPath();
    for (let i = 2; i < 8; i++) {
      const p = pts[i], wave = Math.sin(k.phase * 1.5 - i * 0.4) * 1.2 * s;
      if (i === 2) c.moveTo(p.x + p.nx * wave, p.y + p.ny * wave);
      else c.lineTo(p.x + p.nx * wave, p.y + p.ny * wave);
    }
    c.strokeStyle = v.ray;
    c.lineWidth = 1.6 * s;
    c.lineCap = 'round';
    c.stroke();

    face(c, k, pts, s);
    c.restore();
  }

  function drawMotes() {
    ctx.fillStyle = 'rgb(226, 220, 205)';
    for (const m of motes) {
      const sz = 0.6 + m.z * 1.2;
      ctx.globalAlpha = 0.04 + m.z * 0.12;
      ctx.fillRect(m.x * W, m.y * H, sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  // the moon, broken into wobbling bands on the water and lit only as much as tonight's
  function drawMoon() {
    const x = W * 0.82, y = H * 0.17, r = Math.min(W, H) * 0.045 + 18;
    ctx.globalAlpha = 0.55 * (0.25 + 0.75 * LIT);
    ctx.drawImage(MOON_GLOW, x - r * 3.2, y - r * 2.2, r * 6.4, r * 4.4);
    ctx.strokeStyle = 'rgb(238, 228, 206)';
    ctx.lineCap = 'round';
    ctx.lineWidth = r * 0.07;
    const g = r * 0.06;
    for (let i = -6; i <= 6; i++) {
      const yy = y + i * r * 0.16;
      const half = Math.sqrt(Math.max(0, 1 - (i / 6.5) ** 2)) * r;
      const off = Math.sin(moonT * 1.2 + i * 0.85) * r * 0.08;
      ctx.globalAlpha = 0.05; // earthshine: the dark side still shows, faintly
      ctx.beginPath();
      ctx.moveTo(x - half + off, yy);
      ctx.lineTo(x + half + off, yy);
      ctx.stroke();
      let a = -half, b = half; // the lit span: right side while waxing, left side while waning
      if (PHASE < 0.5) a = half * (1 - 2 * LIT);
      else b = -half * (1 - 2 * LIT);
      if (b - a < 2) continue;
      const gp = (a + b) / 2 + Math.sin(moonT * 0.7 + i * 1.3) * (b - a) * 0.15;
      ctx.globalAlpha = 0.12 + 0.2 * (1 - Math.abs(i) / 7);
      ctx.beginPath();
      if (gp - g > a) { ctx.moveTo(x + a + off, yy); ctx.lineTo(x + gp - g + off, yy); }
      if (b > gp + g) { ctx.moveTo(x + gp + g + off, yy); ctx.lineTo(x + b + off, yy); }
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;
  }

  // a floating paper lantern seen from above: warm glow, wooden frame, paper ribs
  function drawLantern(l) {
    const flicker = 0.85 + Math.sin(l.ph * 7.3) * 0.06 + Math.sin(l.ph * 12.7) * 0.05;
    ctx.globalAlpha = 0.75 * flicker * l.born;
    ctx.drawImage(LANTERN_GLOW, l.x - 46, l.y - 46, 92, 92);
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.rotate(l.rot);
    ctx.globalAlpha = l.born;
    ctx.fillStyle = 'rgba(40, 18, 10, 0.9)';
    ctx.fillRect(-7.5, -7.5, 15, 15);
    ctx.fillStyle = `rgb(255, ${Math.round(196 + 24 * flicker)}, 140)`;
    ctx.fillRect(-5.5, -5.5, 11, 11);
    ctx.strokeStyle = 'rgba(120, 50, 20, 0.6)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-5.5, 0); ctx.lineTo(5.5, 0);
    ctx.moveTo(0, -5.5); ctx.lineTo(0, 5.5);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawBubbles() {
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgb(225, 230, 228)';
    ctx.fillStyle = 'rgb(240, 244, 242)';
    for (const b of bubbles) {
      if (b.t < 0) continue;
      const u = b.t / b.dur, r = b.r * (1 + u * 0.6);
      ctx.globalAlpha = 0.5 * (1 - u);
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(b.x - r * 0.35, b.y - r * 0.35, r * 0.25, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFood() {
    ctx.fillStyle = '#e9b864';
    for (const f of food) {
      const a = clamp(1 - (f.age - f.life * 0.6) / (f.life * 0.4), 0, 1) * clamp(f.age / 0.25, 0, 1);
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      if (glowOn) ctx.drawImage(FOOD_GLOW, f.x - 9, f.y - 9, 18, 18);
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawLotus(r) {
    const R = r * 0.4;
    ctx.save();
    ctx.translate(r * 0.12, -r * 0.08);
    ctx.fillStyle = 'rgba(232, 208, 206, 0.9)';
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.beginPath(); ctx.ellipse(0, -R * 0.5, R * 0.22, R * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(246, 240, 230, 0.95)';
    for (let i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath(); ctx.ellipse(0, -R * 0.3, R * 0.15, R * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#d9a440';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawPad(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.ellipse(5, 7, p.r, p.r * 0.97, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, p.r, p.notch, Math.PI * 2 - 0.04);
    ctx.closePath();
    ctx.fillStyle = '#0f1f17';
    ctx.fill();
    ctx.strokeStyle = 'rgba(201, 164, 92, 0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(150, 190, 150, 0.07)';
    for (let a = p.notch + 0.45; a < Math.PI * 2 - 0.3; a += 0.55) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * p.r * 0.88, Math.sin(a) * p.r * 0.88);
      ctx.stroke();
    }
    if (p.lotus) drawLotus(p.r);
    ctx.restore();
  }

  function drawLeaf(l) {
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.rotate(l.rot);
    if (l.sakura) {
      const s = l.s * 0.6;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.75);
      ctx.quadraticCurveTo(s * 0.3, -s * 1.15, s * 0.62, -s * 0.72);
      ctx.bezierCurveTo(s * 0.95, -s * 0.1, s * 0.4, s * 0.8, 0, s);
      ctx.bezierCurveTo(-s * 0.4, s * 0.8, -s * 0.95, -s * 0.1, -s * 0.62, -s * 0.72);
      ctx.quadraticCurveTo(-s * 0.3, -s * 1.15, 0, -s * 0.75);
      ctx.fillStyle = 'rgba(238, 196, 204, 0.85)';
      ctx.fill();
    } else {
      ctx.scale(l.s, l.s);
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = l.color;
      ctx.fill(MAPLE);
      ctx.strokeStyle = l.color;
      ctx.lineWidth = 0.09;
      ctx.beginPath();
      ctx.moveTo(0, 0.12);
      ctx.lineTo(0, 0.62);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRipples() {
    ctx.strokeStyle = 'rgb(232, 226, 210)';
    for (const r of ripples) {
      if (r.t < 0) continue;
      const u = r.t / r.dur, e = 1 - Math.pow(1 - u, 3);
      ctx.globalAlpha = 0.32 * (1 - u);
      ctx.lineWidth = r.w;
      ctx.beginPath();
      ctx.arc(r.x, r.y, e * r.max, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawMist() {
    for (const m of mists) {
      ctx.globalAlpha = m.a;
      ctx.drawImage(MIST, m.x - m.r, m.y - m.r * 0.55, m.r * 2, m.r * 1.1);
    }
    ctx.globalAlpha = 1;
  }

  // fireflies: mostly dark, with brief soft pulses
  function drawFireflies() {
    ctx.fillStyle = 'rgb(255, 244, 200)';
    for (const f of fireflies) {
      const b = Math.max(0, Math.sin(f.ph * 2.2)) ** 3;
      if (b < 0.02) continue;
      ctx.globalAlpha = b;
      ctx.drawImage(FIREFLY, f.x - 10, f.y - 10, 20, 20);
      ctx.fillRect(f.x - 0.8, f.y - 0.8, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawMotes();
    for (const k of koi) drawKoi(k, ctx); // sorted deepest first
    drawMoon();
    for (const l of lanterns) drawLantern(l);
    drawBubbles();
    drawFood();
    for (const p of pads) drawPad(p);
    for (const l of leaves) drawLeaf(l);
    drawRipples();
    drawMist();
    drawFireflies();
  }

  function applyQuality() {
    if (quality >= 1) dprCap = 1;
    if (quality >= 2) glowOn = false;
    if (quality >= 3) {
      document.documentElement.classList.add('lowfx');
      while (koi.length > 6) {
        const i = koi.findIndex(k => !k.gold);
        if (i < 0) break;
        koi.splice(i, 1);
      }
    }
    resize();
  }

  let last = performance.now(), slowMs = 0, slowN = 0, slowStart = last;
  function frame(now) {
    const ms = now - last;
    last = now;
    if (now > 3000 && ms < 100 && quality < 3) {
      slowMs += ms;
      slowN++;
      if (now - slowStart > 2000) {
        if (slowN > 20 && slowMs / slowN > 21) { quality++; applyQuality(); }
        slowMs = 0;
        slowN = 0;
        slowStart = now;
      }
    }
    update(Math.min(0.05, ms / 1000));
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.pond = {
    feed: () => feed(),
    stats: () => ({ koi: koi.length, fed, eaten, golden: goldSpawned }),
    rain: () => (raining = !raining),
    quality: () => quality,
    lantern: () => { addLantern(); pluck(SCALE[7], 0.06); },
    rest: () => { gather(6); bell(); },
    scatter: () => { scatterUntil = performance.now() + 1500; },
    bell: f => bell(f),
    moon: () => ({ phase: PHASE, lit: LIT }),
    sound: on => {
      soundOn = !!on;
      if (soundOn && ensureAudio()) pluck(SCALE[4]);
      return soundOn;
    },
    soundOn: () => soundOn,
  };
})();
