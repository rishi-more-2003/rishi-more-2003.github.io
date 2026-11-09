// koi pond: the animated canvas behind the terminal. exposes window.pond for terminal.js.
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
  const angDiff = (a, b) => {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  };

  // glow is a pre-rendered sprite stretched under each koi; ctx.shadowBlur halved the frame rate
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
  const RED = { body: '#ea442c', fin: 'rgba(238, 86, 60, 0.55)', glow: sprite('255, 70, 40', 0.55) };
  const GOLD = { body: '#f0b93a', fin: 'rgba(246, 196, 92, 0.55)', glow: sprite('255, 196, 70', 0.7) };
  const FOOD_GLOW = sprite('255, 190, 110', 0.9);
  const CREAM = 'rgba(245, 236, 222, 0.94)';
  const SEGS = 14;
  const GOLD_AT = 24;
  const DEEP_CUT = 0.55;   // koi deeper than this render into the low-res layer
  const DEEP_SCALE = 0.35; // drawing small and scaling up is a cheap blur (ctx.filter was the other big cost)

  const deep = document.createElement('canvas');
  const dctx = deep.getContext('2d');

  // steps down when frames run long: 0 full, 1 dpr 1, 2 no glow, 3 fewer koi and no glass blur
  let quality = 0, dprCap = 1.5, glowOn = true;
  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, dprCap);
    W = innerWidth;
    H = innerHeight;
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    deep.width = Math.max(1, Math.round(W * DEEP_SCALE));
    deep.height = Math.max(1, Math.round(H * DEEP_SCALE));
  }
  resize();
  let resizeQueued = false;
  addEventListener('resize', () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => { resizeQueued = false; resize(); });
  });

  function makeKoi(o = {}) {
    const depth = o.depth ?? rand(0.05, 1);
    const scale = lerp(1.25, 0.7, depth) * (o.big ? 1.18 : 1) * (W < 600 ? 0.72 : 1);
    const angle = o.angle ?? rand(0, Math.PI * 2);
    const x = o.x ?? rand(0.15, 0.85) * W;
    const y = o.y ?? rand(0.15, 0.85) * H;
    const segLen = 8.2 * scale;
    const spine = Array.from({ length: SEGS }, (_, i) => ({ x: x - Math.cos(angle) * segLen * i, y: y - Math.sin(angle) * segLen * i }));
    const patches = [];
    if (!o.gold && Math.random() < 0.75) {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let j = 0; j < n; j++) {
        patches.push({ i: 1 + Math.floor(Math.random() * 9), off: rand(-0.6, 0.6), rx: rand(7, 13), ry: rand(5, 10), rot: rand(0, Math.PI) });
      }
    }
    return {
      x, y, angle, depth, scale, segLen, spine, patches,
      pal: o.gold ? GOLD : RED, gold: !!o.gold,
      base: rand(0.7, 1), speed: 0, boost: 0,
      wander: angle, wanderT: rand(1, 4), phase: rand(0, 10), fin: rand(0, 10),
      alpha: o.gold ? 0 : 1,
    };
  }

  const koi = Array.from({ length: W < 600 ? 5 : 8 }, () => makeKoi());
  const sortKoi = () => koi.sort((a, b) => b.depth - a.depth);
  sortKoi();

  const pads = Array.from({ length: W < 600 ? 2 : 4 }, () => ({
    x: rand(0.06, 0.94) * W, y: rand(0.08, 0.92) * H, r: rand(24, 46), rot: rand(0, 6.28),
    spin: rand(-0.05, 0.05), notch: rand(0.28, 0.42), vx: rand(-3, 3), vy: rand(-2, 2),
  }));
  const motes = Array.from({ length: 50 }, () => ({
    x: Math.random(), y: Math.random(), z: Math.random(), vx: rand(-0.003, 0.003), vy: rand(-0.006, -0.0015),
  }));
  const food = [];
  const ripples = [];
  let fed = 0, eaten = 0, goldSpawned = false, goldPending = false, raining = false, rainAcc = 0;

  // a random spot the terminal isn't covering, so you can watch them eat
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

  function spawnGold() {
    goldSpawned = true;
    const spots = [
      [-50, rand(0.25, 0.75) * H, 0], [W + 50, rand(0.25, 0.75) * H, Math.PI],
      [rand(0.25, 0.75) * W, -50, Math.PI / 2], [rand(0.25, 0.75) * W, H + 50, -Math.PI / 2],
    ];
    const [x, y, angle] = spots[Math.floor(Math.random() * 4)];
    koi.push(makeKoi({ x, y, angle, depth: 0.02, gold: true, big: true }));
    sortKoi();
    dispatchEvent(new CustomEvent('pond:golden'));
  }

  function update(dt) {
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

    for (const k of koi) {
      if (k.alpha < 1) k.alpha = Math.min(1, k.alpha + dt * 0.6);
      let turn = 1.1, spd = k.base;
      k.wanderT -= dt;
      if (k.wanderT <= 0) { k.wander = k.angle + rand(-1.2, 1.2); k.wanderT = rand(2, 5); }
      let desired = k.wander;

      let target = null, best = 620;
      for (const f of food) {
        const d = Math.hypot(f.x - k.x, f.y - k.y);
        if (d < best) { best = d; target = f; }
      }
      if (target) {
        desired = Math.atan2(target.y - k.y, target.x - k.x);
        turn = 4;
        spd = k.base * 2.8 * clamp(best / 110, 0.4, 1); // ease off on arrival so they don't orbit the pellet
        if (best < 9 * k.scale + 5) {
          food.splice(food.indexOf(target), 1);
          eaten++;
          k.boost = 1;
          ripples.push({ x: target.x, y: target.y, t: 0, dur: 0.6, max: 16, w: 1 });
          if (!goldSpawned && eaten >= GOLD_AT) goldPending = true;
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

  const bodyW = u => u < 0.26
    ? lerp(0.62, 1, Math.sin((u / 0.26) * Math.PI / 2))
    : lerp(1, 0.12, Math.pow((u - 0.26) / 0.74, 1.25));

  function fin(c, x, y, ang, len, wid, color) {
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    c.beginPath();
    c.moveTo(0, 0);
    c.bezierCurveTo(len * 0.35, -wid, len * 0.95, -wid * 0.7, len, 0);
    c.bezierCurveTo(len * 0.95, wid * 0.7, len * 0.35, wid, 0, 0);
    c.fillStyle = color;
    c.fill();
    c.restore();
  }

  function drawKoi(k, c) {
    const sp = k.spine, n = sp.length, s = k.scale, maxW = 15 * s;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = sp[Math.max(0, i - 1)], b = sp[Math.min(n - 1, i + 1)];
      let tx = a.x - b.x, ty = a.y - b.y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const u = i / (n - 1), sway = Math.sin(k.phase - i * 0.55) * 3.2 * s * u * u;
      pts.push({ x: sp[i].x - ty * sway, y: sp[i].y + tx * sway, tx, ty, nx: -ty, ny: tx, w: maxW * bodyW(u) });
    }

    c.save();
    c.globalAlpha = k.alpha * lerp(1, 0.5, k.depth);

    if (glowOn) {
      const mid = pts[5], a = Math.atan2(pts[0].y - pts[9].y, pts[0].x - pts[9].x);
      const len = k.segLen * SEGS * 1.9, wid = maxW * 5;
      c.save();
      c.translate(mid.x, mid.y);
      c.rotate(a);
      c.drawImage(k.pal.glow, -len / 2, -wid / 2, len, wid);
      c.restore();
    }

    const pf = pts[3], back = Math.atan2(-pf.ty, -pf.tx), flap = Math.sin(k.fin * 2.2) * 0.28;
    fin(c, pf.x + pf.nx * pf.w * 0.75, pf.y + pf.ny * pf.w * 0.75, back - 0.95 - flap, 18 * s, 8 * s, k.pal.fin);
    fin(c, pf.x - pf.nx * pf.w * 0.75, pf.y - pf.ny * pf.w * 0.75, back + 0.95 + flap, 18 * s, 8 * s, k.pal.fin);
    const vf = pts[8], vback = Math.atan2(-vf.ty, -vf.tx);
    fin(c, vf.x + vf.nx * vf.w * 0.7, vf.y + vf.ny * vf.w * 0.7, vback - 0.7 + flap * 0.5, 10 * s, 5 * s, k.pal.fin);
    fin(c, vf.x - vf.nx * vf.w * 0.7, vf.y - vf.ny * vf.w * 0.7, vback + 0.7 - flap * 0.5, 10 * s, 5 * s, k.pal.fin);

    const tp = pts[n - 1], tl = 31 * s;
    const tAng = Math.atan2(-tp.ty, -tp.tx) + Math.sin(k.phase - n * 0.55 + 0.8) * 0.35;
    c.save();
    c.translate(tp.x, tp.y);
    c.rotate(tAng);
    c.beginPath();
    c.moveTo(-3 * s, 0);
    c.bezierCurveTo(tl * 0.3, -tl * 0.16, tl * 0.75, -tl * 0.62, tl, -tl * 0.5);
    c.quadraticCurveTo(tl * 0.62, -tl * 0.06, tl * 0.7, 0);
    c.quadraticCurveTo(tl * 0.62, tl * 0.06, tl, tl * 0.5);
    c.bezierCurveTo(tl * 0.75, tl * 0.62, tl * 0.3, tl * 0.16, -3 * s, 0);
    c.fillStyle = k.pal.fin;
    c.fill();
    c.restore();

    const h = pts[0], last = pts[n - 1];
    const P = [[h.x + h.tx * h.w * 1.3, h.y + h.ty * h.w * 1.3]];
    for (let i = 0; i < n; i++) P.push([pts[i].x + pts[i].nx * pts[i].w, pts[i].y + pts[i].ny * pts[i].w]);
    P.push([last.x - last.tx * 3 * s, last.y - last.ty * 3 * s]);
    for (let i = n - 1; i >= 0; i--) P.push([pts[i].x - pts[i].nx * pts[i].w, pts[i].y - pts[i].ny * pts[i].w]);
    c.beginPath();
    c.moveTo((P[P.length - 1][0] + P[0][0]) / 2, (P[P.length - 1][1] + P[0][1]) / 2);
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = P[(i + 1) % P.length];
      c.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
    c.closePath();
    c.fillStyle = k.pal.body;
    c.fill();

    if (k.patches.length) {
      c.save();
      c.clip();
      c.fillStyle = CREAM;
      for (const pa of k.patches) {
        const p = pts[pa.i];
        c.beginPath();
        c.ellipse(p.x + p.nx * p.w * pa.off, p.y + p.ny * p.w * pa.off, pa.rx * s, pa.ry * s, Math.atan2(p.ty, p.tx) + pa.rot, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }

    c.beginPath();
    c.moveTo(pts[1].x, pts[1].y);
    for (let i = 2; i < 9; i++) c.lineTo(pts[i].x, pts[i].y);
    c.strokeStyle = 'rgba(255, 255, 255, 0.09)';
    c.lineWidth = 2.6 * s;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.stroke();

    c.fillStyle = '#1b0906';
    for (const sgn of [1, -1]) {
      c.beginPath();
      c.arc(h.x + h.tx * 2 * s + h.nx * h.w * 0.62 * sgn, h.y + h.ty * 2 * s + h.ny * h.w * 0.62 * sgn, 1.3 * s, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  function drawMotes() {
    ctx.fillStyle = 'rgb(220, 230, 235)';
    for (const m of motes) {
      const sz = 0.6 + m.z * 1.2;
      ctx.globalAlpha = 0.04 + m.z * 0.12;
      ctx.fillRect(m.x * W, m.y * H, sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  function drawFood() {
    ctx.fillStyle = '#f4c27a';
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

  function drawPad(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.ellipse(5, 7, p.r, p.r * 0.97, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, p.r, p.notch, Math.PI * 2 - 0.04);
    ctx.closePath();
    ctx.fillStyle = '#0f261a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(140, 190, 150, 0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(140, 190, 150, 0.07)';
    for (let a = p.notch + 0.45; a < Math.PI * 2 - 0.3; a += 0.55) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * p.r * 0.88, Math.sin(a) * p.r * 0.88);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRipples() {
    ctx.strokeStyle = 'rgb(230, 236, 240)';
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

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawMotes();
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.clearRect(0, 0, deep.width, deep.height);
    dctx.setTransform(DEEP_SCALE, 0, 0, DEEP_SCALE, 0, 0);
    let anyDeep = false;
    for (const k of koi) if (k.depth > DEEP_CUT) { drawKoi(k, dctx); anyDeep = true; }
    if (anyDeep) ctx.drawImage(deep, 0, 0, W, H);
    for (const k of koi) if (k.depth <= DEEP_CUT) drawKoi(k, ctx);
    drawFood();
    for (const p of pads) drawPad(p);
    drawRipples();
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
  };
})();
