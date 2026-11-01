const seasonData = {
  1: { title: "Kaiji: Ultimate Survivor", count: 26 },
  2: { title: "Kaiji: Against All Rules", count: 26 }
};

let selectedSeason = 1;
let selectedEpisode = 1;

const episodeList = document.getElementById("episodeList");
const seasonHeading = document.getElementById("seasonHeading");
const selectedEpisodeTitle = document.getElementById("selectedEpisodeTitle");
const playerUrl = document.getElementById("playerUrl");
const playerFrame = document.getElementById("playerFrame");
const playerStatus = document.getElementById("playerStatus");

function storageKey() {
  return `kaiji-player-s${selectedSeason}-e${selectedEpisode}`;
}

function makeEpisodeList() {
  const data = seasonData[selectedSeason];
  seasonHeading.textContent = data.title;
  document.getElementById("episodeCount").textContent = `${data.count} episodes`;
  episodeList.innerHTML = "";

  for (let ep = 1; ep <= data.count; ep++) {
    const button = document.createElement("button");
    button.className = `episode-button${ep === selectedEpisode ? " active" : ""}`;
    button.innerHTML = `<span class="episode-num">${String(ep).padStart(2, "0")}</span><span class="episode-label">Episode ${ep}</span>`;
    button.addEventListener("click", () => {
      selectedEpisode = ep;
      makeEpisodeList();
      loadSavedPlayer();
    });
    episodeList.appendChild(button);
  }

  selectedEpisodeTitle.textContent = `Episode ${selectedEpisode}`;
}

function setPlaceholder(message) {
  playerFrame.innerHTML = `<div class="player-placeholder"><div class="play-symbol">▶</div><p>${message}</p></div>`;
}

function loadSavedPlayer() {
  const savedUrl = localStorage.getItem(storageKey()) || "";
  playerUrl.value = savedUrl;
  if (savedUrl) {
    embedPlayer(savedUrl, false);
  } else {
    setPlaceholder("Choose an episode and add its player URL below.");
    playerStatus.textContent = "";
  }
}

function embedPlayer(url, announce = true) {
  // The URL is assigned to iframe.src as a URL; it is not inserted as HTML.
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    playerStatus.textContent = "Please enter a valid URL.";
    return;
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    playerStatus.textContent = "Only HTTP or HTTPS player URLs are supported.";
    return;
  }

  playerFrame.innerHTML = "";
  const iframe = document.createElement("iframe");
  iframe.src = parsed.href;
  iframe.title = `${seasonData[selectedSeason].title}, episode ${selectedEpisode}`;
  iframe.allow = "fullscreen; autoplay; encrypted-media; picture-in-picture";
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  playerFrame.appendChild(iframe);
  if (announce) playerStatus.textContent = "Player loaded. If it stays blank, the provider may block embedding.";
}

document.getElementById("loadPlayer").addEventListener("click", () => {
  const url = playerUrl.value.trim();
  if (!url) {
    playerStatus.textContent = "Paste a player/embed URL first.";
    return;
  }
  try {
    new URL(url);
  } catch {
    playerStatus.textContent = "That doesn't look like a valid URL.";
    return;
  }
  localStorage.setItem(storageKey(), url);
  embedPlayer(url);
});

document.getElementById("clearPlayer").addEventListener("click", () => {
  localStorage.removeItem(storageKey());
  playerUrl.value = "";
  setPlaceholder("Player URL cleared for this episode.");
  playerStatus.textContent = "Cleared.";
});

document.querySelectorAll(".season-switch [data-season]").forEach(button => {
  button.addEventListener("click", () => {
    selectedSeason = Number(button.dataset.season);
    selectedEpisode = 1;
    document.querySelectorAll(".season-switch .filter").forEach(b => b.classList.toggle("active", b === button));
    makeEpisodeList();
    loadSavedPlayer();
  });
});

document.querySelectorAll(".anime-card [data-season]").forEach(button => {
  button.addEventListener("click", () => {
    selectedSeason = Number(button.dataset.season);
    selectedEpisode = 1;
    document.querySelectorAll(".season-switch .filter").forEach(b => b.classList.toggle("active", Number(b.dataset.season) === selectedSeason));
    makeEpisodeList();
    loadSavedPlayer();
    document.getElementById("episodes").scrollIntoView({ behavior: "smooth" });
  });
});

const search = document.getElementById("search");
const cards = [...document.querySelectorAll(".anime-card")];
const filters = [...document.querySelectorAll(".catalog .filter")];
let currentFilter = "all";

function updateCards() {
  const query = search.value.trim().toLowerCase();
  let visible = 0;
  cards.forEach(card => {
    const matchesSearch = card.dataset.title.toLowerCase().includes(query);
    const tags = card.dataset.tags.split(" ");
    const matchesFilter = currentFilter === "all" || tags.includes(currentFilter);
    const show = matchesSearch && matchesFilter;
    card.hidden = !show;
    if (show) visible++;
  });
  document.getElementById("emptyState").hidden = visible !== 0;
}

search.addEventListener("input", updateCards);
filters.forEach(button => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    filters.forEach(filter => filter.classList.toggle("active", filter === button));
    updateCards();
  });
});

makeEpisodeList();
loadSavedPlayer();
