# Lode Runner — Babylon.js Minimal Demo

This is a small prototype of a Lode Runner–style game using Babylon.js (no build step required).

Quick start

- Open [index.html](index.html) in a browser, or run a local static server from the project folder:

```bash
# Python 3
python -m http.server 8000
# or with Node (if you have http-server)
npx http-server -c-1 .
```

Controls
- ArrowLeft / A: move left
- ArrowRight / D: move right
- ArrowUp / W: climb up (when on ladder)
- ArrowDown / S: climb down (when on ladder)
- Space: jump

Notes
- The demo uses the Babylon CDN. Open `index.html` in a modern browser (Chrome/Edge/Firefox).
- The implementation is intentionally small and simple; it demonstrates tiles, ladders, basic collisions, collectibles, and a simple enemy.
