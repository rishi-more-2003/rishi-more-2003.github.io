// the terminal: a real input, a handful of commands, and a line to the pond.
(() => {
  const term = document.getElementById('term');
  const screen = document.getElementById('screen');
  const out = document.getElementById('out');
  const form = document.getElementById('prompt');
  const input = document.getElementById('cmd');
  const sections = document.getElementById('sections');
  if (!term || !screen || !out || !form || !input) return;

  const root = document.documentElement;
  const touch = matchMedia('(pointer: coarse)').matches;
  const banner = out.querySelector('.banner').cloneNode(true);
  const history = [];
  let cursor = 0;
  // the canvas has id="pond", so window.pond is that element until pond.js swaps in the api
  const pond = () => (window.pond && typeof window.pond.feed === 'function' ? window.pond : null);

  const files = {
    'about.md': 'about',
    'research.md': 'research',
    'projects.md': 'projects',
    'experience.md': 'experience',
    'skills.md': 'skills',
    'fun.md': 'fun',
    'contact.txt': 'contact',
    'resume.pdf': 'resume',
  };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  const append = node => out.appendChild(node);
  const print = (text, cls) => append(el('div', 'line' + (cls ? ' ' + cls : ''), text));
  const scrollDown = () => { screen.scrollTop = screen.scrollHeight; };

  function ps1() {
    const s = el('span');
    s.append(el('span', 'ps1', 'rishi@koi'), ' ', el('span', 'path', '~'), ' % ');
    return s;
  }
  function echo(text) {
    const d = el('div', 'line');
    d.append(ps1(), text); // typed text goes in as a text node, never as html
    append(d);
  }
  function link(href, text) {
    const a = el('a', null, text);
    a.href = href;
    return a;
  }
  function cmdButton(cmd, label) {
    const b = el('button', 'cmdlink', label || cmd);
    b.type = 'button';
    b.dataset.cmd = cmd;
    return b;
  }
  function facts(rows) {
    const dl = el('dl', 'facts');
    for (const [k, v] of rows) {
      const dd = el('dd');
      dd.append(v);
      dl.append(el('dt', null, k), dd);
    }
    append(dl);
  }

  const commands = {
    help:       ['list commands', help],
    about:      ['who i am, in one breath', about],
    research:   ['papers', () => section('research')],
    projects:   ['things i built', () => section('projects')],
    experience: ['where i have worked', () => section('experience')],
    skills:     ['what i work with', skills],
    fun:        ['off the keyboard', () => section('fun')],
    resume:     ['open my resume', resume],
    contact:    ['how to reach me', contact],
    feed:       ['drop food for the koi', feed],
    lantern:    ['set a lantern on the water', lantern],
    rest:       ["rest at the sculptor's idol", rest],
    moon:       ["tonight's moon", moon],
    fortune:    ['a line of pond wisdom', fortune],
    sound:      ['koto plucks when koi eat (on/off)', sound],
    rain:       ['let it rain on the pond', rain],
    koi:        ['pond stats', koiStats],
    ls:         ['list files', ls],
    cat:        ['read a file', cat],
    clear:      ['wipe the screen', clear],
  };

  const secret = {
    whoami: () => print('rishi'),
    pwd: () => print('/home/rishi/pond'),
    date: () => print(new Date().toString()),
    echo: args => print(args.join(' ')),
    hi: () => print('hi :) try help.'),
    hello: () => print('hello :) try help.'),
    sudo: () => print('nice try. this incident will be reported to the koi.', 'err'),
    rm: args => (/^-(rf|fr)$/.test(args[0] || '') && /^(\/|~|\*|\.)/.test(args[1] || '')
      ? die()
      : print('permission denied: the koi are load-bearing.', 'err')),
    exit: () => print('there is no exit. only koi.', 'muted'),
    vim: () => print('you are now in vim. kidding. type :q to leave anyway.', 'muted'),
    ':q': () => print('see? easy.', 'muted'),
    sekiro: () => print('hesitation burns tokens.', 'fortune'),
    history: showHistory,
    screenfetch,
    'nvidia-smi': nvidiaSmi,
  };

  const FORTUNES = [
    'the koi does not chase every pellet. neither should your gradient.',
    'a model that knows when to stop thinking is wiser than one that never does.',
    'quantize the weights, never the patience.',
    'the memory wall is not climbed. it is routed around.',
    'fall seven times, fine-tune eight.',
    'still water profiles best.',
    'even the great carp was once a pellet-chaser.',
    'a reward model is only as honest as its labelers.',
    'batch size one is a lonely road. the kernel walks it anyway.',
    'hesitation burns tokens.',
  ];
  const PHASES = ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon', 'waning gibbous', 'last quarter', 'waning crescent'];

  function help() {
    const grid = el('div', 'help');
    for (const [name, [desc]] of Object.entries(commands)) grid.append(cmdButton(name), el('span', 'muted', desc));
    append(grid);
    print('up/down walks history · tab completes · a few commands are hidden, and one of them is deadly.', 'muted');
  }

  function about() {
    print("hi, i'm rishi. i teach llms to behave, then make them fast.");
    facts([
      ['behave', 'rlhf on qwen2.5-32b with clinician preference data at intersystems, 93% on a clinician-workflow golden set.'],
      ['fast', "conformal thinking (icml 2026, with apple ml research): reasoning models that stop once they're sure. 12% fewer tokens, same accuracy."],
      ['faster', 'int4 kv-cache attention in triton, up to 27x faster than pytorch at 128k context.'],
    ]);
    print('m.s.e. cs @ johns hopkins. based in sunnyvale.', 'muted');
  }

  function skills() {
    facts([
      ['code', 'python, c++, cuda c++, c, sql, bash'],
      ['ml', 'pytorch, triton, vllm, transformers, fastapi'],
      ['gpu', 'cuda, cublas, nsight, roofline analysis, kernel fusion, int4/int8 quantization, kv cache'],
      ['infra', 'linux, docker, github actions, aws, prometheus, grafana'],
    ]);
  }

  function section(name) {
    const src = sections && sections.querySelector(`[data-section="${name}"]`);
    if (!src) return print(`${name}: not found`, 'err');
    const copy = src.cloneNode(true);
    copy.removeAttribute('data-section');
    copy.className = 'md';
    append(copy);
  }

  function resume() {
    print('opening ').append(link('resume_mle.pdf', 'resume_mle.pdf'));
    window.open('resume_mle.pdf', '_blank', 'noopener');
  }

  function contact() {
    facts([
      ['email', link('mailto:rmore2@jhu.edu', 'rmore2@jhu.edu')],
      ['github', link('https://github.com/rishi-more-2003', 'rishi-more-2003')],
      ['linkedin', link('https://linkedin.com/in/rishimore102', 'rishimore102')],
      ['scholar', link('https://scholar.google.com/citations?user=xUxO6r0AAAAJ&hl=en', 'google scholar')],
    ]);
  }

  function feed(args) {
    const p = pond();
    if (!p) return print('the pond is asleep.', 'muted');
    const n = Math.min(5, Math.max(1, parseInt(args[0], 10) || 1));
    for (let i = 0; i < n; i++) p.feed();
    print(n === 1 ? 'you scatter a handful of food. the koi noticed.' : `you scatter ${n} handfuls. chaos.`, 'muted');
  }

  function lantern() {
    const p = pond();
    if (!p) return print('the pond is asleep.', 'muted');
    p.lantern();
    print('you set a paper lantern on the water. it drifts toward the moon.', 'muted');
  }

  function rest() {
    const p = pond();
    if (!p) return print('the pond is asleep.', 'muted');
    p.rest();
    root.classList.add('resting');
    setTimeout(() => root.classList.remove('resting'), 3200);
    print("you rest at the sculptor's idol. the koi gather around you.", 'muted');
  }

  function moon() {
    const p = pond();
    if (!p) return print('clouds cover the sky.', 'muted');
    const { phase, lit } = p.moon();
    print(lit < 0.03
      ? 'tonight: new moon. only earthshine on the water.'
      : `tonight: ${PHASES[Math.round(phase * 8) % 8]}, ${Math.round(lit * 100)}% lit. the one on the water matches.`);
  }

  function fortune() {
    print(FORTUNES[Math.floor(Math.random() * FORTUNES.length)], 'fortune');
  }

  function sound(args) {
    const p = pond();
    if (!p) return print('the pond is asleep.', 'muted');
    const on = args[0] ? args[0] !== 'off' : !p.soundOn();
    p.sound(on);
    print(on ? 'sound on. listen when they eat.' : 'sound off.', 'muted');
  }

  function koiStats() {
    const p = pond();
    if (!p) return print('the pond is asleep.', 'muted');
    const s = p.stats();
    facts([
      ['koi', String(s.koi)],
      ['fed', `${s.fed} time${s.fed === 1 ? '' : 's'}`],
      ['eaten', `${s.eaten} pellet${s.eaten === 1 ? '' : 's'}`],
      ['great', s.golden ? 'carp sighted' : '???'],
    ]);
  }

  function rain() {
    const p = pond();
    if (!p) return print('the pond is asleep.', 'muted');
    print(p.rain() ? 'it starts to rain on the pond.' : 'the rain stops.', 'muted');
  }

  function ls() {
    const d = el('div', 'line ls');
    for (const f of Object.keys(files)) d.append(cmdButton(`cat ${f}`, f), ' ');
    append(d);
  }

  function cat(args) {
    const f = args[0];
    if (!f) return print('usage: cat <file>   (try ls)', 'muted');
    const target = files[f] || files[f + '.md'];
    if (!target) return print(`cat: ${f}: no such file`, 'err');
    commands[target][1]([]);
  }

  function screenfetch() {
    const b = banner.cloneNode(true);
    const h1 = b.querySelector('h1');
    if (h1) h1.replaceWith(el('div', 'name', h1.textContent));
    append(b);
  }

  function showHistory() {
    history.forEach((c, i) => print(`${String(i + 1).padStart(4)}  ${c}`, 'muted'));
  }

  function clear() {
    out.replaceChildren();
  }

  // rm -rf /: the death screen, then a resurrection
  function die() {
    const p = pond();
    if (p) { p.scatter(); p.bell(55); }
    const d = el('div', 'death');
    d.setAttribute('aria-hidden', 'true');
    d.innerHTML = '<div class="death-mark"><div class="death-kanji">死</div><div class="death-word">death</div></div>'
      + '<div class="revive"><div class="revive-kanji">回生</div><div class="revive-word">resurrection</div></div>';
    const done = () => d.remove();
    d.addEventListener('animationend', e => { if (e.target === d && e.animationName === 'death-out') done(); });
    d.addEventListener('click', done);
    setTimeout(done, 6000);
    document.body.append(d);
    clear();
    screenfetch();
    print('you died. then you got back up. go easy on the filesystem.', 'muted');
  }

  function nvidiaSmi() {
    const p = pond();
    const s = p ? p.stats() : { koi: 0, eaten: 0 };
    const row = (l, r) => '| ' + l.padEnd(44) + r.padEnd(9) + '|';
    const pre = el('pre', 'smi');
    pre.textContent = [
      '+------------------------------------------------------+',
      '| NVIDIA-SMI 575.64        Driver: koi   CUDA: 12.9    |',
      '|-----------------------------+------------------------|',
      '| GPU  Name        Temp  Perf | Memory-Usage    Util   |',
      '|   0  RTX 4070 L   41C   P8  |  512 / 8188 MiB   3%   |',
      '+------------------------------------------------------+',
      row('PID   Process', 'GPU Mem'),
      row(`1337  koi-pond (${s.koi} koi, ${s.eaten} eaten)`, '512MiB'),
      '+------------------------------------------------------+',
    ].join('\n');
    append(pre);
  }

  function distance(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return dp[a.length][b.length];
  }

  function notFound(name) {
    print(`zsh: command not found: ${name}`, 'err');
    const guess = Object.keys(commands).find(c => distance(c, name.toLowerCase()) <= 2);
    if (guess) print('did you mean ').append(cmdButton(guess), '?');
    else print('type help for the list.', 'muted');
  }

  function run(raw) {
    const line = raw.trim();
    echo(raw);
    if (line) history.push(line);
    cursor = history.length;
    if (line) {
      const [name, ...args] = line.split(/\s+/);
      const key = name.toLowerCase();
      if (commands[key]) commands[key][1](args);
      else if (secret[key]) secret[key](args);
      else notFound(name);
    }
    scrollDown();
  }

  function complete() {
    const v = input.value.replace(/^\s+/, '');
    const m = v.match(/^cat\s+(\S*)$/i);
    if (!m && /\s/.test(v)) return;
    const pool = m ? Object.keys(files) : Object.keys(commands);
    const stem = m ? m[1] : v.toLowerCase();
    const hits = pool.filter(p => p.startsWith(stem));
    if (hits.length === 1) {
      input.value = m ? `cat ${hits[0]}` : `${hits[0]} `;
    } else if (hits.length > 1) {
      echo(input.value);
      print(hits.join('  '), 'muted');
      scrollDown();
    }
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    run(input.value);
    input.value = '';
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!history.length) return;
      e.preventDefault();
      cursor = Math.max(0, Math.min(history.length, cursor + (e.key === 'ArrowUp' ? -1 : 1)));
      input.value = history[cursor] ?? '';
      requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
    } else if (e.key === 'Tab' && !e.shiftKey && input.value.trim()) {
      // only with something typed, so tab still moves focus out of an empty prompt
      e.preventDefault();
      complete();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      clear();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'c' && !getSelection().toString()) {
      e.preventDefault();
      echo(input.value + '^C');
      input.value = '';
      scrollDown();
    }
  });

  document.addEventListener('click', e => {
    const b = e.target.closest('button[data-cmd]');
    if (b) {
      run(b.dataset.cmd);
      if (!touch) input.focus({ preventScroll: true });
      return;
    }
    if (term.contains(e.target) && !e.target.closest('a, input') && !getSelection().toString()) {
      input.focus({ preventScroll: true });
    }
  });

  addEventListener('pond:golden', () => {
    print('a great carp rises from the deep.', 'gold');
    scrollDown();
  });

  if (!touch) input.focus({ preventScroll: true });
})();
