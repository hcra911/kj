(() => {
  "use strict";

  /* ---------- Config ---------- */
  const DEFAULTS = {
    videoPattern: "videos/s{s}/e{ee}.mp4",
    subtitlePattern: "",
    subtitleLang: "en",
    subtitleLabel: "English",
    skipSeconds: 85,
    seasons: {
      1: { title: "Kaiji: Ultimate Survivor", count: 26, episodes: {} },
      2: { title: "Kaiji: Against All Rules", count: 26, episodes: {} }
    }
  };
  const CONFIG = Object.assign({}, DEFAULTS, window.KAIJI_CONFIG || {});
  const SEASONS = CONFIG.seasons;
  const HLS_URL = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";

  /* ---------- Helpers ---------- */
  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, "0");
  const fill = (tpl, s, e) => tpl.replace(/\{s\}/g, s).replace(/\{ee\}/g, pad(e)).replace(/\{e\}/g, e);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } }
  };
  const overrideKey = (s, e) => `kaiji-player-s${s}-e${e}`;   // same key the original page used
  const progressKey = (s, e) => `kaiji-progress-s${s}-e${e}`;

  function readProgress(s, e) {
    try { return JSON.parse(store.get(progressKey(s, e))) || {}; } catch { return {}; }
  }
  function writeProgress(s, e, data) { store.set(progressKey(s, e), JSON.stringify(data)); }

  // Only http(s) URLs (plus file: when the page itself is opened from disk) may be used as a source.
  function parseSourceUrl(value) {
    let u;
    try { u = new URL(value, location.href); } catch { return null; }
    const ok = u.protocol === "http:" || u.protocol === "https:" || (u.protocol === "file:" && location.protocol === "file:");
    return ok ? u : null;
  }
  function classify(url) {
    const path = new URL(url, location.href).pathname.toLowerCase();
    if (path.endsWith(".m3u8")) return "hls";
    if (/\.(mp4|m4v|webm|ogv|ogg|mov)$/.test(path)) return "video";
    return "embed";
  }

  /* ---------- Elements ---------- */
  const episodeList = $("episodeList");
  const seasonHeading = $("seasonHeading");
  const episodeCount = $("episodeCount");
  const titleEl = $("selectedEpisodeTitle");
  const seasonLabel = $("playerSeasonLabel");
  const tagEl = $("playerTag");
  const frame = $("playerFrame");
  const video = $("video");
  const embed = $("embedFrame");
  const placeholder = $("placeholder");
  const placeholderText = $("placeholderText");
  const placeholderPath = $("placeholderPath");
  const prevBtn = $("prevEp");
  const nextBtn = $("nextEp");
  const skipBtn = $("skipIntro");
  const autoNext = $("autoNext");
  const urlInput = $("playerUrl");
  const statusEl = $("playerStatus");
  const overrideBox = $("sourceOverride");

  skipBtn.textContent = `Skip ${CONFIG.skipSeconds}s`;
  const savedAuto = store.get("kaiji-autonext");
  if (savedAuto !== null) autoNext.checked = savedAuto === "1";
  autoNext.addEventListener("change", () => store.set("kaiji-autonext", autoNext.checked ? "1" : "0"));

  /* ---------- State ---------- */
  const state = { season: 1, ep: 1 };
  const availability = new Map();   // url -> true | false (same-origin files only, http(s) only)
  const probed = new Set();         // seasons that have been probed
  let hls = null;
  let lastSave = 0;

  /* ---------- Sources ---------- */
  function resolveSource(season, ep) {
    const cfg = SEASONS[season];
    const epCfg = (cfg.episodes && cfg.episodes[ep]) || {};

    // 1. Source the viewer pasted for this episode
    const pasted = store.get(overrideKey(season, ep));
    if (pasted) {
      const u = parseSourceUrl(pasted);
      if (u) return { type: classify(u.href), url: u.href, custom: true };
    }
    // 2. Explicit per-episode config
    if (epCfg.embed) {
      const u = parseSourceUrl(epCfg.embed);
      if (u) return { type: "embed", url: u.href };
    }
    if (epCfg.src) {
      const u = parseSourceUrl(epCfg.src);
      if (u) return { type: classify(u.href), url: u.href, vtt: epCfg.subtitles ? new URL(epCfg.subtitles, location.href).href : subtitleFor(season, ep) };
    }
    // 3. Naming convention: videos/s1/e01.mp4
    const rel = fill(CONFIG.videoPattern, season, ep);
    return { type: classify(rel), url: new URL(rel, location.href).href, vtt: subtitleFor(season, ep), conventional: true };
  }
  function subtitleFor(season, ep) {
    return CONFIG.subtitlePattern ? new URL(fill(CONFIG.subtitlePattern, season, ep), location.href).href : "";
  }
  const isMissing = src => src.type !== "embed" && availability.get(src.url) === false;
  const displayPath = src => { try { const u = new URL(src.url); return u.origin === location.origin || u.protocol === "file:" ? decodeURI(u.pathname.replace(/^.*\/(?=videos\/)/, "")) : src.url; } catch { return src.url; } };

  // Check which files exist (only possible when served over http(s), and only for same-origin files)
  async function probeSeason(season) {
    if (!/^https?:$/.test(location.protocol) || probed.has(season)) return;
    probed.add(season);
    const urls = [];
    for (let ep = 1; ep <= SEASONS[season].count; ep++) {
      const src = resolveSource(season, ep);
      if (src.type === "embed" || availability.has(src.url)) continue;
      if (new URL(src.url).origin !== location.origin) continue;
      urls.push(src.url);
    }
    let i = 0;
    const worker = async () => {
      while (i < urls.length) {
        const url = urls[i++];
        try {
          const r = await fetch(url, { method: "HEAD" });
          availability.set(url, r.ok && !/text\/html/i.test(r.headers.get("content-type") || ""));
        } catch { availability.set(url, false); }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (state.season === season) { renderList(); updateCount(); }
  }

  /* ---------- Episode list ---------- */
  function updateCount() {
    const cfg = SEASONS[state.season];
    let text = `${cfg.count} episodes`;
    if (probed.has(state.season)) {
      let ready = 0;
      for (let ep = 1; ep <= cfg.count; ep++) if (!isMissing(resolveSource(state.season, ep))) ready++;
      text += ` · ${ready} ready`;
    }
    episodeCount.textContent = text;
  }

  function renderList() {
    const cfg = SEASONS[state.season];
    const keepScroll = episodeList.scrollTop;
    episodeList.replaceChildren();
    for (let ep = 1; ep <= cfg.count; ep++) {
      const epCfg = (cfg.episodes && cfg.episodes[ep]) || {};
      const prog = readProgress(state.season, ep);
      const missing = isMissing(resolveSource(state.season, ep));

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "episode-button" + (ep === state.ep ? " active" : "") + (missing ? " missing" : "");
      if (ep === state.ep) btn.setAttribute("aria-current", "true");
      if (missing) btn.title = "No video file found for this episode yet";

      const num = document.createElement("span");
      num.className = "episode-num";
      num.textContent = pad(ep);

      const meta = document.createElement("span");
      meta.className = "episode-meta";
      const label = document.createElement("span");
      label.className = "episode-label";
      label.textContent = `Episode ${ep}`;
      meta.appendChild(label);
      if (epCfg.title) {
        const t = document.createElement("span");
        t.className = "episode-title";
        t.textContent = epCfg.title;
        meta.appendChild(t);
      }

      const status = document.createElement("span");
      status.className = "episode-status";
      status.textContent = prog.done ? "✓" : missing ? "—" : "";

      btn.append(num, meta, status);

      if (!prog.done && prog.t > 5 && prog.d > 0) {
        const bar = document.createElement("span");
        bar.className = "episode-progress";
        const fillEl = document.createElement("i");
        fillEl.style.width = `${Math.min(100, (prog.t / prog.d) * 100).toFixed(1)}%`;
        bar.appendChild(fillEl);
        btn.appendChild(bar);
      }

      btn.addEventListener("click", () => select(state.season, ep, { play: true }));
      episodeList.appendChild(btn);
    }
    episodeList.scrollTop = keepScroll;
  }

  function scrollActiveIntoView() {
    const active = episodeList.querySelector(".episode-button.active");
    if (!active) return;
    const top = active.offsetTop - episodeList.offsetTop;
    if (top < episodeList.scrollTop || top + active.offsetHeight > episodeList.scrollTop + episodeList.clientHeight) {
      episodeList.scrollTop = Math.max(0, top - 8);
    }
  }

  /* ---------- Player ---------- */
  function destroyHls() { if (hls) { hls.destroy(); hls = null; } }

  function showMessage(text, path) {
    video.hidden = true;
    embed.hidden = true;
    placeholder.hidden = false;
    placeholderText.textContent = text;
    placeholderPath.hidden = !path;
    placeholderPath.textContent = path || "";
  }
  function clearVideo() {
    destroyHls();
    video.pause();
    video.querySelectorAll("track").forEach(t => t.remove());
    video.removeAttribute("src");
    video.load();
  }
  function clearEmbed() { embed.removeAttribute("src"); embed.hidden = true; }

  function loadHlsLibrary() {
    if (window.Hls) return Promise.resolve(window.Hls);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = HLS_URL;
      s.onload = () => resolve(window.Hls);
      s.onerror = () => reject(new Error("hls.js failed to load"));
      document.head.appendChild(s);
    });
  }

  function setTag(text) { tagEl.textContent = text; }

  function loadSource(play) {
    const { season, ep } = state;
    const src = resolveSource(season, ep);
    embed.title = `${SEASONS[season].title}, episode ${ep}`;
    skipBtn.disabled = src.type === "embed";
    statusEl.textContent = "";

    if (src.type === "embed") {
      clearVideo();
      video.hidden = true;
      placeholder.hidden = true;
      embed.src = src.url;
      embed.hidden = false;
      setTag("EMBED");
      return;
    }

    clearEmbed();
    clearVideo();
    placeholder.hidden = true;
    video.hidden = false;
    setTag(src.type === "hls" ? "HLS STREAM" : src.custom ? "CUSTOM FILE" : "LOCAL FILE");

    if (src.vtt) {
      const track = document.createElement("track");
      track.kind = "subtitles";
      track.srclang = CONFIG.subtitleLang;
      track.label = CONFIG.subtitleLabel;
      track.src = src.vtt;
      track.default = true;
      video.appendChild(track);
    }

    const start = () => { if (play) video.play().catch(() => { /* needs a click first */ }); };

    if (src.type === "hls" && !video.canPlayType("application/vnd.apple.mpegurl")) {
      loadHlsLibrary().then(Hls => {
        if (!Hls || !Hls.isSupported()) { showMessage("This browser can't play HLS streams.", src.url); return; }
        if (state.season !== season || state.ep !== ep) return;   // user moved on while the library loaded
        hls = new Hls();
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) showMessage("Couldn't play this stream.", src.url);
        });
        hls.loadSource(src.url);
        hls.attachMedia(video);
        start();
      }).catch(() => showMessage("Couldn't load the HLS player library (check your connection).", ""));
    } else {
      video.src = src.url;
      video.load();
      start();
    }
  }

  video.addEventListener("error", () => {
    if (!video.getAttribute("src")) return;
    const src = resolveSource(state.season, state.ep);
    const missing = src.conventional || isMissing(src);
    setTag(missing ? "NO FILE" : "CAN'T PLAY");
    showMessage(
      missing
        ? `No playable video for Episode ${state.ep} yet. Put the file here (MP4 H.264/AAC or WebM):`
        : `Couldn't play Episode ${state.ep}. Check the link and that the file is MP4 (H.264/AAC), WebM or HLS:`,
      displayPath(src)
    );
  });

  video.addEventListener("loadedmetadata", () => {
    const prog = readProgress(state.season, state.ep);
    if (!prog.done && prog.t > 5 && prog.t < video.duration - 10) video.currentTime = Math.max(0, prog.t - 2);
  });

  function saveProgress(force) {
    if (video.hidden || !video.duration || !isFinite(video.duration)) return;
    const now = Date.now();
    if (!force && now - lastSave < 3000) return;
    lastSave = now;
    const prev = readProgress(state.season, state.ep);
    const done = prev.done || video.currentTime / video.duration > 0.92;
    writeProgress(state.season, state.ep, { t: video.currentTime, d: video.duration, done });
    if (done && !prev.done) renderList();
  }
  video.addEventListener("timeupdate", () => saveProgress(false));
  video.addEventListener("pause", () => saveProgress(true));
  video.addEventListener("ended", () => {
    writeProgress(state.season, state.ep, { t: 0, d: video.duration, done: true });
    renderList();
    const next = neighbor(1);
    if (autoNext.checked && next) select(next[0], next[1], { play: true });
  });

  /* ---------- Navigation ---------- */
  function neighbor(dir) {
    let s = state.season, e = state.ep + dir;
    if (e < 1) {
      s -= 1;
      if (!SEASONS[s]) return null;
      e = SEASONS[s].count;
    } else if (e > SEASONS[s].count) {
      s += 1;
      if (!SEASONS[s]) return null;
      e = 1;
    }
    return [s, e];
  }

  function select(season, ep, opts = {}) {
    state.season = season;
    state.ep = ep;
    store.set("kaiji-last", JSON.stringify({ s: season, e: ep }));
    const cfg = SEASONS[season];
    const epCfg = (cfg.episodes && cfg.episodes[ep]) || {};

    seasonHeading.textContent = cfg.title;
    seasonLabel.textContent = `SEASON ${season}`;
    titleEl.textContent = epCfg.title ? `Episode ${ep} · ${epCfg.title}` : `Episode ${ep}`;
    document.querySelectorAll(".season-switch [data-season]").forEach(b =>
      b.classList.toggle("active", Number(b.dataset.season) === season));

    const stored = store.get(overrideKey(season, ep));
    urlInput.value = stored || "";
    overrideBox.open = !!stored;

    renderList();
    updateCount();
    scrollActiveIntoView();
    loadSource(!!opts.play);
    prevBtn.disabled = !neighbor(-1);
    nextBtn.disabled = !neighbor(1);
    probeSeason(season);
  }

  function startSeason(season) {
    let last = null;
    try { last = JSON.parse(store.get("kaiji-last")); } catch { /* ignore */ }
    select(season, last && last.s === season ? last.e : 1);
  }

  prevBtn.addEventListener("click", () => { const n = neighbor(-1); if (n) select(n[0], n[1], { play: true }); });
  nextBtn.addEventListener("click", () => { const n = neighbor(1); if (n) select(n[0], n[1], { play: true }); });
  skipBtn.addEventListener("click", () => {
    if (video.hidden) return;
    const limit = isFinite(video.duration) ? video.duration - 1 : Infinity;
    video.currentTime = Math.min(video.currentTime + CONFIG.skipSeconds, limit);
  });

  document.querySelectorAll(".season-switch [data-season]").forEach(button =>
    button.addEventListener("click", () => startSeason(Number(button.dataset.season))));
  document.querySelectorAll(".anime-card [data-season]").forEach(button =>
    button.addEventListener("click", () => {
      startSeason(Number(button.dataset.season));
      $("episodes").scrollIntoView({ behavior: "smooth" });
    }));

  /* ---------- Per-episode source override ---------- */
  $("loadPlayer").addEventListener("click", () => {
    const raw = urlInput.value.trim();
    if (!raw) { statusEl.textContent = "Paste a video or player URL first."; return; }
    const u = parseSourceUrl(raw);
    if (!u) { statusEl.textContent = "Please enter a valid http(s) URL."; return; }
    store.set(overrideKey(state.season, state.ep), u.href);
    select(state.season, state.ep, { play: true });
    statusEl.textContent = classify(u.href) === "embed"
      ? "Loaded as an embedded player. If it stays blank, the provider may block embedding."
      : "Loaded in the built-in player.";
  });
  $("clearPlayer").addEventListener("click", () => {
    store.del(overrideKey(state.season, state.ep));
    select(state.season, state.ep);
    statusEl.textContent = "Back to the default source.";
  });

  /* ---------- Keyboard shortcuts ---------- */
  document.addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    if (video.hidden) return;
    const onVideo = document.activeElement === video;   // native controls already handle keys there
    const onButton = t && t.tagName === "BUTTON";
    switch (e.key.toLowerCase()) {
      case " ": case "k":
        if (onVideo || (e.key === " " && onButton)) return;
        video.paused ? video.play().catch(() => {}) : video.pause(); break;
      case "arrowleft": case "j": if (onVideo) return; video.currentTime = Math.max(0, video.currentTime - 10); break;
      case "arrowright": case "l": if (onVideo) return; video.currentTime += 10; break;
      case "f":
        if (document.fullscreenElement) document.exitFullscreen();
        else if (video.requestFullscreen) video.requestFullscreen().catch(() => {});
        break;
      case "m": video.muted = !video.muted; break;
      case "n": nextBtn.click(); break;
      case "p": prevBtn.click(); break;
      default: return;
    }
    e.preventDefault();
  });

  /* ---------- Catalog search + filters (unchanged behaviour) ---------- */
  const search = $("search");
  const cards = [...document.querySelectorAll(".anime-card")];
  const filters = [...document.querySelectorAll(".catalog .filter")];
  let currentFilter = "all";

  function updateCards() {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    cards.forEach(card => {
      const matchesSearch = card.dataset.title.toLowerCase().includes(query);
      const matchesFilter = currentFilter === "all" || card.dataset.tags.split(" ").includes(currentFilter);
      const show = matchesSearch && matchesFilter;
      card.hidden = !show;
      if (show) visible++;
    });
    $("emptyState").hidden = visible !== 0;
  }
  search.addEventListener("input", updateCards);
  filters.forEach(button => button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    filters.forEach(f => f.classList.toggle("active", f === button));
    updateCards();
  }));

  /* ---------- Init ---------- */
  let last = null;
  try { last = JSON.parse(store.get("kaiji-last")); } catch { /* ignore */ }
  const initial = last && SEASONS[last.s] && last.e >= 1 && last.e <= SEASONS[last.s].count ? last : { s: 1, e: 1 };
  select(initial.s, initial.e);
})();
