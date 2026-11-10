// the terminal: a dialog with a real prompt, a handful of commands, and a line to the pond.
// what it prints about work, experience and contact is read from the page itself, so the two cannot drift.
(() => {
  const dialog = document.getElementById('terminal');
  const screen = document.getElementById('screen');
  const out = document.getElementById('out');
  const form = document.getElementById('prompt');
  const input = document.getElementById('cmd');
  const keys = document.getElementById('term-keys');
  const openers = [...document.querySelectorAll('[data-term-open]')];
  if (!dialog || !dialog.showModal || !screen || !out || !form || !input) {
    openers.forEach(b => { b.hidden = true; });
    return;
  }

  const root = document.documentElement;
  const coarse = matchMedia('(pointer: coarse)');
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
  const history = [];
  let cursor = 0, opener = null, booted = false;
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
  // text straight off the page
  const read = (sel, from = document) => {
    const e = from.querySelector(sel);
    return e ? e.textContent.replace(/\s+/g, ' ').trim() : '';
  };

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
  // links leave the page in a new tab, except mail
  function link(href, text) {
    const a = el('a', null, text);
    a.href = href;
    if (!/^mailto:/i.test(href)) {
      a.target = '_blank';
      a.rel = 'noopener';
    }
    return a;
  }
  function cmdButton(cmd, label) {
    const b = el('button', 'cmdlink', label || cmd);
    b.type = 'button';
    b.dataset.cmd = cmd;
    return b;
  }
  function facts(rows, cls) {
    const dl = el('dl', 't-facts' + (cls ? ' ' + cls : ''));
    for (const [k, v] of rows) {
      const dd = el('dd');
      dd.append(v);
      dl.append(el('dt', null, k), dd);
    }
    append(dl);
    return dl;
  }

  // name, what it does when run, and which row of buttons it sits in
  const commands = {
    about:      ['who i am, in one breath', about, 'read'],
    research:   ['papers', () => listing('research', 'research'), 'read'],
    projects:   ['things i built', () => listing('side projects', 'project'), 'read'],
    experience: ['where i have worked', experience, 'read'],
    skills:     ['what i work with', skills, 'read'],
    fun:        ['off the keyboard', fun, 'read'],
    contact:    ['how to reach me', contact, 'read'],
    resume:     ['open my resume', resume, 'read'],
    feed:       ['drop food for the koi', feed, 'pond'],
    lantern:    ['set a lantern on the water', lantern, 'pond'],
    rain:       ['let it rain on the pond', rain, 'pond'],
    rest:       ["rest at the sculptor's idol", rest, 'pond'],
    moon:       ["tonight's moon", moon, 'pond'],
    koi:        ['pond stats', koiStats, 'pond'],
    fortune:    ['a line of pond wisdom', fortune, 'pond'],
    sound:      ['koto plucks when koi eat (on/off)', sound, 'pond'],
    pause:      ['hold the pond still, or wake it', pause, 'pond'],
    help:       ['list commands', help, 'shell'],
    ls:         ['list files', ls, 'shell'],
    cat:        ['read a file', cat, null],
    clear:      ['wipe the screen', clear, 'shell'],
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
    exit: () => print('there is no exit. only koi. (esc closes the terminal, though.)', 'muted'),
    vim: () => print('you are now in vim. kidding. type :q to leave anyway.', 'muted'),
    ':q': () => print('see? easy.', 'muted'),
    sekiro: () => print('hesitation burns tokens.', 'fortune'),
    play: () => pause(['off']),
    debug: () => {
      dispatchEvent(new CustomEvent('site:debug'));
      print('diagnostics toggled (bottom left).', 'muted');
    },
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
    // each line is the page's own sentence about that piece of work, named by where it happened
    const line = key => {
      const e = document.querySelector(`[data-about="${key}"]`);
      if (!e) return '';
      const host = e.closest('[data-entry], [data-exp]');
      const who = host ? read('[data-name], [data-org]', host) : '';
      return (who ? `${who}: ` : '') + e.textContent.replace(/\s+/g, ' ').trim();
    };
    facts(['behave', 'fast', 'faster'].map(k => [k, line(k)]).filter(([, v]) => v));
    const uni = read('[data-fact="uni"]'), base = read('[data-fact="base"]');
    if (uni || base) print([uni, base && `based in ${base}`].filter(Boolean).join('. ') + '.', 'muted');
  }

  function skills() {
    facts([
      ['code', 'python, c++, cuda c++, c, sql, bash'],
      ['ml', 'pytorch, triton, vllm, transformers, fastapi'],
      ['gpu', 'cuda, cublas, nsight, roofline analysis, kernel fusion, int4/int8 quantization, kv cache'],
      ['infra', 'linux, docker, github actions, aws, prometheus, grafana'],
    ]);
  }

  // a markdown-looking list, built from whatever the page shows under that heading
  function block(title, items) {
    if (!items.length) return print(`${title}: not found`, 'err');
    const box = el('section', 'md'), ul = el('ul');
    box.append(el('h3', null, title), ul);
    for (const parts of items) {
      const li = el('li');
      li.append(...parts);
      ul.append(li);
    }
    append(box);
  }

  function listing(title, kind) {
    block(title, [...document.querySelectorAll(`[data-entry][data-kind="${kind}"]`)].map(e => {
      const name = read('[data-name]', e), blurb = read('[data-blurb]', e), a = e.querySelector('[data-link]');
      return [a ? link(a.href, name) : name, ' ', el('span', 'muted', blurb)];
    }));
  }

  function experience() {
    block('experience', [...document.querySelectorAll('[data-exp]')].map(e => [
      `${read('[data-when]', e)} @ ${read('[data-org]', e)} `, el('span', 'muted', read('[data-role]', e)),
    ]));
  }

  function fun() {
    block('fun', [...document.querySelectorAll('[data-fun]')].map(e => [
      `${read('[data-name]', e)} `, el('span', 'muted', read('[data-meta]', e)),
    ]));
  }

  const resumeHref = () => {
    const a = document.querySelector('[data-contact="resume"]');
    return a ? a.getAttribute('href') : 'resume_mle.pdf';
  };

  function resume() {
    const href = resumeHref();
    print('opening ').append(link(href, href));
    window.open(href, '_blank', 'noopener');
  }

  function contact() {
    const rows = [...document.querySelectorAll('[data-contact]')].map(a => [a.dataset.contact, link(a.getAttribute('href'), a.dataset.handle || a.textContent.trim())]);
    if (!rows.length) return print('contact: not found', 'err');
    facts(rows);
  }

  const asleep = () => print('the pond is asleep.', 'muted');
  const still = () => print('the pond is paused. type play to wake it.', 'muted');
  // the pond is only on screen at the top and the bottom of the page
  const unseen = p => {
    if (!p.stats().visible) print('the pond is out of view right now. scroll to the top or the bottom to watch.', 'muted');
  };

  function feed(args) {
    const p = pond();
    if (!p) return asleep();
    const n = Math.min(5, Math.max(1, parseInt(args[0], 10) || 1));
    let ok = false;
    for (let i = 0; i < n; i++) ok = p.feed() || ok;
    if (!ok) return still();
    print(n === 1 ? 'you scatter a handful of food. the koi noticed.' : `you scatter ${n} handfuls. chaos.`, 'muted');
    unseen(p);
  }

  function lantern() {
    const p = pond();
    if (!p) return asleep();
    if (!p.lantern()) return still();
    print('you set a paper lantern on the water. it drifts toward the moon.', 'muted');
    unseen(p);
  }

  function rest() {
    const p = pond();
    if (!p) return asleep();
    if (!p.rest()) return still();
    root.classList.add('resting');
    setTimeout(() => root.classList.remove('resting'), 3200);
    print("you rest at the sculptor's idol. the koi gather around you.", 'muted');
    unseen(p);
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
    if (!p) return asleep();
    const on = args[0] ? args[0] !== 'off' : !p.soundOn();
    p.sound(on);
    print(on ? 'sound on. listen when they eat.' : 'sound off.', 'muted');
  }

  // pause, pause on, pause off (and play, which is pause off)
  function pause(args) {
    const p = pond();
    if (!p) return asleep();
    const on = args[0] ? args[0] !== 'off' : !p.paused();
    p.pause(on);
    print(on ? 'the pond holds still.' : 'the pond wakes.', 'muted');
  }

  function koiStats() {
    const p = pond();
    if (!p) return asleep();
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
    if (!p) return asleep();
    const on = p.rain();
    if (on == null) return still();
    print(on ? 'it starts to rain on the pond.' : 'the rain stops.', 'muted');
    unseen(p);
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

  // the page's own identity, echoed back the way a shell would print it
  function screenfetch() {
    const b = el('section', 't-banner');
    const plate = el('div', 't-nameplate');
    const h1 = document.querySelector('.name');
    const sig = el('span', 't-sig', read('.sig'));
    sig.lang = 'ja';
    plate.append(el('div', 't-name', h1 && h1.firstChild ? h1.firstChild.textContent.trim() : 'rishi'), sig);
    b.append(plate, el('p', 't-tagline', read('.tagline')));
    append(b);
    const rows = [...document.querySelectorAll('.facts > div')].map(d => [read('dt', d), read('dd', d)]);
    if (rows.length) b.append(facts(rows));
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
    d.addEventListener('click', e => { e.stopPropagation(); done(); });
    setTimeout(done, 6000);
    dialog.append(d); // inside the dialog, which is the only thing above it
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
      if (Object.hasOwn(commands, key)) commands[key][1](args);
      else if (Object.hasOwn(secret, key)) secret[key](args);
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

  // every command as a button, in three rows that wrap. nothing scrolls off the edge
  const pauseKeys = [];
  if (keys) {
    for (const group of ['read', 'pond', 'shell']) {
      const row = el('div', 'keys'), label = el('span', 'keys__label', group);
      label.id = `keys-${group}`;
      const set = el('div', 'keys__set');
      row.setAttribute('role', 'group');
      row.setAttribute('aria-labelledby', label.id);
      row.append(label, set);
      for (const [name, [desc, , g]] of Object.entries(commands)) {
        if (g !== group) continue;
        const b = el('button', null, name);
        b.type = 'button';
        b.dataset.cmd = name;
        b.title = desc;
        if (name === 'pause') pauseKeys.push(b);
        set.append(b);
      }
      keys.append(row);
    }
  }
  const labelPause = () => {
    const p = pond();
    for (const b of pauseKeys) b.textContent = p && p.paused() ? 'play' : 'pause';
  };
  addEventListener('pond:state', labelPause);

  // ---------------------------------------------------------------- opening and closing

  // on a phone the sheet is sized to the part of the screen the keyboard leaves visible
  const vv = window.visualViewport;
  function fit() {
    if (!vv || !dialog.open) return;
    dialog.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    dialog.style.setProperty('--vvt', `${Math.round(vv.offsetTop)}px`);
  }
  if (vv) {
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
  }

  function open(from, instant) {
    if (dialog.open) return;
    opener = from && from !== document.body ? from : null;
    dialog.classList.toggle('is-instant', !!instant); // from the keyboard it simply appears
    dialog.showModal();
    openers.forEach(b => b.setAttribute('aria-expanded', 'true'));
    if (!booted) {
      booted = true;
      echo('screenfetch');
      screenfetch();
      const tip = print('type ', 'muted');
      tip.append(cmdButton('help'), ' to look around, or use the buttons below.');
    }
    labelPause();
    fit();
    // a phone keeps its keyboard down until the prompt is tapped, so there the dialog itself takes focus
    if (coarse.matches) dialog.focus({ preventScroll: true });
    else input.focus({ preventScroll: true });
    scrollDown();
  }

  dialog.addEventListener('close', () => {
    openers.forEach(b => b.setAttribute('aria-expanded', 'false'));
    dialog.classList.remove('is-typing');
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    opener = null;
  });

  // a click on the dimmed page behind the terminal closes it
  dialog.addEventListener('click', e => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });

  for (const b of openers) {
    b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', () => open(b, false));
  }
  for (const b of dialog.querySelectorAll('[data-term-close]')) b.addEventListener('click', () => dialog.close());
  for (const k of document.querySelectorAll('[data-term-kbd]')) k.textContent = mac ? '⌘ K' : 'ctrl K';

  // ctrl+k (cmd+k on a mac) opens and closes it. never while someone is typing somewhere else
  document.addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'k' || e.altKey || e.shiftKey || e.repeat) return;
    if (mac ? !e.metaKey || e.ctrlKey : !e.ctrlKey || e.metaKey) return;
    const t = e.target;
    const typing = t && t !== input && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName || ''));
    if (typing) return;
    e.preventDefault();
    if (dialog.open) dialog.close();
    else open(document.activeElement, true);
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    run(input.value);
    input.value = '';
  });

  input.addEventListener('focus', () => { if (coarse.matches) dialog.classList.add('is-typing'); });
  input.addEventListener('blur', () => dialog.classList.remove('is-typing'));

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

  dialog.addEventListener('click', e => {
    const b = e.target.closest('button[data-cmd]');
    if (b) {
      run(b.dataset.cmd);
      if (!coarse.matches) input.focus({ preventScroll: true });
      return;
    }
    // with a mouse, a click anywhere in the console puts the caret back in the prompt
    if (!coarse.matches && e.target !== dialog && !e.target.closest('a, input, button') && !getSelection().toString()) {
      input.focus({ preventScroll: true });
    }
  });

  addEventListener('pond:golden', () => {
    print('a great carp rises from the deep.', 'gold');
    scrollDown();
  });
})();
