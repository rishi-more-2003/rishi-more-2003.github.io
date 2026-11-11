// koi pond: the canvas behind the page. exposes window.pond for terminal.js and site.js.
// a moonlit garden pond in three depths: dim deep water with a pool of light in it, koi at varied
// depths with two large ones circling in the open water, and a few things on the surface (broken
// moonlight that follows tonight's real phase, lanterns, lily pads, a drifting leaf).
(() => {
  const cv = document.getElementById('pond');
  if (!cv || !cv.getContext) return;
  const ctx = cv.getContext('2d', { alpha: false });
  const root = document.documentElement;
  const query = new URLSearchParams(location.search);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const stackedMq = matchMedia('(max-width: 959px)');

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
  // the opening composition is seeded, so the first frame is the same considered picture every visit
  function seeded(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // smooth 1d noise, for anything that should wander rather than oscillate
  const hash = n => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const noise = x => {
    const i = Math.floor(x), f = x - i;
    return lerp(hash(i), hash(i + 1), f * f * (3 - 2 * f));
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

  // a maple leaf, five pointed lobes around a stem, built once and stamped where needed
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

  // koi colours. depth is read through colour as well as size: a deep koi is mixed toward the water,
  // so it stays opaque (fins never show through the body) and still sits far below the surface
  const WATER = [8, 21, 23];
  const INK = [21, 16, 13];
  const CRIMSON = [208, 58, 38];
  const BASE = {
    red:    { body: [214, 66, 43], belly: [86, 16, 8], patch: [238, 228, 210], fin: [228, 96, 66], ray: [255, 196, 168], shine: [255, 176, 138] },
    kohaku: { body: [236, 227, 210], belly: [96, 84, 70], patch: CRIMSON, fin: [238, 229, 214], ray: [255, 250, 240], shine: [255, 255, 250] },
    gold:   { body: [217, 164, 64], belly: [96, 60, 12], patch: [239, 228, 210], fin: [232, 182, 92], ray: [255, 225, 160], shine: [255, 236, 180] },
  };
  const LEVELS = 10;
  const palettes = new Map();
  function palette(kind, level) {
    const key = kind + level;
    let p = palettes.get(key);
    if (p) return p;
    const d = level / (LEVELS - 1), t = Math.min(0.88, Math.pow(d, 1.1) * 0.95);
    const mix = (rgb, a) => {
      const r = Math.round(lerp(rgb[0], WATER[0], t)), g = Math.round(lerp(rgb[1], WATER[1], t)), b = Math.round(lerp(rgb[2], WATER[2], t));
      return a == null ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
    };
    const b = BASE[kind], fa = lerp(0.44, 0.3, d);
    // fins are drawn in unit space, so one gradient per palette fits every fin
    const fin = ctx.createLinearGradient(0, 0, 1, 0);
    fin.addColorStop(0, mix(b.fin, fa));
    fin.addColorStop(0.55, mix(b.fin, fa * 0.46));
    fin.addColorStop(1, mix(b.fin, fa * 0.07));
    p = {
      body: mix(b.body), belly: mix(b.belly, 0.3), patch: mix(b.patch), ink: mix(INK), crimson: mix(CRIMSON),
      fin, finAt: a => mix(b.fin, a * fa), ray: mix(b.ray, lerp(0.32, 0.1, d)), lead: mix(b.ray, lerp(0.5, 0.16, d)),
      shine: mix(b.shine, 0.17), gloss: mix([255, 255, 255], 0.2), edge: `rgba(10, 5, 3, ${lerp(0.4, 0.18, d)})`,
    };
    palettes.set(key, p);
    return p;
  }

  const LEAVES = ['#a8281c', '#c23a22', '#b5301f', '#bf7f2c'];
  const FOOD_GLOW = sprite('235, 185, 100', 0.7);
  const MIST = sprite('205, 212, 216', 1);
  const MOON_GLOW = sprite('226, 226, 214', 0.5);
  const FIREFLY = sprite('240, 214, 140', 0.9);
  const LANTERN_GLOW = sprite('255, 170, 92', 0.55);
  const SEGS = 13;   // head to the root of the tail
  const TAILN = 4;   // more joints for the tail, so it bends along its length instead of hinging
  const GOLD_AT = 24;

  // tonight's moon: 0 is new, 0.5 is full, counted from the new moon of 2000-01-06 18:14 utc.
  // ?moon=0.5 previews another phase
  const SYNODIC = 29.530588853;
  const forced = parseFloat(query.get('moon'));
  const PHASE = Number.isFinite(forced)
    ? ((forced % 1) + 1) % 1
    : ((((Date.now() - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % SYNODIC) + SYNODIC) % SYNODIC / SYNODIC;
  const LIT = (1 - Math.cos(2 * Math.PI * PHASE)) / 2;
  // the moon sets how much light pools under its reflection, but never the whole scene:
  // on a new moon the water is still lit by the sky and the lanterns
  const AMBIENT = 0.82 + 0.18 * LIT;
  const SPILL = 0.3 + 0.7 * LIT;

  // steps down when frames run long: 0 full, 1 dpr 1, 2 no glow or caustics, 3 fewer koi. ?q=2 pins it
  const pinned = parseInt(query.get('q'), 10);
  const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4
    || !!(navigator.connection && navigator.connection.saveData);
  let quality = Number.isFinite(pinned) ? clamp(pinned, 0, 3) : weak ? 1 : 0;
  let dprCap = 1.5, glowOn = true;
  let W = 0, H = 0, DPR = 1, rawDpr = 1;
  let chunky = false, chunkyTimer = 0; // the quantize easter egg: a few seconds at a fraction of the pixels

  // where things go. the page's text block is the quiet side; the open water beside (or above) it
  // holds the focal ellipse the big koi circle in, with the moon's reflection in its upper part
  const L = { stacked: false, quiet: { x0: 0, y0: 0, x1: 0, y1: 0 }, fx: 0, fy: 0, rx: 1, ry: 1, mx: 0, my: 0, mr: 40, vf: 1, vh: 0, hb: 72, band: 200, q1: 0, open: 0 };

  function compose() {
    const hero = document.querySelector('[data-pond-view]');
    const q = document.querySelector('[data-pond-quiet]');
    const top = document.querySelector('.top');
    const sx = window.scrollX, sy = window.scrollY;
    const vh = hero ? Math.min(H, hero.getBoundingClientRect().height) : H;
    L.vh = vh;
    L.stacked = stackedMq.matches;
    L.vf = clamp(Math.min(W, vh) / 900, 0.62, 1.2);
    let quiet = null;
    if (q) {
      const b = q.getBoundingClientRect();
      if (b.width > 0) quiet = { x0: b.left + sx, y0: b.top + sy, x1: b.right + sx, y1: b.bottom + sy };
    }
    if (!quiet) {
      quiet = L.stacked ? { x0: 0, y0: vh * 0.5, x1: W, y1: vh } : { x0: W * 0.07, y0: vh * 0.2, x1: W * 0.5, y1: vh * 0.85 };
    }
    L.quiet = quiet;
    const headBottom = top ? top.getBoundingClientRect().bottom + sy : 72;
    L.hb = headBottom;
    L.band = Math.max(120, quiet.y0 - headBottom);
    L.q1 = L.stacked ? 0 : quiet.x1;
    L.open = W - L.q1;
    if (L.stacked) {
      const band = L.band;
      L.fx = W * 0.5;
      L.fy = headBottom + band * 0.54;
      L.rx = clamp(W * 0.36, 110, 300);
      L.ry = clamp(band * 0.38, 56, 230);
      L.mr = clamp(Math.min(W, band) * 0.085, 24, 52);
      L.mx = W * 0.7;
      L.my = headBottom + band * 0.3;
    } else {
      const open = W - quiet.x1;
      L.fx = quiet.x1 + open * 0.52;
      L.fy = vh * 0.5;
      L.rx = clamp(open * 0.37, 170, 430);
      L.ry = clamp(vh * 0.32, 150, 340);
      L.mr = clamp(Math.min(W, vh) * 0.062, 34, 68);
      L.mx = L.fx + L.rx * 0.2;
      L.my = L.fy - L.ry * 0.66;
    }
  }

  // the deep water: painted once per size into a half-size buffer, then stretched under every frame
  const bg = document.createElement('canvas');
  function paintBackground() {
    const s = 0.5;
    bg.width = Math.max(2, Math.ceil(W * s));
    bg.height = Math.max(2, Math.ceil(H * s));
    const g = bg.getContext('2d');
    g.setTransform(s, 0, 0, s, 0, 0);
    g.fillStyle = '#030505';
    g.fillRect(0, 0, W, H);
    const pool = (x, y, r, stops) => {
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      for (const [o, c] of stops) grad.addColorStop(o, c);
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    };
    const far = Math.max(W, H);
    // a broad lift of green-black across the open water, falling away toward the words and the edges
    pool(L.fx, L.fy, far * 0.72, [
      [0, `rgba(17, 43, 43, ${0.95 * AMBIENT})`], [0.3, `rgba(12, 31, 32, ${0.85 * AMBIENT})`],
      [0.62, `rgba(7, 17, 18, ${0.6 * AMBIENT})`], [1, 'rgba(3, 5, 5, 0)'],
    ]);
    // cool light pooled under the moon's reflection; this is the part that follows the phase
    pool(L.mx, L.my + L.mr, Math.max(L.rx, L.ry) * 1.35, [
      [0, `rgba(104, 142, 150, ${0.24 * SPILL})`], [0.4, `rgba(70, 106, 114, ${0.11 * SPILL})`], [1, 'rgba(60, 90, 100, 0)'],
    ]);
    // the sky's own faint light on the water, there on any night
    pool(L.fx, L.fy - L.ry * 0.2, Math.max(L.rx, L.ry) * 1.1, [
      [0, 'rgba(60, 96, 100, 0.13)'], [1, 'rgba(60, 96, 100, 0)'],
    ]);
    // a warmer, dimmer pool low in the open water, where the lanterns drift
    pool(L.fx + L.rx * 0.5, L.fy + L.ry * 0.95, Math.max(L.rx, L.ry) * 0.9, [
      [0, 'rgba(124, 74, 30, 0.085)'], [1, 'rgba(124, 74, 30, 0)'],
    ]);
    // a colder corner, so the dark is not one flat tone
    pool(L.stacked ? 0 : W, L.stacked ? 0 : H, far * 0.5, [
      [0, 'rgba(8, 14, 26, 0.55)'], [1, 'rgba(8, 14, 26, 0)'],
    ]);
    // the edges fall off into black
    const v = g.createRadialGradient(L.fx, L.fy, Math.min(W, H) * 0.3, L.fx, L.fy, far * 0.86);
    v.addColorStop(0, 'rgba(0, 0, 0, 0)');
    v.addColorStop(1, 'rgba(0, 0, 0, 0.62)');
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
    // a little noise so the gradients do not band
    const n = document.createElement('canvas');
    n.width = n.height = 96;
    const ng = n.getContext('2d'), img = ng.createImageData(96, 96);
    for (let i = 0; i < img.data.length; i += 4) {
      const lum = Math.random() < 0.5 ? 0 : 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = lum;
      img.data[i + 3] = Math.random() * 7;
    }
    ng.putImageData(img, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = g.createPattern(n, 'repeat');
    g.fillRect(0, 0, bg.width, bg.height);
  }

  // caustics: the net of light a rippled surface throws on the bed. two tiles are worked out once,
  // then slid over each other; where they cross, the light seems to move like water
  let CAUSTIC = null, causticFade = 0;
  const cau = document.createElement('canvas');
  function causticTile(size, time) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d'), img = g.createImageData(size, size), d = img.data, TAU = Math.PI * 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const px = (x / size) * TAU - 250, py = (y / size) * TAU - 250;
        let ix = px, iy = py, cc = 1;
        for (let n = 0; n < 5; n++) {
          const t = time * (1 - 3.5 / (n + 1));
          const nx = px + Math.cos(t - ix) + Math.sin(t + iy), ny = py + Math.sin(t - iy) + Math.cos(t + ix);
          ix = nx;
          iy = ny;
          cc += 1 / Math.hypot(1.235 / Math.sin(ix + t), 1.235 / Math.cos(iy + t));
        }
        cc = 1.17 - Math.pow(cc / 5, 1.4);
        const o = (y * size + x) * 4;
        d[o] = 186;
        d[o + 1] = 222;
        d[o + 2] = 226;
        d[o + 3] = clamp(Math.pow(Math.abs(cc), 8), 0, 1) * 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  function buildCaustics() {
    if (CAUSTIC || quality >= 2) return;
    const g = cau.getContext('2d');
    CAUSTIC = [g.createPattern(causticTile(144, 2.1), 'repeat'), g.createPattern(causticTile(144, 7.4), 'repeat')];
    if (!running) { causticFade = 1; renderOnce(); }
  }

  function resize() {
    const box = cv.getBoundingClientRect();
    W = Math.max(1, Math.round(box.width));
    H = Math.max(1, Math.round(box.height));
    rawDpr = window.devicePixelRatio || 1;
    DPR = Math.min(rawDpr, W < 700 ? Math.max(dprCap, 2) : dprCap);
    if (quality >= 1) DPR = Math.min(DPR, 1);
    if (chunky) DPR = 0.22;
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    compose();
    paintBackground();
    cau.width = 480;
    cau.height = 400;
  }
  resize();

  // ---------------------------------------------------------------- the cast

  const rng = seeded(20261110);
  const sr = (a, b) => a + rng() * (b - a);
  const small = W < 600;

  function makeKoi(o) {
    const kind = o.kind || 'red';
    const base = kind === 'tancho' ? 'kohaku' : kind === 'showa' ? 'red' : kind;
    const role = o.role || 'mid';
    const N = SEGS + TAILN;
    const k = {
      kind, base, role, home: o.depth, d: o.depth, dGoal: o.depth,
      size: o.size || (role === 'hero' ? 1.8 : role === 'mid' ? 1.22 : 1.12),
      x: o.x, y: o.y, angle: o.angle, s: 1, segLen: 8,
      cap: kind === 'tancho', gold: kind === 'gold', patches: [],
      pace: role === 'hero' ? sr(0.58, 0.68) : sr(0.72, 0.96), speed: 0, boost: 0, gulp: 0,
      wander: o.angle, wanderT: sr(1, 4), phase: sr(0, 10), fin: sr(0, 10), wake: sr(0.3, 1.2),
      spin: o.spin || 1, seed: sr(0, 100), alpha: kind === 'gold' ? 0 : 1,
      spine: new Array(N), pts: Array.from({ length: N }, () => ({ x: 0, y: 0, tx: 1, ty: 0, nx: 0, ny: 1, w: 0 })),
    };
    scaleKoi(k);
    // lay the body along a gentle arc instead of a ruler line, so it is already swimming in the first frame
    const bend = o.bend ?? sr(-0.02, 0.02);
    let a = o.angle + Math.PI, px = o.x, py = o.y;
    for (let i = 0; i < N; i++) {
      k.spine[i] = { x: px, y: py };
      const len = i < SEGS - 1 ? k.segLen : k.segLen * 1.6;
      a += bend;
      px += Math.cos(a) * len;
      py += Math.sin(a) * len;
    }
    // each marking is a few overlapping blobs, so the edges look organic instead of oval
    const add = (n, color) => {
      for (let j = 0; j < n; j++) {
        const rx = sr(6, 11), ry = sr(5, 8);
        const blobs = [{ dx: 0, dy: 0, rx, ry }];
        for (let q = 0; q < 2; q++) blobs.push({ dx: sr(-0.8, 0.8) * rx, dy: sr(-0.5, 0.5) * ry, rx: rx * sr(0.5, 0.75), ry: ry * sr(0.5, 0.75) });
        k.patches.push({ i: 1 + Math.floor(rng() * (SEGS - 5)), off: sr(-0.5, 0.5), rot: sr(-0.4, 0.4), blobs, color });
      }
    };
    if (kind === 'kohaku') add(3, 'patch');
    else if (kind === 'red' && (role === 'hero' || rng() < 0.6)) add(role === 'hero' ? 1 : 1 + Math.floor(rng() * 2), 'patch');
    else if (kind === 'showa') { add(2, 'ink'); add(1, 'patch'); }
    return k;
  }

  // nearer the surface reads as larger; a koi that rises for food grows as it comes up
  function scaleKoi(k) {
    k.s = k.size * L.vf * lerp(1, 0.62, k.d);
    k.segLen = 8 * k.s;
  }

  const at = (ex, ey) => [L.fx + ex * L.rx, L.fy + ey * L.ry];
  // a point in the open water: u across it, v down it
  const water = (u, v) => (L.stacked ? [W * u, L.hb + L.band * v] : [L.q1 + L.open * u, L.vh * v]);
  const koi = [];
  function cast() {
    const add = (o, [x, y]) => koi.push(makeKoi({ ...o, x, y }));
    if (L.stacked) {
      add({ kind: 'kohaku', role: 'hero', depth: 0.06, angle: -2.2, bend: -0.075 }, at(-0.42, 0.3));
      if (!small) add({ kind: 'red', role: 'hero', depth: 0.12, angle: 1.0, bend: -0.075, size: 1.6 }, at(0.5, -0.3));
      add({ kind: 'tancho', role: 'mid', depth: 0.52, angle: 0.3 }, water(0.82, 0.86));
      add({ kind: 'red', role: 'mid', depth: 0.6, angle: 2.6 }, water(0.14, 0.12));
      add({ kind: 'showa', role: 'deep', depth: 0.82, angle: 0.4 }, [W * 0.3, L.quiet.y0 + (L.quiet.y1 - L.quiet.y0) * 0.35]);
      add({ kind: 'red', role: 'deep', depth: 0.92, angle: -2.8 }, [W * 0.72, L.quiet.y0 + (L.quiet.y1 - L.quiet.y0) * 0.8]);
    } else {
      add({ kind: 'kohaku', role: 'hero', depth: 0.05, angle: -1.95, bend: -0.075 }, at(-0.62, 0.3));
      add({ kind: 'red', role: 'hero', depth: 0.12, angle: 1.3, bend: -0.075, size: 1.62 }, at(0.64, -0.12));
      add({ kind: 'showa', role: 'mid', depth: 0.52, angle: -2.4 }, water(0.9, 0.84));
      add({ kind: 'tancho', role: 'mid', depth: 0.58, angle: 0.25 }, water(0.36, 0.1));
      add({ kind: 'red', role: 'mid', depth: 0.64, angle: 0.5 }, water(0.3, 0.9));
      add({ kind: 'red', role: 'deep', depth: 0.82, angle: 0.2 }, [L.q1 * 0.62, L.vh * 0.87]);
      add({ kind: 'kohaku', role: 'deep', depth: 0.9, angle: 2.4 }, water(0.72, 0.05));
      add({ kind: 'red', role: 'deep', depth: 0.96, angle: -1.2 }, [L.q1 * 0.9, L.vh * 0.1]);
    }
  }
  cast();

  // lily pads frame the open water; they bob in place rather than wander off
  const pads = [];
  const lanterns = [];
  let home = 0; // how many lanterns are moored from the start
  function place() {
    const V = L.vf;
    const spots = L.stacked
      ? [[0.12, 0.8, 32, true], [0.9, 0.16, 24, false]]
      : [[0.935, 0.6, 44, true], [0.15, 0.8, 31, false], [0.86, 0.16, 36, false]];
    spots.forEach(([u, v, r, lotus], i) => {
      const [x, y] = water(u, v);
      const p = pads[i] || (pads[i] = { rot: sr(0, 6.28), notch: sr(0.28, 0.42), ph: sr(0, 6.28) });
      Object.assign(p, { ax: x, ay: y, x, y, r: r * V, lotus });
    });
    pads.length = spots.length;
    const moor = L.stacked ? (small ? [[0.84, 0.84]] : [[0.84, 0.84], [0.2, 0.3]]) : [[0.8, 0.8], [0.1, 0.2]];
    moor.forEach(([u, v], i) => {
      const [x, y] = water(u, v);
      const l = lanterns[i] || (lanterns[i] = { rot: sr(-0.3, 0.3), ph: sr(0, 6.28), born: 1, seed: sr(0, 50) });
      Object.assign(l, { ax: x, ay: y, tx: x, ty: y, x, y });
    });
    home = moor.length;
  }
  place();

  // a leaf drifts with a slow current through the open water, never across the words
  function leaf(first) {
    const l = { rot: rand(0, 6.28), spin: rand(-0.25, 0.25), s: rand(6.5, 10) * L.vf, wob: rand(0, 6.28), color: pick(LEAVES), sakura: Math.random() < 0.34 };
    if (L.stacked) {
      Object.assign(l, { x: first ? rand(0, W) : -24, y: rand(L.fy - L.ry * 1.3, L.fy + L.ry * 1.2), vx: rand(5, 9), vy: rand(-1.2, 1.2) });
    } else {
      Object.assign(l, { x: rand(L.quiet.x1 + 60, W - 20), y: first ? rand(0, L.vh) : -24, vx: rand(-1.5, 2.5), vy: rand(4.5, 8) });
    }
    return l;
  }
  const leaves = Array.from({ length: small ? 3 : 4 }, () => leaf(true));
  const mists = Array.from({ length: 2 }, (_, i) => ({
    x: rand(0, W), y: rand(0, H * 0.5), r: rand(300, 480), vx: rand(3, 6) * (i ? -1 : 1), vy: rand(-1, 1), a: rand(0.025, 0.04),
  }));
  const fireflies = Array.from({ length: small ? 3 : 5 }, () => ({
    x: L.fx + rand(-1.4, 1.4) * L.rx, y: Math.max(L.hb + 60, L.fy + rand(-1.2, 0.4) * L.ry), a: rand(0, 6.28), sp: rand(6, 12), turn: 0, ph: rand(0, 6.28), rate: rand(0.5, 1.1),
  }));
  const food = [];
  const ripples = [];
  const bubbles = [];
  let fed = 0, eaten = 0, goldSpawned = false, goldPending = false, raining = false, rainAcc = 0, idleBubble = 3, clock = 0, warm = false;
  let gatherUntil = 0, scatterUntil = 0;
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

  // a spot in the open water that the terminal is not covering, so you can watch what happens there
  function openWater() {
    const t = document.querySelector('dialog[open]');
    const r = t ? t.getBoundingClientRect() : null;
    for (let i = 0; i < 24; i++) {
      const a = rand(0, 6.28), m = Math.sqrt(Math.random()) * 0.92;
      const x = L.fx + Math.cos(a) * m * L.rx, y = L.fy + Math.sin(a) * m * L.ry;
      if (x < 12 || x > W - 12 || y < 12 || y > H - 12) continue;
      if (!r || x < r.left - 24 || x > r.right + 24 || y < r.top - 24 || y > r.bottom + 24) return [x, y];
    }
    return [L.mx, L.my + L.mr * 2];
  }

  function feed(x, y) {
    if (!wantsMotion()) {
      dispatchEvent(new CustomEvent('pond:still'));
      return false;
    }
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
    for (let k = 0; k < 3; k++) ripples.push({ x, y, t: -k * 0.2, dur: 1.9, max: (64 + k * 26) * L.vf, w: 1.1, a: 1 - k * 0.22 });
    dispatchEvent(new CustomEvent('pond:fed'));
    return true;
  }

  // only a press and release on the bare water feeds. the canvas sits under the page, so links, text,
  // the terminal and scrolling never reach it; a drag that ends somewhere else does not count either
  let press = null;
  cv.addEventListener('pointerdown', e => {
    if (e.button) return;
    press = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
  });
  cv.addEventListener('pointerup', e => {
    if (!press || e.pointerId !== press.id) return;
    const still = Math.hypot(e.clientX - press.x, e.clientY - press.y) < 10 && performance.now() - press.t < 700;
    press = null;
    if (still) feed(e.clientX, e.clientY);
  });
  cv.addEventListener('pointercancel', () => { press = null; });

  // the cursor trails faint ripples through the water; koi drift toward a still one and bolt from a fast one
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const now = performance.now(), dt = (now - cursor.t) / 1000;
    if (cursor.t && dt > 0) cursor.speed = Math.hypot(e.clientX - cursor.x, e.clientY - cursor.y) / dt;
    cursor.x = e.clientX;
    cursor.y = e.clientY;
    cursor.t = now;
    cursor.over = e.target === cv;
    if (running && cursor.over && now - cursor.rt > 90 && Math.hypot(cursor.x - cursor.rx, cursor.y - cursor.ry) > 18) {
      cursor.rx = cursor.x;
      cursor.ry = cursor.y;
      cursor.rt = now;
      ripples.push({ x: cursor.x, y: cursor.y, t: 0, dur: 1, max: 11, w: 0.7, a: 0.5 });
    }
  }, { passive: true });
  document.addEventListener('mouseleave', () => { cursor.over = false; });

  // a lantern set down from the terminal drifts toward the moon and moors beside it
  function addLantern() {
    if (!wantsMotion()) {
      dispatchEvent(new CustomEvent('pond:still'));
      return false;
    }
    const [x, y] = openWater();
    if (lanterns.length >= 8) lanterns.splice(home, 1);
    const a = rand(0, 6.28), ring = L.mr * rand(2.2, 3.6);
    lanterns.push({
      x, y, ax: x, ay: y, tx: L.mx + Math.cos(a) * ring * 1.3, ty: L.my + Math.sin(a) * ring,
      rot: rand(-0.3, 0.3), ph: rand(0, 6.28), born: 0, seed: rand(0, 50),
    });
    ripples.push({ x, y, t: 0, dur: 1.6, max: 34 * L.vf, w: 0.9, a: 0.7 });
    return true;
  }

  // `quantize` in the terminal: the pond in int4, more or less. chunky pixels, the same koi
  function quantize(ms = 7000) {
    clearTimeout(chunkyTimer);
    chunky = true;
    root.classList.add('pond-int4');
    resize();
    renderOnce();
    chunkyTimer = setTimeout(() => {
      chunky = false;
      root.classList.remove('pond-int4');
      resize();
      renderOnce();
    }, ms);
    return true;
  }

  function bubbleFrom(k, count) {
    const d = k.segLen * 1.6;
    for (let i = 0; i < count; i++) {
      const a = k.angle + rand(-0.5, 0.5);
      bubbles.push({
        x: k.x + Math.cos(k.angle) * d, y: k.y + Math.sin(k.angle) * d,
        vx: Math.cos(a) * rand(4, 10), vy: Math.sin(a) * rand(4, 10),
        r: rand(1.2, 2.2) * Math.max(0.8, k.s * 0.7), t: -i * 0.12, dur: rand(0.8, 1.2),
      });
    }
  }

  // the easter egg: a great carp, much bigger and in no hurry
  function spawnGold() {
    goldSpawned = true;
    const spots = [
      [W + 90, rand(0.25, 0.75) * L.vh, Math.PI],
      [rand(0.55, 0.9) * W, -90, Math.PI / 2], [rand(0.55, 0.9) * W, H + 90, -Math.PI / 2],
    ];
    const [x, y, angle] = pick(spots);
    koi.push(makeKoi({ kind: 'gold', role: 'hero', x, y, angle, depth: 0.02, size: 2.5, spin: -1 }));
    bell();
    dispatchEvent(new CustomEvent('pond:golden'));
  }

  function inQuiet(x, y, pad) {
    const q = L.quiet;
    return x > q.x0 - pad && x < q.x1 + pad && y > q.y0 - pad && y < q.y1 + pad;
  }

  function update(dt) {
    const now = performance.now();
    clock += dt;
    for (const p of pads) {
      p.x = p.ax + Math.sin(clock * 0.21 + p.ph) * 4;
      p.y = p.ay + Math.cos(clock * 0.17 + p.ph * 1.7) * 3;
      p.rot += Math.sin(clock * 0.13 + p.ph) * 0.02 * dt;
    }
    for (let i = 0; i < leaves.length; i++) {
      const l = leaves[i];
      l.wob += dt;
      l.rot += l.spin * dt;
      l.x += (l.vx + Math.sin(l.wob * 0.7) * 2) * dt;
      l.y += (l.vy + Math.cos(l.wob * 0.5) * 1.5) * dt;
      if (l.x > W + 30 || l.y > H + 30 || l.x < -40) leaves[i] = leaf(false);
    }
    for (const m of mists) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.x < -m.r) m.x = W + m.r; else if (m.x > W + m.r) m.x = -m.r;
      if (m.y < -m.r) m.y = H * 0.5; else if (m.y > H * 0.7) m.y = -m.r * 0.5;
    }
    for (const f of fireflies) {
      f.turn = clamp(f.turn + rand(-1, 1) * dt, -0.8, 0.8);
      f.a += f.turn * dt;
      // they keep to the air over the open water
      const hx = L.fx - f.x, hy = L.fy - L.ry * 0.5 - f.y;
      if (Math.hypot(hx / (L.rx * 1.7), hy / (L.ry * 1.3)) > 1 || f.y < L.hb + 40) f.a += angDiff(f.a, Math.atan2(hy, hx)) * dt * 0.8;
      f.x += Math.cos(f.a) * f.sp * dt;
      f.y += Math.sin(f.a) * f.sp * dt;
      f.ph += dt * f.rate;
    }
    for (const l of lanterns) {
      l.born = Math.min(1, l.born + dt * 0.8);
      l.ph += dt;
      const ease = 1 - Math.exp(-dt * 0.035);
      l.ax += (l.tx - l.ax) * ease;
      l.ay += (l.ty - l.ay) * ease;
      l.x = l.ax + Math.sin(clock * 0.11 + l.seed) * 16 + Math.sin(clock * 0.047 + l.seed * 2) * 22;
      l.y = l.ay + Math.cos(clock * 0.09 + l.seed * 1.3) * 12;
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
      rainAcc += dt * 12;
      for (; rainAcc >= 1; rainAcc--) ripples.push({ x: rand(0, W), y: rand(0, H), t: 0, dur: rand(0.8, 1.2), max: rand(8, 20), w: 0.7, a: 0.55 });
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
    if (idleBubble <= 0 && koi.length && !warm) {
      idleBubble = rand(4, 8);
      const k = pick(koi);
      if (k.d < 0.6) bubbleFrom(k, 1);
    }

    for (const k of koi) {
      if (k.alpha < 1) k.alpha = Math.min(1, k.alpha + dt * 0.4);
      k.gulp = Math.max(0, k.gulp - dt * 3);

      let turn = 1, spd = k.pace;
      k.wanderT -= dt;
      if (k.wanderT <= 0) { k.wander = k.angle + rand(-1.1, 1.1); k.wanderT = rand(2.5, 5.5); }
      let desired = k.wander;

      let target = null, best = 640;
      for (const f of food) {
        const d = Math.hypot(f.x - k.x, f.y - k.y);
        if (d < best) { best = d; target = f; }
      }
      k.dGoal = target ? Math.min(k.home, 0.14) : k.home;
      if (now < scatterUntil) {
        desired = Math.atan2(k.y - L.fy, k.x - L.fx);
        turn = 5;
        spd = k.pace * 2.6;
      } else if (target) {
        desired = Math.atan2(target.y - k.y, target.x - k.x);
        turn = 3.6;
        spd = k.pace * 3 * clamp(best / 120, 0.4, 1); // ease off on arrival so they don't orbit the pellet
        if (best < 10 * k.s + 5 && k.d < 0.3) {
          food.splice(food.indexOf(target), 1);
          eaten++;
          k.boost = 1;
          k.gulp = 1;
          bubbleFrom(k, 1);
          pluck(pick(SCALE));
          ripples.push({ x: target.x, y: target.y, t: 0, dur: 0.8, max: 15 * k.s, w: 0.9, a: 0.8 });
          if (!goldSpawned && eaten >= GOLD_AT) goldPending = true;
        }
      } else if (now < gatherUntil) {
        if (Math.hypot(L.fx - k.x, L.fy - k.y) > 70 * L.vf) {
          desired = Math.atan2(L.fy - k.y, L.fx - k.x);
          turn = 2;
          spd = k.pace * 1.4;
        }
      } else {
        const ex = (k.x - L.fx) / L.rx, ey = (k.y - L.fy) / L.ry, rr = Math.hypot(ex, ey) || 1e-3;
        if (k.role === 'hero') {
          // the big koi circle the focal water, each on its own slowly breathing orbit
          const want = (k.gold ? 1.05 : 0.6) + 0.3 * noise(k.seed + clock * 0.035);
          const pull = clamp((want - rr) * 1.7, -1, 1);
          const vx = ((-ey / rr) * k.spin + (ex / rr) * pull) * L.rx;
          const vy = ((ex / rr) * k.spin + (ey / rr) * pull) * L.ry;
          desired = Math.atan2(vy, vx) + (noise(k.seed * 3 + clock * 0.12) - 0.5) * 0.7;
          turn = 0.9;
        } else if (k.role === 'mid' && (rr > 1.9 || inQuiet(k.x, k.y, 70))) {
          // the middle fish keep to the open water, loosely
          desired = Math.atan2(L.fy - k.y, L.fx - k.x) + (noise(k.seed + clock * 0.2) - 0.5);
          turn = 1.3;
        }
        if (cursor.over && k.d < 0.6) {
          const dx = cursor.x - k.x, dy = cursor.y - k.y, d = Math.hypot(dx, dy), idle = (now - cursor.t) / 1000;
          if (idle < 0.1 && cursor.speed > 900 && d < 150) {
            desired = Math.atan2(-dy, -dx);
            turn = 5;
            k.boost = Math.max(k.boost, 0.8);
          } else if (idle > 0.8 && idle < 12 && d > 70 && d < 320 && k.role !== 'hero') {
            desired = Math.atan2(dy, dx);
            turn = 1.5;
          }
        }
        // nothing bright lingers under the words: near koi turn back toward the open water
        if (k.d < 0.6 && inQuiet(k.x, k.y, 40)) {
          desired += angDiff(desired, Math.atan2(L.fy - k.y, L.fx - k.x)) * 0.85;
          turn = Math.max(turn, 2);
        }
      }

      const m = 110 * L.vf;
      let bx = 0, by = 0;
      if (k.x < m) bx = (m - k.x) / m; else if (k.x > W - m) bx = -(k.x - (W - m)) / m;
      if (k.y < m) by = (m - k.y) / m; else if (k.y > H - m) by = -(k.y - (H - m)) / m;
      if (bx || by) {
        const s = clamp(Math.hypot(bx, by), 0, 1);
        desired += angDiff(desired, Math.atan2(by, bx)) * s;
        turn = Math.max(turn, 1.1 + 2 * s);
      }
      for (const o of koi) {
        if (o === k) continue;
        const dx = k.x - o.x, dy = k.y - o.y, d = Math.hypot(dx, dy), r = 60 * k.s;
        if (d > 0 && d < r && Math.abs(k.d - o.d) < 0.3) desired += angDiff(desired, Math.atan2(dy, dx)) * 0.25 * (1 - d / r);
      }

      k.d += (k.dGoal - k.d) * (1 - Math.exp(-dt * 0.9));
      scaleKoi(k);
      k.angle += clamp(angDiff(k.angle, desired), -turn * dt, turn * dt);
      k.boost = Math.max(0, k.boost - dt * 0.8);
      const goal = (spd + k.boost * 0.9) * 36 * k.s;
      k.speed = lerp(k.speed, goal, 1 - Math.exp(-dt * 3));
      k.phase += dt * (2.2 + k.speed * 0.045);
      k.fin += dt * (1.6 + k.speed * 0.04);
      const heading = k.angle + Math.sin(k.phase) * 0.05;
      k.x += Math.cos(heading) * k.speed * dt;
      k.y += Math.sin(heading) * k.speed * dt;

      const sp = k.spine;
      sp[0].x = k.x;
      sp[0].y = k.y;
      for (let i = 1; i < sp.length; i++) {
        const a = sp[i - 1], b = sp[i], len = i < SEGS ? k.segLen : k.segLen * 1.6;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
        b.x = a.x + (dx / d) * len;
        b.y = a.y + (dy / d) * len;
      }

      // a low bow wave ahead of a koi near the surface: quiet at a cruise, livelier in a rush
      if (!warm && k.d < 0.45) {
        k.wake -= dt * (0.3 + k.speed / 70);
        if (k.wake <= 0) {
          k.wake = rand(0.8, 1.3);
          ripples.push({ x: k.x, y: k.y, t: 0, dur: 1.7, max: 30 * k.s, w: 0.7, a: clamp(k.speed / 90, 0.22, 0.7), dir: k.angle, span: 1.05 });
        }
      }
    }
    if (goldPending) { goldPending = false; spawnGold(); }
  }

  // ---------------------------------------------------------------- drawing

  // round head, widest just behind it, a long taper into the tail
  const bodyW = u => u < 0.28
    ? lerp(0.7, 1, Math.sin((u / 0.28) * Math.PI / 2))
    : lerp(1, 0.14, Math.pow((u - 0.28) / 0.72, 1.35));

  function bodyShape(pts, n, ws, s) {
    const c = new Path2D();
    const h = pts[0], last = pts[n - 1];
    const P = [[h.x + h.tx * h.w * ws * 1.1, h.y + h.ty * h.w * ws * 1.1]];
    for (let i = 0; i < n; i++) P.push([pts[i].x + pts[i].nx * pts[i].w * ws, pts[i].y + pts[i].ny * pts[i].w * ws]);
    P.push([last.x - last.tx * 2.5 * s, last.y - last.ty * 2.5 * s]);
    for (let i = n - 1; i >= 0; i--) P.push([pts[i].x - pts[i].nx * pts[i].w * ws, pts[i].y - pts[i].ny * pts[i].w * ws]);
    c.moveTo((P[P.length - 1][0] + P[0][0]) / 2, (P[P.length - 1][1] + P[0][1]) / 2);
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = P[(i + 1) % P.length];
      c.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
    c.closePath();
    return c;
  }

  // a long see-through fin with rays; bend swings the tip so it trails like silk
  function fin(c, x, y, ang, len, wid, pal, bend, rays) {
    const w = wid / len, b = bend / len;
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    c.scale(len, len);
    c.beginPath();
    c.moveTo(0, 0);
    c.bezierCurveTo(0.3, -w, 0.85, -w * 0.8 + b, 1, b);
    c.bezierCurveTo(0.9, w * 0.7 + b, 0.3, w * 0.9, 0, 0);
    c.fillStyle = pal.fin;
    c.fill();
    if (rays) {
      c.strokeStyle = pal.ray;
      c.lineWidth = 0.55 / len;
      c.beginPath();
      for (const f of [-0.5, -0.17, 0.17, 0.5]) {
        c.moveTo(0.08, 0);
        c.quadraticCurveTo(0.5, w * f, 0.92, w * f * 0.7 + b);
      }
      c.stroke();
      // the leading edge catches the light
      c.strokeStyle = pal.lead;
      c.lineWidth = 0.8 / len;
      c.beginPath();
      c.moveTo(0, 0);
      c.bezierCurveTo(0.3, -w, 0.85, -w * 0.8 + b, 1, b);
      c.stroke();
    }
    c.restore();
  }

  // the tail: two long lobes built along the tail's own joints, so the whole fin bends and trails
  // behind the body instead of swinging from a hinge
  const TAIL_OUT = [0.1, 0.5, 0.88, 1.02, 0.8];
  const TAIL_IN = [0, 0.05, 0.16, 0.36, 0.56];
  function tail(c, k, pts, n, s, pal, rays) {
    const base = pts[n - 1], tip = pts[pts.length - 1], tw = 20 * s;
    const flutter = Math.sin(k.phase * 1.1) * 0.13;
    const g = c.createLinearGradient(base.x, base.y, tip.x, tip.y);
    g.addColorStop(0, pal.finAt(1.05));
    g.addColorStop(0.5, pal.finAt(0.55));
    g.addColorStop(1, pal.finAt(0.1));
    for (const sg of [1, -1]) {
      const m = (1 + flutter * sg) * tw * sg;
      const O = [], I = [];
      for (let j = 0; j <= TAILN; j++) {
        const p = pts[n - 1 + j];
        O.push([p.x + p.nx * TAIL_OUT[j] * m, p.y + p.ny * TAIL_OUT[j] * m]);
        I.push([p.x + p.nx * TAIL_IN[j] * m, p.y + p.ny * TAIL_IN[j] * m]);
      }
      const e = TAILN;
      const tx = (O[e][0] + I[e][0]) / 2 - tip.tx * 6 * s, ty = (O[e][1] + I[e][1]) / 2 - tip.ty * 6 * s;
      c.beginPath();
      c.moveTo(base.x, base.y);
      for (let j = 0; j < e; j++) c.quadraticCurveTo(O[j][0], O[j][1], (O[j][0] + O[j + 1][0]) / 2, (O[j][1] + O[j + 1][1]) / 2);
      c.quadraticCurveTo(O[e][0], O[e][1], tx, ty);
      c.quadraticCurveTo(I[e][0], I[e][1], (I[e][0] + I[e - 1][0]) / 2, (I[e][1] + I[e - 1][1]) / 2);
      for (let j = e - 1; j > 1; j--) c.quadraticCurveTo(I[j][0], I[j][1], (I[j][0] + I[j - 1][0]) / 2, (I[j][1] + I[j - 1][1]) / 2);
      c.quadraticCurveTo(I[1][0], I[1][1], base.x, base.y);
      c.closePath();
      c.fillStyle = g;
      c.fill();
      if (rays) {
        c.strokeStyle = pal.ray;
        c.lineWidth = 0.55 * s;
        c.beginPath();
        for (const f of [0.18, 0.44, 0.7, 0.94]) {
          c.moveTo(base.x, base.y);
          c.quadraticCurveTo(lerp(I[2][0], O[2][0], f), lerp(I[2][1], O[2][1], f), lerp(I[e][0], O[e][0], f), lerp(I[e][1], O[e][1], f));
        }
        c.stroke();
      }
    }
  }

  function face(c, k, pts, s) {
    const h = pts[0], e = pts[1], fx = h.tx, fy = h.ty, a = Math.atan2(fy, fx);
    for (const sg of [1, -1]) {
      const ex = e.x + fx * 2.2 * s + e.nx * e.w * 0.6 * sg;
      const ey = e.y + fy * 2.2 * s + e.ny * e.w * 0.6 * sg;
      c.fillStyle = '#120a08';
      c.beginPath(); c.arc(ex, ey, 1.5 * s, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255, 240, 220, 0.8)';
      c.beginPath(); c.arc(ex - 0.45 * s, ey - 0.5 * s, 0.45 * s, 0, Math.PI * 2); c.fill();
    }
    if (k.gulp > 0) {
      c.fillStyle = 'rgba(40, 10, 6, 0.85)';
      c.beginPath(); c.arc(h.x + fx * h.w, h.y + fy * h.w, (0.8 + k.gulp) * s, 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = 'rgba(240, 220, 200, 0.32)';
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
    const sp = k.spine, n = SEGS, N = sp.length, s = k.s, pts = k.pts, maxW = 14 * s;
    const pal = palette(k.base, Math.round(clamp(k.d, 0, 1) * (LEVELS - 1)));
    const near = k.d < 0.34, mid = k.d < 0.68;
    const swayAmp = 3 * s * (1 + k.boost * 0.6); // a happy wiggle after eating
    // the swimming wave travels down the body and out along the tail, growing as it goes
    for (let i = 0; i < N; i++) {
      const a = sp[Math.max(0, i - 1)], b = sp[Math.min(N - 1, i + 1)];
      let tx = a.x - b.x, ty = a.y - b.y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const u = i / (n - 1), amp = i < n ? u * u : 1 + (i - n + 1) * 0.42;
      const sway = Math.sin(k.phase - i * 0.5) * swayAmp * amp;
      pts[i].x = sp[i].x - ty * sway;
      pts[i].y = sp[i].y + tx * sway;
    }
    for (let i = 0; i < N; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)], p = pts[i];
      let tx = a.x - b.x, ty = a.y - b.y;
      const tl = Math.hypot(tx, ty) || 1;
      p.tx = tx / tl;
      p.ty = ty / tl;
      p.nx = -p.ty;
      p.ny = p.tx;
      p.w = i < n ? maxW * bodyW(i / (n - 1)) : 0;
    }
    // light comes from the moon's side of the water
    let lx = L.mx - k.x, ly = L.my - k.y;
    const ll = Math.hypot(lx, ly);
    if (ll > 30) { lx /= ll; ly /= ll; } else { lx = -0.5; ly = -0.86; }

    const body = bodyShape(pts, n, 1, s);
    c.save();
    c.globalAlpha = k.alpha;

    // a koi near the surface throws a soft shadow on the bed, away from the light
    if (near && quality < 3) {
      const off = (16 + 22 * (1 - k.d / 0.34)) * s;
      c.save();
      c.translate(-lx * off, -ly * off);
      c.fillStyle = 'rgba(0, 0, 0, 0.13)';
      c.fill(body);
      c.translate(-lx * 3 * s, -ly * 3 * s);
      c.fill(body);
      c.restore();
    }

    tail(c, k, pts, n, s, pal, mid);
    const pf = pts[3], back = Math.atan2(-pf.ty, -pf.tx), flap = Math.sin(k.fin * 1.8) * 0.28;
    fin(c, pf.x + pf.nx * pf.w * 0.7, pf.y + pf.ny * pf.w * 0.7, back - 1.1 - flap, 25 * s, 8.5 * s, pal, Math.sin(k.fin * 1.6) * 3 * s, mid);
    fin(c, pf.x - pf.nx * pf.w * 0.7, pf.y - pf.ny * pf.w * 0.7, back + 1.1 + flap, 25 * s, 8.5 * s, pal, Math.sin(k.fin * 1.6 + 1) * 3 * s, mid);
    if (mid) {
      const vf = pts[7], vback = Math.atan2(-vf.ty, -vf.tx);
      fin(c, vf.x + vf.nx * vf.w * 0.7, vf.y + vf.ny * vf.w * 0.7, vback - 0.75 + flap * 0.5, 12.5 * s, 4.5 * s, pal, 0, false);
      fin(c, vf.x - vf.nx * vf.w * 0.7, vf.y - vf.ny * vf.w * 0.7, vback + 0.75 - flap * 0.5, 12.5 * s, 4.5 * s, pal, 0, false);
    }

    c.fillStyle = pal.body;
    c.fill(body);
    c.save();
    c.clip(body);
    for (const pa of k.patches) {
      const p = pts[pa.i];
      const cx = p.x + p.nx * p.w * pa.off, cy = p.y + p.ny * p.w * pa.off;
      const ang = Math.atan2(p.ty, p.tx) + pa.rot;
      c.fillStyle = pal[pa.color];
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
      c.fillStyle = pal.crimson;
      c.beginPath();
      c.arc(p.x - p.tx * 1.5 * s, p.y - p.ty * 1.5 * s, p.w * 0.6, 0, Math.PI * 2);
      c.fill();
    }
    if (mid) {
      // the flanks fall into shadow, which is what makes the body read as round
      c.strokeStyle = pal.belly;
      c.lineWidth = maxW * 1.1;
      c.stroke(body);
      c.lineWidth = maxW * 0.5;
      c.stroke(body);
      // and a soft band of light sits on the side that faces the moon
      c.translate(lx * maxW * 0.2, ly * maxW * 0.2);
      c.fillStyle = pal.shine;
      c.fill(bodyShape(pts, n - 3, 0.5, s));
      if (near) {
        c.translate(lx * maxW * 0.08, ly * maxW * 0.08);
        c.globalAlpha = k.alpha * (0.55 + 0.45 * LIT);
        c.fillStyle = pal.gloss;
        c.fill(bodyShape(pts, n - 7, 0.2, s));
      }
    }
    c.restore();

    // a fine ink edge, like a brush painting
    c.strokeStyle = pal.edge;
    c.lineWidth = 0.8 * s;
    c.stroke(body);

    if (mid) {
      // gill covers: one short curve on each side, just behind the head
      const gp = pts[2];
      c.strokeStyle = 'rgba(20, 8, 4, 0.2)';
      c.lineWidth = 0.7 * s;
      c.beginPath();
      for (const sg of [1, -1]) {
        c.moveTo(gp.x + gp.tx * 2.5 * s + gp.nx * gp.w * 0.22 * sg, gp.y + gp.ty * 2.5 * s + gp.ny * gp.w * 0.22 * sg);
        c.quadraticCurveTo(gp.x - gp.tx * 1.5 * s + gp.nx * gp.w * 0.6 * sg, gp.y - gp.ty * 1.5 * s + gp.ny * gp.w * 0.6 * sg,
          gp.x + gp.tx * 1.2 * s + gp.nx * gp.w * 0.94 * sg, gp.y + gp.ty * 1.2 * s + gp.ny * gp.w * 0.94 * sg);
      }
      c.stroke();
      // dorsal fin, seen from above as a thin waving ridge
      c.beginPath();
      for (let i = 2; i < 8; i++) {
        const p = pts[i], wave = Math.sin(k.phase * 1.5 - i * 0.4) * 1.1 * s;
        if (i === 2) c.moveTo(p.x + p.nx * wave, p.y + p.ny * wave);
        else c.lineTo(p.x + p.nx * wave, p.y + p.ny * wave);
      }
      c.strokeStyle = pal.ray;
      c.lineWidth = 1.5 * s;
      c.lineCap = 'round';
      c.stroke();
      c.lineCap = 'butt';
      face(c, k, pts, s);
    }
    c.restore();
  }

  function drawCaustics() {
    if (!CAUSTIC || quality >= 2 || causticFade <= 0) return;
    const g = cau.getContext('2d'), cw = cau.width, ch = cau.height, t = clock;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, cw, ch);
    CAUSTIC[0].setTransform(new DOMMatrix().translate(t * 2.6, t * 1.4).scale(0.62));
    g.fillStyle = CAUSTIC[0];
    g.fillRect(0, 0, cw, ch);
    g.globalCompositeOperation = 'lighter';
    CAUSTIC[1].setTransform(new DOMMatrix().rotate(24).translate(-t * 1.9, t * 2.2).scale(0.88));
    g.fillStyle = CAUSTIC[1];
    g.fillRect(0, 0, cw, ch);
    // only where the light pools
    g.globalCompositeOperation = 'destination-in';
    const m = g.createRadialGradient(cw * 0.52, ch * 0.42, 0, cw * 0.5, ch * 0.48, cw * 0.5);
    m.addColorStop(0, 'rgba(0, 0, 0, 1)');
    m.addColorStop(0.5, 'rgba(0, 0, 0, 0.5)');
    m.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = m;
    g.fillRect(0, 0, cw, ch);
    const w = L.rx * 3.4, h = L.ry * 3.1;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.14 * AMBIENT * causticFade;
    ctx.drawImage(cau, L.fx - w / 2, L.fy - h * 0.52, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // the moon on the water: a disc broken into drifting shards of light, lit as much as tonight's
  // real moon. the dark part still shows faintly (earthshine), so a new moon is a ghost, not a gap
  function drawMoon() {
    const x = L.mx, y = L.my, r = L.mr, t = clock;
    ctx.globalAlpha = 0.5 * (0.34 + 0.66 * LIT);
    ctx.drawImage(MOON_GLOW, x - r * 3.4, y - r * 2.5, r * 6.8, r * 5);
    // a tighter glow under the lit part, so a bright moon has a body and not only an outline
    ctx.globalAlpha = 0.5 * LIT;
    ctx.drawImage(MOON_GLOW, x - r * 1.5, y - r * 1.3, r * 3, r * 2.6);
    ctx.fillStyle = 'rgb(236, 228, 208)';
    // each shard of light is a thin lens, the shape a ripple gives a reflection
    const glint = (x0, x1, yy, th, alpha) => {
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.ellipse((x0 + x1) / 2, yy, (x1 - x0) / 2 + th * 0.35, th / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    const rows = 5, pitch = r / (rows + 0.55);
    for (let i = -rows; i <= rows; i++) {
      const v = i / (rows + 0.7), low = Math.max(0, v);
      const chord = Math.sqrt(Math.max(0, 1 - v * v)) * r;
      // each band breathes and slides on its own, and the lower ones spread as they come toward you,
      // so the outline never settles into a circle
      const half = chord * (0.86 + 0.3 * noise(i * 1.7 + t * 0.3)) * (1 + low * 0.14);
      const off = ((noise(i * 0.9 - t * 0.2 + 40) - 0.5) * r * 0.3 + Math.sin(t * 0.8 + i * 0.85) * r * 0.04) * (1 + low * 0.9);
      const yy = y + i * pitch + (noise(i * 4.3 + t * 0.25) - 0.5) * pitch * 0.3;
      const th = pitch * (0.42 + 0.5 * noise(i * 3.1 + t * 0.4 + 9));
      let a = -half, b = half; // the lit span: right side while waxing, left side while waning
      if (PHASE < 0.5) a = half * (1 - 2 * LIT);
      else b = -half * (1 - 2 * LIT);
      const dark = 0.08 * (1 - 0.45 * v * v) * (0.65 + 0.7 * noise(i * 6.1 + t * 0.3));
      const lit = (0.2 + 0.2 * (1 - Math.abs(v))) * (0.72 + 0.5 * noise(i * 7.7 + t * 0.5));
      // walk the band in long shards with short breaks that wander, split where the terminator falls
      let px = -half;
      for (let j = 0; px < half && j < 6; j++) {
        const q = Math.min(half, px + r * (0.36 + 0.95 * noise(i * 3.3 + j * 1.9 + t * 0.12)));
        const l0 = Math.max(px, a), l1 = Math.min(q, b);
        if (l1 - l0 > r * 0.03) glint(x + l0 + off, x + l1 + off, yy, th, lit);
        if (px < a && a - px > r * 0.03) glint(x + px + off, x + Math.min(q, a) + off, yy, th * 0.85, dark);
        if (q > b && q - b > r * 0.03) glint(x + Math.max(px, b) + off, x + q + off, yy, th * 0.85, dark);
        px = q + pitch * (0.7 + 1.5 * noise(i * 5.9 + j * 2.7 - t * 0.1 + 20));
      }
    }
    ctx.strokeStyle = 'rgb(236, 228, 208)';
    ctx.lineCap = 'round';
    // a few stray glints that have slipped off the disc, and a short path of them toward the viewer
    ctx.lineWidth = r * 0.04;
    const shine = 0.1 + 0.34 * LIT;
    for (let j = 0; j < 11; j++) {
      const tw = noise(j * 13.3 + t * 0.34);
      if (tw < 0.52) continue;
      const below = j >= 5;
      const gx = x + (hash(j * 3.7) - 0.5) * r * (below ? 1.5 : 3.1) + Math.sin(t * 0.3 + j) * r * 0.05;
      const gy = below ? y + r * (1.25 + (j - 5) * 0.34) : y + (hash(j * 9.1) - 0.5) * r * 1.9;
      const gl = r * (0.07 + 0.12 * hash(j * 5.3));
      ctx.globalAlpha = (tw - 0.52) * 2 * shine * (below ? 1 - (j - 5) * 0.13 : 1);
      ctx.beginPath();
      ctx.moveTo(gx - gl, gy);
      ctx.lineTo(gx + gl, gy);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;
  }

  // a floating paper lantern seen from above: warm light pooling on the water, a few glints of it
  // breaking on the ripples, then the wooden frame and paper
  function drawLantern(l) {
    const V = L.vf, flicker = 0.86 + Math.sin(l.ph * 7.3) * 0.06 + Math.sin(l.ph * 12.7) * 0.04;
    if (glowOn) {
      ctx.globalAlpha = 0.62 * flicker * l.born;
      ctx.drawImage(LANTERN_GLOW, l.x - 64 * V, l.y - 56 * V, 128 * V, 124 * V);
    }
    ctx.strokeStyle = 'rgb(255, 190, 120)';
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.1 * V;
    for (let j = 0; j < 6; j++) {
      const tw = noise(l.seed + j * 11.1 + clock * 0.5);
      if (tw < 0.42) continue;
      const gx = l.x + (hash(l.seed + j * 2.3) - 0.5) * 34 * V, gy = l.y + (14 + j * 6.5) * V, gl = (2.5 + 5 * hash(l.seed + j)) * V;
      ctx.globalAlpha = (tw - 0.42) * 0.62 * l.born * (1 - j * 0.11);
      ctx.beginPath();
      ctx.moveTo(gx - gl, gy);
      ctx.lineTo(gx + gl, gy);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.rotate(l.rot + Math.sin(l.ph * 0.4) * 0.05);
    ctx.scale(V, V);
    ctx.globalAlpha = l.born;
    ctx.fillStyle = 'rgba(40, 18, 10, 0.92)';
    ctx.fillRect(-8, -8, 16, 16);
    ctx.fillStyle = `rgb(255, ${Math.round(192 + 26 * flicker)}, 138)`;
    ctx.fillRect(-6, -6, 12, 12);
    ctx.strokeStyle = 'rgba(120, 50, 20, 0.55)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-6, 0); ctx.lineTo(6, 0);
    ctx.moveTo(0, -6); ctx.lineTo(0, 6);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawBubbles() {
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = 'rgb(214, 224, 222)';
    for (const b of bubbles) {
      if (b.t < 0) continue;
      const u = b.t / b.dur, r = b.r * (1 + u * 0.6);
      ctx.globalAlpha = 0.34 * (1 - u);
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawFood() {
    ctx.fillStyle = '#e3b266';
    for (const f of food) {
      const a = clamp(1 - (f.age - f.life * 0.6) / (f.life * 0.4), 0, 1) * clamp(f.age / 0.25, 0, 1);
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      if (glowOn) ctx.drawImage(FOOD_GLOW, f.x - 8, f.y - 8, 16, 16);
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
    ctx.fillStyle = 'rgba(222, 196, 196, 0.86)';
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.beginPath(); ctx.ellipse(0, -R * 0.5, R * 0.22, R * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(244, 238, 228, 0.94)';
    for (let i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath(); ctx.ellipse(0, -R * 0.3, R * 0.15, R * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#d9a440';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawPad(p) {
    let lx = L.mx - p.x, ly = L.my - p.y;
    const ll = Math.hypot(lx, ly) || 1;
    lx /= ll;
    ly /= ll;
    // its shadow on the bed, thrown away from the moon
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(p.x - lx * p.r * 0.2, p.y - ly * p.r * 0.2 + p.r * 0.1, p.r, p.r * 0.97, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, p.r, p.notch, Math.PI * 2 - 0.04);
    ctx.closePath();
    ctx.fillStyle = '#0e2018';
    ctx.fill();
    ctx.strokeStyle = 'rgba(201, 164, 92, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(150, 190, 150, 0.065)';
    for (let a = p.notch + 0.45; a < Math.PI * 2 - 0.3; a += 0.55) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * p.r * 0.88, Math.sin(a) * p.r * 0.88);
      ctx.stroke();
    }
    // a lip of light on the rim that faces the moon
    const TAU = Math.PI * 2, la = (((Math.atan2(ly, lx) - p.rot) % TAU) + TAU) % TAU;
    const a0 = Math.max(p.notch, la - 0.7), a1 = Math.min(TAU - 0.04, la + 0.7);
    if (a1 > a0) {
      ctx.strokeStyle = `rgba(170, 206, 190, ${0.1 + 0.14 * LIT})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, p.r - 0.8, a0, a1);
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
      ctx.fillStyle = 'rgba(232, 194, 200, 0.78)';
      ctx.fill();
    } else {
      ctx.scale(l.s, l.s);
      ctx.globalAlpha = 0.86;
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

  // a ripple is lit on the arc that faces the moon and shadowed on the far side, so it reads as a
  // low wave rather than a drawn ring
  function drawRipples() {
    for (const r of ripples) {
      if (r.t < 0) continue;
      const u = r.t / r.dur, rad = (1 - Math.pow(1 - u, 3)) * r.max, fade = Math.pow(1 - u, 1.4) * (r.a ?? 1);
      if (rad < 1) continue;
      ctx.lineWidth = r.w;
      if (r.span) {
        ctx.strokeStyle = 'rgb(214, 222, 212)';
        ctx.globalAlpha = 0.2 * fade;
        ctx.beginPath();
        ctx.arc(r.x, r.y, rad, r.dir - r.span, r.dir + r.span);
        ctx.stroke();
        continue;
      }
      const la = Math.atan2(L.my - r.y, L.mx - r.x);
      ctx.strokeStyle = 'rgb(226, 226, 212)';
      ctx.globalAlpha = 0.085 * fade;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.26 * fade;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, la - 1, la + 1);
      ctx.stroke();
      ctx.strokeStyle = 'rgb(0, 0, 0)';
      ctx.globalAlpha = 0.3 * fade;
      ctx.beginPath();
      ctx.arc(r.x, r.y, Math.max(0.5, rad - 1.6), la + Math.PI - 1.15, la + Math.PI + 1.15);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawMist() {
    if (!glowOn) return;
    for (const m of mists) {
      ctx.globalAlpha = m.a;
      ctx.drawImage(MIST, m.x - m.r, m.y - m.r * 0.5, m.r * 2, m.r);
    }
    ctx.globalAlpha = 1;
  }

  // fireflies: mostly dark, with brief soft pulses
  function drawFireflies() {
    ctx.fillStyle = 'rgb(255, 244, 200)';
    for (const f of fireflies) {
      const b = Math.max(0, Math.sin(f.ph * 2.2)) ** 3;
      if (b < 0.02) continue;
      ctx.globalAlpha = b * 0.9;
      if (glowOn) ctx.drawImage(FIREFLY, f.x - 9, f.y - 9, 18, 18);
      ctx.fillRect(f.x - 0.8, f.y - 0.8, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;
  }

  const order = [];
  function render() {
    ctx.globalAlpha = 1;
    ctx.drawImage(bg, 0, 0, W, H);      // deep water
    drawCaustics();                      // light on the bed
    order.length = 0;
    for (const k of koi) order.push(k);
    order.sort((a, b) => b.d - a.d);
    for (const k of order) drawKoi(k, ctx); // deepest first
    drawMoon();                          // then what floats on the surface
    for (const l of lanterns) drawLantern(l);
    for (const p of pads) drawPad(p);
    for (const l of leaves) drawLeaf(l);
    drawFood();
    drawBubbles();
    drawRipples();
    drawMist();
    drawFireflies();
  }

  // ---------------------------------------------------------------- running, pausing, and staying cheap

  function applyQuality() {
    glowOn = quality < 2;
    if (quality >= 3) {
      while (koi.length > 5) {
        const i = koi.findIndex(k => k.role === 'deep');
        if (i < 0) break;
        koi.splice(i, 1);
      }
    }
    resize();
  }

  // motion is on unless the visitor asks for less, and the pause button overrides either way
  let choice = null;
  try {
    const saved = localStorage.getItem('pond-motion');
    if (saved === 'paused' || saved === 'playing') choice = saved;
  } catch (e) { /* storage can be blocked; the pond still runs */ }
  let sceneVisible = true, running = false, raf = 0;
  const wantsMotion = () => (choice ? choice === 'playing' : !reduce.matches);

  let last = 0, slowMs = 0, slowN = 0, slowStart = 0, fps = null, fpsMs = 0, fpsN = 0, started = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const ms = now - last;
    last = now;
    // a capture tool or a throttled tab can hand over a zero, negative or absurd step: skip those
    if (!(ms > 0) || !Number.isFinite(ms)) return;
    if (ms < 100) {
      fpsMs += ms;
      if (++fpsN >= 30) {
        const v = (1000 * fpsN) / fpsMs;
        if (Number.isFinite(v) && v > 0) fps = Math.round(v);
        fpsMs = 0;
        fpsN = 0;
      }
      if (now - started > 3000 && quality < 3 && !Number.isFinite(pinned)) {
        slowMs += ms;
        slowN++;
        if (now - slowStart > 2000) {
          if (slowN > 20 && slowMs / slowN > 21) { quality++; applyQuality(); }
          slowMs = 0;
          slowN = 0;
          slowStart = now;
        }
      }
    }
    if (causticFade < 1 && CAUSTIC) causticFade = Math.min(1, causticFade + ms / 2400);
    update(Math.min(0.05, ms / 1000));
    render();
  }

  function renderOnce() {
    if (!running && sceneVisible) render();
  }

  function sync() {
    const should = wantsMotion() && !document.hidden && sceneVisible;
    if (should && !running) {
      running = true;
      last = performance.now();
      started = slowStart = last;
      slowMs = slowN = fpsMs = fpsN = 0;
      raf = requestAnimationFrame(frame);
    } else if (!should && running) {
      running = false;
      cancelAnimationFrame(raf);
      fps = null;
    }
    root.classList.toggle('pond-still', !wantsMotion());
    dispatchEvent(new CustomEvent('pond:state'));
  }

  document.addEventListener('visibilitychange', sync);
  if (reduce.addEventListener) reduce.addEventListener('change', () => { sync(); renderOnce(); });

  // nothing to draw while the study covers the water
  const views = document.querySelectorAll('[data-pond-view]');
  if ('IntersectionObserver' in window && views.length) {
    const seen = new Set(views);
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) seen.add(e.target);
        else seen.delete(e.target);
      }
      const was = sceneVisible;
      sceneVisible = seen.size > 0;
      if (was !== sceneVisible) { sync(); renderOnce(); }
    }, { rootMargin: '120px 0px' });
    views.forEach(v => io.observe(v));
  }

  let resizeQueued = false;
  function onResize() {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      // sizing a canvas clears it, so a report of the size it already has must leave it alone:
      // a still pond has no next frame to paint it back
      const box = cv.getBoundingClientRect();
      if (Math.round(box.width) === W && Math.round(box.height) === H && stackedMq.matches === L.stacked && (window.devicePixelRatio || 1) === rawDpr) return;
      resize();
      place();
      for (const k of koi) { k.x = clamp(k.x, -40, W + 40); k.y = clamp(k.y, -40, H + 40); }
      dispatchEvent(new CustomEvent('pond:compose'));
      renderOnce();
    });
  }
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(cv);
  else addEventListener('resize', onResize);
  // the name's width changes when the display font arrives, and the composition follows it
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      compose();
      paintBackground();
      place();
      dispatchEvent(new CustomEvent('pond:compose'));
      renderOnce();
    });
  }

  // let the koi settle into their curves before the first frame is shown
  applyQuality();
  warm = true;
  for (let i = 0; i < 50; i++) update(1 / 30);
  warm = false;
  render();
  root.classList.add('pond-ready');
  sync();
  dispatchEvent(new CustomEvent('pond:compose'));
  (window.requestIdleCallback || (fn => setTimeout(fn, 60)))(buildCaustics);

  window.pond = {
    feed: () => feed(),
    stats: () => ({
      koi: koi.length, fed, eaten, golden: goldSpawned, fps: Number.isFinite(fps) ? fps : null, quality,
      lanterns: lanterns.length, dpr: DPR, running, visible: sceneVisible, size: `${W}x${H}`, raining,
    }),
    rain: () => {
      if (!wantsMotion()) { dispatchEvent(new CustomEvent('pond:still')); return null; }
      raining = !raining;
      return raining;
    },
    quality: () => quality,
    lantern: () => {
      const ok = addLantern();
      if (ok) pluck(SCALE[7], 0.06);
      return ok;
    },
    rest: () => {
      if (!wantsMotion()) { dispatchEvent(new CustomEvent('pond:still')); return false; }
      gatherUntil = performance.now() + 6000;
      bell();
      return true;
    },
    scatter: () => {
      scatterUntil = performance.now() + 1500;
      ripples.push({ x: L.fx, y: L.fy, t: 0, dur: 1.9, max: 130 * L.vf, w: 1.2, a: 1 });
    },
    // one ripple somewhere in the open water (the terminal's ping)
    ripple: () => {
      if (!wantsMotion()) return false;
      const [x, y] = openWater();
      ripples.push({ x, y, t: 0, dur: 2.2, max: 72 * L.vf, w: 1.1, a: 1 });
      return true;
    },
    // call the great carp without waiting for it
    summon: () => {
      if (goldSpawned || !wantsMotion()) return false;
      goldPending = true;
      return true;
    },
    quantize: ms => quantize(ms),
    bell: f => bell(f),
    moon: () => ({ phase: PHASE, lit: LIT }),
    layout: () => ({ ...L, quiet: { ...L.quiet }, width: W, height: H }),
    sound: on => {
      soundOn = !!on;
      if (soundOn && ensureAudio()) pluck(SCALE[4]);
      return soundOn;
    },
    soundOn: () => soundOn,
    // pause(true) stills the pond, pause(false) wakes it; either is remembered for the next visit
    pause: on => {
      choice = on ? 'paused' : 'playing';
      try { localStorage.setItem('pond-motion', choice); } catch (e) { /* not remembered, still applied */ }
      sync();
      renderOnce();
      return !wantsMotion();
    },
    paused: () => !wantsMotion(),
    running: () => running,
  };
})();
