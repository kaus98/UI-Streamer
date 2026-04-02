const params = new URLSearchParams(window.location.search);
const folderId = params.get("id");

const els = {
  folderTitle: document.getElementById("folderTitle"),
  folderMeta: document.getElementById("folderMeta"),
  folderStats: document.getElementById("folderStats"),
  folderContents: document.getElementById("folderContents"),
  cardTemplate: document.getElementById("cardTemplate"),
};

if (!folderId) {
  document.body.innerHTML = "<p style='padding:2rem;color:#fff'>No folder selected. Return to the library.</p>";
  throw new Error("Missing folder id");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

async function loadFolder() {
  const data = await fetchJson(`/api/library/folder/${folderId}`);
  const items = data.items || [];

  const totalMovies = items.filter(i => i.type === "movie").length;
  const totalSeries = items.filter(i => i.type === "series").length;

  els.folderTitle.textContent = folderId.replace(/^folder-/, "") || "Root";
  els.folderMeta.textContent = `${totalMovies} movies • ${totalSeries} series`;
  els.folderStats.textContent = `${items.length} entries`;

  els.folderContents.innerHTML = "";
  for (const entry of items) {
    const node = renderFolderEntry(entry);
    els.folderContents.appendChild(node);
  }
}

function renderFolderEntry(entry) {
  const node = els.cardTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.id = entry.id;
  node.dataset.type = entry.type;

  const thumb = node.querySelector(".thumb");
  if (entry.metadata.poster) {
    thumb.style.backgroundImage = `url('${entry.metadata.poster}')`;
  }

  node.querySelector("h3").textContent = entry.title;
  const metaParts = [
    entry.type,
    entry.year || "year n/a",
  ];
  if (entry.type === "series" && entry.episodes) {
    metaParts.push(`${entry.episodes.length} episodes`);
  }
  node.querySelector(".meta").textContent = metaParts.join(" • ");

  node.querySelector(".progress-line span").style.width = "0%";

  const actions = node.querySelector(".card-actions");
  if (entry.type === "series") {
    actions.innerHTML = `
      <button class="browse primary icon-only" aria-label="Browse series" type="button">
        <span class="icon-mark" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M9 3l5 5-5 5M3 12h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      </button>
    `;
    actions.querySelector(".browse").addEventListener("click", () => {
      window.location.href = `/series.html?id=${entry.id}&folder=${folderId}`;
    });
  } else {
    actions.innerHTML = `
      <button class="play icon-only" aria-label="Play" type="button">
        <span class="icon-mark" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg></span>
      </button>
      <button class="details ghost icon-only" aria-label="Details" type="button">
        <span class="icon-mark" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 10v6M12 7h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
      </button>
    `;
    const movie = entry.movie;
    actions.querySelector(".play").addEventListener("click", () => {
      window.location.href = `/detail.html?id=${movie.id}&autoplay=1`;
    });
    actions.querySelector(".details").addEventListener("click", () => {
      window.location.href = `/detail.html?id=${movie.id}`;
    });
  }

  return node;
}

loadFolder().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<p style='padding:2rem;color:#fff'>${error.message}</p>`;
});
