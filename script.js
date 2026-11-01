const animeInfo = {
  kaiji: {
    title: "Kaiji: Ultimate Survivor",
    description: "Kaiji Itō is drawn into a dangerous world of high-stakes gambling, debt, and psychological games. A tense thriller about risk, strategy, and survival.",
    meta: ["2007", "26 episodes", "Psychological", "Thriller"]
  },
  kaiji2: {
    title: "Kaiji: Against All Rules",
    description: "The story continues as Kaiji faces new gambling challenges and tries to escape crushing debt through nerve, strategy, and determination.",
    meta: ["2011", "26 episodes", "Psychological", "Thriller"]
  }
};

const dialog = document.getElementById("detailsDialog");
const dialogTitle = document.getElementById("dialogTitle");
const dialogDescription = document.getElementById("dialogDescription");
const dialogMeta = document.getElementById("dialogMeta");

document.querySelectorAll("[data-open]").forEach(button => {
  button.addEventListener("click", () => {
    const item = animeInfo[button.dataset.open];
    if (!item) return;
    dialogTitle.textContent = item.title;
    dialogDescription.textContent = item.description;
    dialogMeta.innerHTML = item.meta.map(value => `<span>${value}</span>`).join("");
    dialog.showModal();
  });
});

document.getElementById("closeDialog").addEventListener("click", () => dialog.close());

const search = document.getElementById("search");
const cards = [...document.querySelectorAll(".anime-card")];
const filters = [...document.querySelectorAll(".filter")];
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

document.getElementById("addAnime").addEventListener("click", () => {
  alert("To add an anime, duplicate an anime-card in index.html and update its title, poster, and data-tags.");
});
