// Live hero: the Sunday stream replaces the home hero montage. Loaded by Hero.astro only in the live window
// (html[data-live], set by LiveBanner). <html data-live-video="ID"> (server-side) embeds that video instead of the channel's live stream.
// States on .hero: is-live (ambient: muted, blurred), is-focused, is-mini. Not playing within 8s or an error: the montage comes back.
(() => {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const html = document.documentElement;
  const media = hero.querySelector('.hero-media');
  const box = hero.querySelector('.live');
  const copy = hero.querySelector('.hero-content');
  const strip = hero.querySelector('.hero-strip');
  const toggle = hero.querySelector('.video-toggle');
  const say = hero.querySelector('.live-say');
  const v = document.getElementById('hero-video');
  const btns = (a) => hero.querySelectorAll(`[data-act="${a}"]`);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let player, state = '', muted = true, paused = false, counted = false;

  const id = html.dataset.liveVideo;
  const f = document.createElement('iframe');
  f.src = `https://www.youtube-nocookie.com/embed/${/^[\w-]{11}$/.test(id) ? `${id}?` : `live_stream?channel=${hero.dataset.channel}&`}`
    + `autoplay=1&mute=1&controls=0&playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
  f.title = 'Riverside Sunday livestream';
  f.tabIndex = -1;
  f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  box.prepend(f);
  box.hidden = false;
  toggle.hidden = true; // until we know whether it drives the stream or the montage
  v.setAttribute('aria-hidden', 'true'); // .hero-media is exposed while focused/mini

  const sync = () => {
    for (const b of btns('pause')) { b.toggleAttribute('data-alt', paused); b.lastChild.textContent = paused ? 'Play' : 'Pause'; }
    for (const b of btns('sound')) {
      b.toggleAttribute('data-alt', muted);
      b.setAttribute('aria-label', muted ? 'Turn sound on' : 'Turn sound off');
      if (b.lastChild.nodeName === 'SPAN') b.lastChild.textContent = muted ? 'Sound on' : 'Sound off';
    }
    const fs = !!document.fullscreenElement;
    for (const b of btns('full')) { b.toggleAttribute('data-alt', fs); b.lastChild.textContent = fs ? 'Exit full screen' : 'Full screen'; }
    toggle.dataset.paused = String(paused);
    toggle.querySelector('.sr-only').textContent = paused ? 'Play live video' : 'Pause live video';
  };

  const set = (s) => {
    state = s;
    hero.classList.toggle('is-live', !!s);
    hero.classList.toggle('is-focused', s === 'focused');
    hero.classList.toggle('is-mini', s === 'mini');
    copy.inert = s === 'focused' || s === 'mini';
    if (copy.inert) media.removeAttribute('aria-hidden'); else media.setAttribute('aria-hidden', 'true');
    if (s !== 'focused' && document.fullscreenElement) document.exitFullscreen();
  };
  const sound = (on) => {
    muted = !on;
    if (on) { player.unMute(); player.setVolume(100); } else player.mute();
    sync();
  };

  const montage = () => {
    if (!f.isConnected) return;
    clearTimeout(timer);
    set('');
    f.remove();
    box.hidden = true;
    toggle.hidden = false;
    for (const s of v.children) s.setAttribute('src', s.dataset.src);
    v.load();
    v.play().catch(() => {});
  };
  const timer = setTimeout(montage, 8000);

  const playing = () => {
    paused = false;
    if (!state) { clearTimeout(timer); set('ambient'); toggle.hidden = false; }
    sync();
  };

  const enter = () => { // focused, keeping focus inside the player if it was there
    const had = hero.contains(document.activeElement);
    set('focused');
    hero.style.setProperty('--strip-h', `${strip.offsetHeight}px`);
    if (had) btns('pause')[0].focus({ preventScroll: true });
  };
  const focus = (scroll) => {
    if (scroll) scrollTo({ top: 0, behavior: reduce ? 'instant' : 'smooth' });
    if (!counted) { counted = true; navigator.sendBeacon?.('/api/stats/play', 'live'); } // one play per page, for the admin Statistics
    enter();
    sound(true);
    player.playVideo();
    btns('pause')[0].focus({ preventScroll: true });
    say.textContent = 'Live service playing with sound';
  };
  const ambient = () => {
    const away = state === 'mini'; // hero is off-screen: announce instead of moving focus up the page
    set('ambient');
    sound(false);
    player.playVideo();
    say.textContent = away ? 'Live video closed' : '';
    if (!away) btns('watch')[0].focus({ preventScroll: true });
  };
  const mini = (scroll) => {
    const had = hero.contains(document.activeElement);
    set('mini');
    if (had) btns('expand')[0].focus({ preventScroll: true });
    // Button (not scroll): move the bare hero away. Its next sibling is an inline script, so scroll by its bottom edge.
    if (scroll) scrollBy({ top: hero.getBoundingClientRect().bottom, behavior: reduce ? 'instant' : 'smooth' });
  };

  hero.addEventListener('click', (e) => {
    if (!state) return;
    const el = e.target.closest('[data-act]');
    const a = el?.dataset.act;
    if (a === 'watch') { if (state === 'ambient') { e.preventDefault(); focus(); } }
    else if (a === 'pause') paused ? player.playVideo() : player.pauseVideo();
    else if (a === 'sound') sound(muted);
    else if (a === 'mini') mini(true);
    else if (a === 'full') document.fullscreenElement ? document.exitFullscreen() : hero.requestFullscreen().catch(() => {});
    else if (a === 'close') ambient();
    else if (a === 'expand' || e.target.closest('.live-hit')) focus(true);
    else if (state === 'ambient' && e.target.closest('.hero-media')) focus();
  });
  // The strip's round button pauses the stream instead of the montage (WCAG 2.2.2). Capture runs before Hero.astro's handler.
  strip.addEventListener('click', (e) => {
    if (state && e.target.closest('.video-toggle')) { e.stopPropagation(); paused ? player.playVideo() : player.pauseVideo(); }
  }, true);
  // Home only: the banner link opens the hero player instead of navigating (href stays /watch for no-JS / not playing).
  document.querySelector('#live-banner a')?.addEventListener('click', (e) => { if (state) { e.preventDefault(); focus(true); } });
  // Esc: focused -> ambient. Full screen exits natively; the phone menu keeps priority (capture runs before Header.astro's handler).
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state === 'focused' && !document.fullscreenElement && !document.querySelector('.nav-mobile[open]')) ambient();
  }, true);
  document.addEventListener('fullscreenchange', () => { sync(); hero.style.setProperty('--strip-h', `${strip.offsetHeight}px`); });
  for (const b of btns('full')) b.hidden = !document.fullscreenEnabled; // iPhone: rotate instead
  new IntersectionObserver(([e]) => {
    if (e.intersectionRatio < 0.3 && state === 'focused') mini();
    else if (e.intersectionRatio >= 0.3 && state === 'mini') enter();
  }, { threshold: 0.3 }).observe(hero);

  window.onYouTubeIframeAPIReady = () => {
    player = new YT.Player(f, {
      events: {
        onReady: () => { if (player.getPlayerState() === 1) playing(); },
        onStateChange: ({ data }) => {
          if (data === 1) playing();
          else if (data === 2) { paused = true; sync(); }
          else if (data === 0 && state === 'ambient') montage(); // stream ended while nobody was watching
        },
        onError: () => { if (state !== 'focused' && state !== 'mini') montage(); },
      },
    });
  };
  const api = Object.assign(document.createElement('script'), { src: 'https://www.youtube.com/iframe_api' });
  api.onerror = montage;
  document.head.append(api);
})();
