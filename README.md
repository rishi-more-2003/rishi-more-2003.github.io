# rishi-more-2003.github.io

my personal site. one page, no framework, no build step. static html, css, and a few small scripts served by github pages, which is roughly the amount of infrastructure it deserves.

live at [rishi-more-2003.github.io](https://rishi-more-2003.github.io/).

## what's here

```
index.html        the whole page: the opening, selected work, experience, contact
style.css         the styling
pond.js           the koi pond, a canvas fixed behind the page
terminal.js       the terminal dialog; its commands read their content from the page
site.js           the pause control, the caption under the moon, and the diagnostics
resume_mle.pdf    the resume the page links to
```

## preview locally

```
python -m http.server 8000
```

then open `http://localhost:8000`.

## notes

- the og / twitter / json-ld metadata in `<head>` is what unfurls in link previews and feeds google. keep it in sync with whatever the resume currently claims.
- the page is the source of truth. the terminal's `research`, `projects`, `experience`, `fun`, `contact` and `about` commands read the visible sections (the `data-*` attributes mark what they read), so content is edited once, in the html.
- notes left through the form by "get in touch", or with `msg` in the terminal, need a relay to reach an inbox. set `data-relay` (and `data-key`, if the relay wants one) on `#msg-form` in `index.html`. the note is posted as json (`email`, `message`, `subject`, `via`, and `access_key` when a key is set), which is the shape web3forms and formspree accept. with nothing set, both open the visitor's own mail app with the note ready to send.
- without javascript the page still reads top to bottom. only the pond, the terminal, the note form and the pause control go away.
- two font families are downloaded from google fonts: instrument serif for display, instrument sans for prose. monospace is whatever the system has.
- `pond.js` looks after its own cost. it caps the device pixel ratio, steps its quality down (resolution, then glow and caustics, then koi count) if frames run long, and stops drawing while the tab is hidden or the pond is scrolled out of view.
- visitors who ask for reduced motion get a still, composed pond. the pause button does the same for anyone, and the choice is remembered.
- the moon on the water follows the real phase, so the opening looks different through the month.
- for tuning: `?debug` shows pond diagnostics (so does `debug` in the terminal), `?moon=0.5` previews a phase (0 is new, 0.5 is full), and `?q=0` to `?q=3` pins the render quality.
- favicon is an inline svg emoji (🎏, a carp streamer, the closest thing to a koi), so there's no `favicon.ico` to look for.

## license

content (text, resume) © rishi more. the html/css scaffolding is free to borrow.
