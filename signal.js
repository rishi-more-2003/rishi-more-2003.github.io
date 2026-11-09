// signal.js: redraws a picture as a grid of monospace glyphs in webgl, with a lens that shows the
// true image around the cursor and a pulse that scrambles the text as it passes through.
// window.createSignal(canvas) returns null when webgl isn't there, so the caller can draw plainly.
(() => {
  const SETS = {
    ascii: ' .,:-=+*oxO#%@',
    binary: ' .:01',
    blocks: ' ·░▒▓█', // · ░ ▒ ▓ █
    kanji: ' ・一二三水林森鯉', // ・ 一 二 三 水 林 森 鯉, light to dense
  };
  const MONO = 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace';
  const CJK = '"Yu Mincho", YuMincho, "Hiragino Mincho ProN", "Noto Serif JP", "Noto Serif CJK JP", "MS Mincho", serif';

  const VERT = 'attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }';

  const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uScene;
uniform sampler2D uAtlas;
uniform vec2 uRes;
uniform float uCell;
uniform float uGlyphs;
uniform vec2 uLens;
uniform float uLensR;
uniform vec2 uPtr;
uniform float uGlowR;
uniform vec2 uRingC;
uniform float uRing;
uniform float uRingAmp;
uniform float uTime;
uniform float uFlicker;
uniform vec3 uInk;
uniform vec3 uHot;
uniform vec3 uRim;

float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 size = vec2(uCell * 0.6, uCell);
  vec2 id = floor(frag / size);
  vec2 local = fract(frag / size);
  vec2 center = (id + 0.5) * size;

  vec3 sc = texture2D(uScene, center / uRes).rgb;
  float lum = dot(sc, vec3(0.299, 0.587, 0.114));
  float level = smoothstep(0.03, 0.8, lum);

  float glow = uGlowR > 0.5 ? 1.0 - smoothstep(uGlowR * 0.7, uGlowR * 2.4, length(center - uPtr)) : 0.0;
  float rd = (length(center - uRingC) - uRing) / (uCell * 3.5);
  float ring = uRingAmp * exp(-rd * rd);

  float tick = floor(uTime * 12.0);
  float scramble = step(1.0 - clamp(ring + uFlicker * level * 0.05, 0.0, 1.0), hash(id + tick * 0.73));

  float idx = floor(clamp(level + glow * 0.08, 0.0, 1.0) * (uGlyphs - 1.0) + 0.5);
  idx = max(idx, step(0.02, lum)); // open water still reads as a field of dots
  idx = mix(idx, 1.0 + floor(hash(id * 1.31 + tick) * (uGlyphs - 1.0)), scramble);

  float ink = texture2D(uAtlas, vec2((idx + local.x) / uGlyphs, local.y)).r;
  float heat = clamp(glow * 0.55 + ring * 1.3 + scramble * 0.45, 0.0, 1.0);
  vec3 tint = mix(mix(uInk, sc * 1.45 + 0.06, 0.62), uHot, heat); // glyphs keep the colour of what they draw
  vec3 col = vec3(0.014, 0.016, 0.015) + tint * ink * (0.24 + level * 0.95 + glow * 0.2);

  if (uLensR > 0.5) {
    vec2 v = frag - uLens;
    float dl = length(v);
    float inside = 1.0 - smoothstep(uLensR - 1.5, uLensR + 1.5, dl);
    if (inside > 0.0) {
      vec2 uv = frag / uRes;
      vec2 off = (v / max(dl, 0.001)) * smoothstep(uLensR * 0.6, uLensR, dl) * 5.0 / uRes;
      vec3 real = vec3(texture2D(uScene, uv - off).r, texture2D(uScene, uv).g, texture2D(uScene, uv + off).b);
      col = mix(col, real, inside);
    }
    col += uRim * (1.0 - smoothstep(0.0, 1.8, abs(dl - uLensR))) * 0.85;
  }

  gl_FragColor = vec4(col, 1.0);
}`;

  const UNIFORMS = ['uScene', 'uAtlas', 'uRes', 'uCell', 'uGlyphs', 'uLens', 'uLensR', 'uPtr', 'uGlowR',
    'uRingC', 'uRing', 'uRingAmp', 'uTime', 'uFlicker', 'uInk', 'uHot', 'uRim'];

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function texture(gl) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  window.createSignal = canvas => {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'high-performance' });
    if (!gl) return null;
    let u = {}, sceneTex = null, atlasTex = null, set = 'ascii', atlasPx = 40, size = null, lost = false;

    // one row of glyph cells, white on black, rebuilt only when the set or the cell size changes
    function buildAtlas() {
      const chars = [...SETS[set]];
      const ch = atlasPx, cw = Math.round(ch * 0.6);
      const c = document.createElement('canvas');
      c.width = cw * chars.length;
      c.height = ch;
      const g = c.getContext('2d');
      g.fillStyle = '#000';
      g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = set === 'kanji' ? `${Math.round(ch * 0.58)}px ${CJK}` : `500 ${Math.round(ch * 0.8)}px ${MONO}`;
      chars.forEach((chr, i) => g.fillText(chr, i * cw + cw / 2, ch / 2 + ch * 0.04));
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.uniform1f(u.uGlyphs, chars.length);
    }

    function init() {
      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // one triangle covers the screen
      const loc = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      u = Object.fromEntries(UNIFORMS.map(n => [n, gl.getUniformLocation(prog, n)]));
      gl.uniform1i(u.uScene, 0);
      gl.uniform1i(u.uAtlas, 1);
      gl.uniform3f(u.uInk, 0.925, 0.894, 0.831);
      gl.uniform3f(u.uHot, 0.88, 0.7, 0.4);
      gl.uniform3f(u.uRim, 0.84, 0.25, 0.15);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // canvases are top-down, gl is bottom-up
      sceneTex = texture(gl);
      atlasTex = texture(gl);
      if (size) {
        gl.viewport(0, 0, size[0], size[1]);
        gl.uniform2f(u.uRes, size[0], size[1]);
      }
      buildAtlas();
    }

    try {
      init();
    } catch (err) {
      console.warn('[signal] webgl setup failed', err);
      return null;
    }
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; });
    canvas.addEventListener('webglcontextrestored', () => {
      try { init(); lost = false; } catch (err) { console.warn('[signal] could not restore', err); }
    });

    return {
      setGlyphs(next) {
        if (!SETS[next]) return false;
        set = next;
        if (!lost) buildAtlas();
        return true;
      },
      resize(w, h, cellPx) {
        size = [w, h];
        if (lost) return;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(u.uRes, w, h);
        const px = Math.max(24, Math.min(64, Math.round(cellPx * 2)));
        if (px !== atlasPx) {
          atlasPx = px;
          buildAtlas();
        }
      },
      draw(scene, v) {
        if (lost) return;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, atlasTex);
        gl.uniform1f(u.uCell, v.cell);
        gl.uniform2f(u.uLens, v.lensX, v.lensY);
        gl.uniform1f(u.uLensR, v.lensR);
        gl.uniform2f(u.uPtr, v.ptrX, v.ptrY);
        gl.uniform1f(u.uGlowR, v.glowR);
        gl.uniform2f(u.uRingC, v.ringX, v.ringY);
        gl.uniform1f(u.uRing, v.ring);
        gl.uniform1f(u.uRingAmp, v.ringAmp);
        gl.uniform1f(u.uTime, v.time);
        gl.uniform1f(u.uFlicker, v.flicker);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    };
  };
})();
