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
    about:      ['who i am, in one breath', about, 'me'],
    research:   ['papers', () => listing('research', 'research'), 'me'],
    projects:   ['things i built', () => listing('side projects', 'project'), 'me'],
    experience: ['where i have worked', experience, 'me'],
    skills:     ['what i work with', skills, 'me'],
    fun:        ['off the keyboard', fun, 'me'],
    contact:    ['how to reach me', contact, 'me'],
    resume:     ['open my resume', resume, 'me'],
    msg:        ['leave me a note', msg, 'me'],
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
    sudo: args => {
      if (!args.length) return print('usage: sudo <command>. it will not help.', 'muted');
      if (args[0] === 'feed') {
        print('with great power: five handfuls.', 'muted');
        return feed(['5']);
      }
      if (args[0] === 'rm') return secret.rm(args.slice(1));
      print('nice try. this incident will be reported to the koi.', 'err');
    },
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
    // about the work
    train,
    think: train,
    quantize,
    int4: quantize,
    benchmark,
    bench: benchmark,
    hire,
    // about the pond
    haiku,
    ping,
    splash,
    top,
    htop: top,
    weather,
    uptime,
    // a shell that knows where it is
    git,
    cd: () => print('there is only the pond.', 'muted'),
    ssh: () => print('ssh: connect to host pond port 22: the koi do not take inbound connections.', 'err'),
    npm: nothingToInstall,
    yarn: nothingToInstall,
    pnpm: nothingToInstall,
    pip: nothingToInstall,
    make: () => print("make: *** no rule to make target 'agi'. stop.", 'err'),
    python: () => print('python 3.12 on pond. >>> import koi   (kidding. this is a pond, not a repl.)', 'muted'),
    man: () => print('no manual. the koi worked it out, and so will you. (help is a start.)', 'muted'),
    xyzzy: () => print('nothing happens.', 'muted'),
    please: () => print('manners noted. the koi are still in charge.', 'muted'),
    coffee: () => print("418: i'm a teapot. try tea.", 'err'),
    tea: () => print('a bowl of matcha, whisked. the koi are unimpressed.', 'muted'),
    yes: () => print('y\ny\ny\ny\n… the koi beg you to stop.', 'muted'),
    llm: notAnLlm,
    chatgpt: notAnLlm,
    claude: notAnLlm,
    credits: () => print('html, css and one canvas. the koi are drawn with maths and the moon keeps real time. no framework, no build step.', 'muted'),
    source: () => print('the whole site: ').append(link('https://github.com/rishi-more-2003/rishi-more-2003.github.io', 'github.com/rishi-more-2003/rishi-more-2003.github.io')),
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
    print('up/down walks history · tab completes · plenty of commands are hidden (ls -a is a start), and one of them is deadly.', 'muted');
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
    print('or leave a note right here: ', 'muted').append(cmdButton('msg'));
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

  const dotfiles = {
    '.koi_food': () => print('pellets. not for people.', 'muted'),
    '.great_carp': () => print('it rises for whoever feeds the pond well: two dozen pellets eaten. or for an old cheat code, played on the arrow keys.', 'gold'),
    '.sculptors_idol': () => print('a place to rest. try rest.', 'muted'),
    '.bash_history': showHistory,
  };

  function ls(args) {
    const d = el('div', 'line ls');
    if (/^-\w*a/.test(args[0] || '')) for (const f of Object.keys(dotfiles)) d.append(cmdButton(`cat ${f}`, f), ' ');
    for (const f of Object.keys(files)) d.append(cmdButton(`cat ${f}`, f), ' ');
    append(d);
  }

  function cat(args) {
    const f = args[0];
    if (!f) return print('usage: cat <file>   (try ls)', 'muted');
    if (Object.hasOwn(dotfiles, f)) return dotfiles[f]();
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

  // ---------------------------------------------------------------- questions and notes

  const say = (text, cls) => {
    const d = print(text, cls);
    scrollDown();
    return d;
  };

  // the prompt can ask something back: the next line typed is the answer, not a command
  const promptLabel = form.querySelector('label');
  const PS1 = promptLabel.innerHTML;
  let asking = null;
  form.noValidate = true; // an email answer is checked here, in the terminal's own words

  function ask(question, kind) {
    return new Promise(resolve => {
      asking = { question, resolve };
      form.classList.add('is-asking');
      promptLabel.textContent = `${question} ›`;
      input.type = kind === 'email' ? 'email' : 'text';
      input.inputMode = kind === 'email' ? 'email' : 'text';
      input.autocomplete = kind === 'email' ? 'email' : 'off';
      input.enterKeyHint = kind === 'email' ? 'send' : 'next';
      input.setAttribute('aria-label', question);
      scrollDown();
    });
  }

  function answer(value) {
    const a = asking;
    if (!a) return;
    asking = null;
    form.classList.remove('is-asking');
    promptLabel.innerHTML = PS1;
    input.type = 'text';
    input.inputMode = 'text';
    input.autocomplete = 'off';
    input.enterKeyHint = 'go';
    input.setAttribute('aria-label', 'type a command');
    a.resolve(value);
  }

  const notes = () => (window.site && window.site.message) || null;
  const dropped = v => v === null || /^(cancel|quit|q)$/i.test(v);

  // msg <text>: show the draft, ask where to reply, and send it. the same way out as the form by "get in touch"
  async function msg(args, rest) {
    const m = notes();
    if (!m) return print('notes are not available right now. email me instead.', 'muted');
    let text = (rest || '').trim();
    if (!text) {
      text = await ask('message');
      if (dropped(text)) return say('draft dropped.', 'muted');
      if (!text) return say('nothing to send.', 'muted');
    }
    if (text.length > m.max) return say(`that is ${text.length} characters. a note fits in ${m.max}; email me the long version.`, 'err');
    if (m.wait() > 0) return say(`one at a time. try again in ${m.wait()}s.`, 'muted');
    say(`draft: "${text}"`);
    // a reply address is required: keep asking until it looks like one, or the visitor gives up
    let from = '';
    for (;;) {
      from = await ask('your email (so i can reply)', 'email');
      if (dropped(from)) return say('draft dropped.', 'muted');
      if (m.valid(from)) break;
      say(from ? 'that does not look like an email address. try again, or type cancel.' : 'i need an address to reply to. try again, or type cancel.', 'err');
    }
    say('sending…', 'muted');
    const r = await m.send({ email: from, message: text, via: 'terminal' });
    if (r.ok) return say(`sent. thank you. i will write back to ${from}.`, 'gold');
    if (r.reason === 'too-soon') return say(`one at a time. try again in ${r.wait}s.`, 'muted');
    if (r.reason === 'off' || r.reason === 'inactive') return say('notes are not switched on yet. email me at ', 'err').append(link(`mailto:${m.to}`, m.to), ' instead.');
    say('that did not go through. the draft is not lost: ', 'err').append(link(m.mailto(text, from), 'email it instead'), '.');
  }

  // ---------------------------------------------------------------- the hidden ones

  const HAIKU = [
    ['an old quiet pond.', 'a pellet drops, koi rising:', 'gradients descend.'],
    ['moon on the water,', 'broken into small tokens.', 'still the same old moon.'],
    ['one koi hesitates.', 'the other has already', 'finished the pellet.'],
    ['int4 in the cache.', 'half a million tokens fit', 'in eight gigabytes.'],
    ['the model is sure.', 'it stops thinking and answers.', 'the water is still.'],
  ];
  function haiku() {
    print(HAIKU[Math.floor(Math.random() * HAIKU.length)].join('\n'), 'fortune');
  }

  // a training run that does what the paper says: it stops once it is sure
  function train() {
    const lines = ['epoch 1  loss 2.303', 'epoch 2  loss 1.184', 'epoch 3  loss 0.612', 'epoch 4  loss 0.297'];
    lines.forEach((l, i) => setTimeout(() => say(l, 'muted'), 240 * (i + 1)));
    setTimeout(() => say('confidence 0.97, over the threshold. stopping early.', 'gold'), 240 * (lines.length + 1));
    setTimeout(() => say("that is the whole paper: stop once you're sure, and keep 12% of the tokens.", 'muted'), 240 * (lines.length + 2));
  }

  function quantize() {
    const p = pond();
    if (!p || !p.quantize) return asleep();
    p.quantize(7000);
    print('quantizing the pond to int4. an eighth of the bits, the same koi.', 'muted');
    unseen(p);
    setTimeout(() => say('back to full precision.', 'muted'), 7000);
  }

  // the real numbers from kv roofline, as a terminal would draw them
  function benchmark() {
    const pre = el('pre', 'smi');
    pre.textContent = [
      'kv roofline, batch-1 decode at 128k context',
      '  pytorch sdpa     1.2 tok/s  █',
      '  fused triton    33.5 tok/s  ████████████████████████████  27x',
      '',
      'kv cache: 28.7 to 8.3 kb per token (3.47x smaller),',
      'so 8 gb holds 580k tokens instead of 154k.',
    ].join('\n');
    append(pre);
  }

  function ping() {
    const p = pond();
    if (!p || !p.ripple) return asleep();
    if (!p.ripple()) return still();
    print('64 bytes from pond: seq=1 time=0.3 ms', 'muted');
    for (const i of [2, 3]) {
      setTimeout(() => {
        p.ripple();
        say(`64 bytes from pond: seq=${i} time=0.${i + 2} ms`, 'muted');
      }, 420 * (i - 1));
    }
    setTimeout(() => {
      say('3 ripples sent, 3 received. the pond is listening.', 'muted');
      unseen(p);
      scrollDown();
    }, 1300);
  }

  function splash() {
    const p = pond();
    if (!p) return asleep();
    p.scatter();
    print('you slap the water. the koi scatter. they will remember this.', 'muted');
    unseen(p);
  }

  function top() {
    const p = pond(), n = p ? p.stats().koi : 0;
    const doing = ['swim --orbit', 'swim --orbit', 'swim', 'swim', 'swim', 'swim --deep', 'nap', 'swim --deep', 'swim --slow'];
    const rows = ['  PID USER   %CPU COMMAND', '    1 root    0.1 pond --moonlit'];
    for (let i = 0; i < n; i++) rows.push(`${String(100 + i * 7).padStart(5)} koi   ${(1.5 + ((i * 37) % 11)).toFixed(1).padStart(5)} ${doing[i % doing.length]}`);
    rows.push('', `${n} koi, load average: calm`);
    const pre = el('pre', 'smi');
    pre.textContent = rows.join('\n');
    append(pre);
  }

  function weather() {
    const p = pond();
    if (!p) return print('clouds cover the sky.', 'muted');
    const { phase, lit } = p.moon(), s = p.stats();
    const sky = lit < 0.03 ? 'new moon' : PHASES[Math.round(phase * 8) % 8];
    print(`over the pond tonight: ${sky}, ${s.raining ? 'rain on the water' : 'clear'}, ${s.koi} koi out. no chance of meetings.`, 'muted');
  }

  function uptime() {
    const t = Math.round(performance.now() / 1000), p = pond();
    print(`up ${Math.floor(t / 60)} min ${t % 60} s, ${p ? p.stats().koi : 0} koi, load average: calm`, 'muted');
  }

  function git(args) {
    const what = (args[0] || '').toLowerCase();
    if (what === 'status') print('on branch pond\nnothing to commit, working water clean', 'muted');
    else if (what === 'log') print(['c0ffee1 make them fast', 'b0bafe7 teach llms to behave', 'feedf00 feed the koi', '0000001 dig a pond'].join('\n'), 'muted');
    else if (what === 'blame') print('every line: the koi.', 'muted');
    else if (what === 'push') print('everything up to date. the pond has no remote.', 'muted');
    else print('usage: git status | log | blame | push', 'muted');
  }

  function hire() {
    print('good instinct.', 'gold');
    const m = notes(), rows = [['resume', link(resumeHref(), resumeHref())]];
    if (m && m.to) rows.push(['email', link(`mailto:${m.to}`, m.to)]);
    facts(rows);
    print('or leave a note right here: ', 'muted').append(cmdButton('msg'));
  }

  function nothingToInstall() {
    print('nothing to install. no framework, no build step.', 'muted');
  }

  function notAnLlm() {
    print('not an llm. a terminal with koi in it. try fortune.', 'muted');
  }

  // the old cheat code, played anywhere on the page, calls the great carp
  const CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let keysSeen = [];
  document.addEventListener('keydown', e => {
    const t = e.target;
    // watched, never intercepted; and not at all while someone types in another field
    if (t && t !== input && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName || ''))) {
      keysSeen = [];
      return;
    }
    keysSeen.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    keysSeen = keysSeen.slice(-CODE.length);
    if (keysSeen.join() !== CODE.join()) return;
    keysSeen = [];
    const p = pond();
    if (p && p.summon && p.summon()) say('the old code still works.', 'gold');
  });

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
      const key = name.toLowerCase(), rest = line.slice(name.length).trim();
      if (Object.hasOwn(commands, key)) commands[key][1](args, rest);
      else if (Object.hasOwn(secret, key)) secret[key](args, rest);
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
    for (const group of ['me', 'pond', 'shell']) {
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
    answer(null);
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
    const value = input.value;
    input.value = '';
    if (asking) {
      const line = el('div', 'line');
      line.append(el('span', 'muted', `${asking.question} › `), value);
      append(line);
      answer(value.trim());
      scrollDown();
      return;
    }
    run(value);
  });

  input.addEventListener('focus', () => { if (coarse.matches) dialog.classList.add('is-typing'); });
  input.addEventListener('blur', () => dialog.classList.remove('is-typing'));

  input.addEventListener('keydown', e => {
    if (asking) {
      // while a question is open the keys just type; ctrl+c drops it
      if (e.ctrlKey && e.key.toLowerCase() === 'c' && !getSelection().toString()) {
        e.preventDefault();
        const line = el('div', 'line');
        line.append(el('span', 'muted', `${asking.question} › `), `${input.value}^C`);
        append(line);
        input.value = '';
        answer(null);
        scrollDown();
      }
      return;
    }
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
      const go = () => {
        run(b.dataset.cmd);
        if (!coarse.matches) input.focus({ preventScroll: true });
      };
      if (asking) {
        answer(null);
        Promise.resolve().then(go); // let the dropped draft say so before the next command prints
      } else {
        go();
      }
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
