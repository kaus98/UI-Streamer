const params = new URLSearchParams(window.location.search);
const seriesId = params.get("id");
const folderId = params.get("folder");

const els = {
  seriesTitle: document.getElementById("seriesTitle"),
  seriesMeta: document.getElementById("seriesMeta"),
  episodeStats: document.getElementById("episodeStats"),
  episodeRow: document.getElementById("episodeRow"),
  cardTemplate: document.getElementById("cardTemplate"),
};

if (!seriesId) {
  document.body.innerHTML = "<p style='padding:2rem;color:#fff'>No series selected. Return to the library.</p>";
  throw new Error("Missing series id");
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

async function loadSeries() {
  const folderData = await fetchJson(`/api/library/folder/${folderId}`);
  const seriesEntry = folderData.items.find(item => item.id === seriesId && item.type === "series");
  if (!seriesEntry) {
    throw new Error("Series not found in folder");
  }

  const episodes = seriesEntry.episodes || [];

  els.seriesTitle.textContent = seriesEntry.title;
  els.seriesMeta.textContent = `${seriesEntry.year || "Year n/a"} • ${episodes.length} episodes`;
  els.episodeStats.textContent = `${episodes.length} episodes`;

  els.episodeRow.innerHTML = "";
  for (const ep of episodes) {
    const node = renderEpisodeCard(ep);
    els.episodeRow.appendChild(node);
  }
}

function renderEpisodeCard(episode) {
  const node = els.cardTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.id = episode.id;

  const thumb = node.querySelector(".thumb");
  if (episode.metadata.poster) {
    thumb.style.backgroundImage = `url('${episode.metadata.poster}')`;
  }

  node.querySelector("h3").textContent = episode.title;
  node.querySelector(".meta").textContent = [
    `S${episode.season || 1}E${episode.episode || 1}`,
    episode.year || "year n/a",
  ].join(" • ");

  node.querySelector(".progress-line span").style.width = "0%";

  node.querySelector(".play").addEventListener("click", () => {
    window.location.href = `/detail.html?id=${episode.id}&autoplay=1`;
  });
  node.querySelector(".details").addEventListener("click", () => {
    window.location.href = `/detail.html?id=${episode.id}`;
  });
  node.querySelector(".refresh").addEventListener("click", () => {
    refreshMetadata(episode.id);
  });
  node.querySelector(".delete").addEventListener("click", () => {
    if (!confirm(`Remove "${episode.title}" from the library?`)) return;
    deleteItem(episode.id);
  });

  return node;
}

async function refreshMetadata(id) {
  try {
    await fetchJson(`/api/library/${id}/refresh-metadata`, { method: "POST" });
    await loadSeries();
  } catch (error) {
    alert(`Metadata refresh failed: ${error.message}`);
  }
}

async function deleteItem(id) {
  try {
    const data = await fetchJson(`/api/library/${id}`, { method: "DELETE" });
    await loadSeries();
  } catch (error) {
    alert(`Delete failed: ${error.message}`);
  }
}

loadSeries().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<p style='padding:2rem;color:#fff'>${error.message}</p>`;
});
