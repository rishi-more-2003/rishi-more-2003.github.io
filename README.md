# rishi-more-2003.github.io

my personal site. one page, no framework, no build step. static html, css, and a few small scripts served by github pages, which is roughly the amount of infrastructure it deserves.

live at [rishi-more-2003.github.io](https://rishi-more-2003.github.io/).

## what's here

```
index.html        the entire site, including everything the terminal prints
style.css         the styling
pond.js           the koi pond canvas behind the terminal
hud.js            the top bar and the telemetry log
terminal.js       the command line: help, research, feed, and a few hidden ones
resume_mle.pdf    the resume the nav links to
```

## notes

- the og / twitter / json-ld metadata in `<head>` is what unfurls in link previews and feeds google. keep it in sync with whatever the resume currently claims.
- the terminal prints sections straight out of `#sections` in `index.html`, so editing content means editing html, not js. it also means google and no-js visitors still see all of it.
- the only third-party request is instrument serif from google fonts.
- `pond.js` steps its own quality down (resolution, then glow, then koi count) if frames run long, so it stays smooth on weak machines.
- favicon is an inline svg cloud, so there's no `favicon.ico` to look for.

## license

content (text, resume) © rishi more. the html/css scaffolding is free to borrow.
