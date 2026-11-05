/*
 * Tiny motion runtime. A scene is plain HTML whose look at time t is set by
 * scene.render(t). Because every frame is a pure function of t, the same file
 * plays in a browser (preview) and renders frame-by-frame to video (render.mjs).
 */
(function () {
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, p) => a + (b - a) * p;

  const ease = {
    linear: (p) => p,
    inQuad: (p) => p * p,
    outQuad: (p) => 1 - (1 - p) * (1 - p),
    inOutQuad: (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2),
    inCubic: (p) => p * p * p,
    outCubic: (p) => 1 - Math.pow(1 - p, 3),
    inOutCubic: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    outQuint: (p) => 1 - Math.pow(1 - p, 5),
    inOutQuint: (p) => (p < 0.5 ? 16 * p ** 5 : 1 - Math.pow(-2 * p + 2, 5) / 2),
    outExpo: (p) => (p === 1 ? 1 : 1 - Math.pow(2, -10 * p)),
    inOutExpo: (p) =>
      p === 0 ? 0 : p === 1 ? 1 : p < 0.5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2,
    outBack: (p) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
    },
    outElastic: (p) =>
      p === 0 || p === 1 ? p : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  };

  /** 0→1 as t goes from start to end, shaped by an easing function. */
  const progress = (t, start, end, fn = ease.linear) =>
    end <= start ? (t >= start ? 1 : 0) : fn(clamp((t - start) / (end - start)));

  /** Value moving from `from` to `to` between start and end. */
  const tween = (t, start, end, from, to, fn = ease.outCubic) => lerp(from, to, progress(t, start, end, fn));

  /** 0→1→0: fades in after start, holds, fades out before end. Good for shots. */
  const envelope = (t, start, end, fadeIn = 0.4, fadeOut = 0.4, fn = ease.inOutQuad) =>
    Math.min(progress(t, start, start + fadeIn, fn), 1 - progress(t, end - fadeOut, end, fn));

  /** Text revealed at `cps` characters per second from `start`. */
  const typed = (text, t, start, cps = 24) => text.slice(0, Math.max(0, Math.floor((t - start) * cps)));

  /** Seeded random numbers, so renders are repeatable. Never use Math.random in render(). */
  const random = (seed = 1) => () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };

  /** Set opacity / transform / blur on an element in one call. */
  function style(el, { o, x = 0, y = 0, s = 1, sx, sy, r = 0, blur = 0, origin } = {}) {
    if (!el) return;
    if (o !== undefined) el.style.opacity = o;
    el.style.transform =
      `translate(${x}px, ${y}px) scale(${sx ?? s}, ${sy ?? s}) rotate(${r}deg)`;
    el.style.filter = blur > 0.01 ? `blur(${blur}px)` : '';
    if (origin) el.style.transformOrigin = origin;
  }

  function mount(scene) {
    const { width, height, fps = 30, duration } = scene;
    const params = new URLSearchParams(location.search);
    const rendering = params.has('render');
    const root = scene.root;
    document.documentElement.classList.add(rendering ? 'motion-render' : 'motion-preview');

    const frame = document.createElement('div');
    frame.className = 'motion-frame';
    const stage = document.createElement('div');
    stage.className = 'motion-stage';
    Object.assign(stage.style, { width: width + 'px', height: height + 'px' });
    root.parentNode.insertBefore(frame, root);
    frame.appendChild(stage);
    stage.appendChild(root);
    Object.assign(root.style, { width: width + 'px', height: height + 'px' });

    let current = 0;
    let onSeek = () => {};
    const seek = (t) => {
      current = clamp(t, 0, duration);
      scene.render(current);
      onSeek(current);
    };
    const start = parseFloat(params.get('t') || '0') || 0;
    window.__motion = {
      width, height, fps, duration, seek,
      ready: document.fonts.ready.then(() => (seek(start), true)),
    };
    if (rendering) return;

    // Preview: scale to fit the window and add play / scrub controls.
    const bar = document.createElement('div');
    bar.className = 'motion-bar';
    bar.innerHTML =
      '<button type="button" aria-label="Play">▶</button>' +
      `<input type="range" min="0" max="${duration}" step="${1 / fps}" value="0" aria-label="Time">` +
      '<span class="motion-time"></span>';
    document.body.appendChild(bar);
    const [btn, range, label] = bar.children;

    const fit = () => {
      const s = Math.min((innerWidth - 32) / width, (innerHeight - 88) / height, 1);
      stage.style.transform = `scale(${s})`;
      Object.assign(frame.style, { width: width * s + 'px', height: height * s + 'px' });
    };
    addEventListener('resize', fit);
    fit();

    let playing = !params.has('t');
    let last = null;
    onSeek = (t) => {
      range.value = t;
      label.textContent = `${t.toFixed(2)} / ${duration.toFixed(2)}s · frame ${Math.round(t * fps)}`;
      btn.textContent = playing ? '❚❚' : '▶';
    };
    const toggle = () => { playing = !playing; last = null; if (playing && current >= duration) seek(0); onSeek(current); };
    btn.onclick = toggle;
    range.oninput = () => { playing = false; seek(parseFloat(range.value)); };
    addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); toggle(); }
      if (e.code === 'ArrowRight') { playing = false; seek(current + 1 / fps); }
      if (e.code === 'ArrowLeft') { playing = false; seek(current - 1 / fps); }
    });
    const loop = (now) => {
      if (playing) {
        if (last !== null) {
          const next = current + (now - last) / 1000;
          seek(next >= duration ? 0 : next);
        }
        last = now;
      }
      requestAnimationFrame(loop);
    };
    window.__motion.ready.then(() => requestAnimationFrame(loop));
  }

  window.Motion = { clamp, lerp, ease, progress, tween, envelope, typed, random, style, mount };
})();
