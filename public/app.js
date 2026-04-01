const state = {
  items: [],
  progress: {},
  movies: [],
  series: [],
  nextUp: null,
};

let activeFolder = localStorage.getItem("ui-streamer-folder") || null;

const els = {
  searchInput: document.getElementById("searchInput"),
  refreshBtn: document.getElementById("refreshBtn"),
  addPathBtn: document.getElementById("addPathBtn"),
  uploadBtn: document.getElementById("uploadBtn"),
  folderUpload: document.getElementById("folderUpload"),
  pathInput: document.getElementById("pathInput"),
  statusText: document.getElementById("statusText"),
  movieRow: document.getElementById("movieRow"),
  seriesRow: document.getElementById("seriesRow"),
  movieStats: document.getElementById("movieStats"),
  seriesStats: document.getElementById("seriesStats"),
  heroTitle: document.getElementById("heroTitle"),
  heroMeta: document.getElementById("heroMeta"),
  heroPoster: document.getElementById("heroPoster"),
  playNextBtn: document.getElementById("playNextBtn"),
  openLibraryBtn: document.getElementById("openLibraryBtn"),
  folderLabel: document.getElementById("folderLabel"),
  topbarFolder: document.getElementById("topbarFolder") || document.getElementById("openFolderBtn"),
  openFolderBtn: document.getElementById("openFolderBtn"),
  openAddPathBtn: document.getElementById("openAddPathBtn"),
  addPathModal: document.getElementById("addPathModal"),
  closeAddModalBtn: document.getElementById("closeAddModalBtn"),
  actionLog: document.getElementById("actionLog"),
  cardTemplate: document.getElementById("cardTemplate"),
};

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

async function uploadFolder() {
  const files = Array.from(els.folderUpload.files || []);
  if (!files.length) {
    els.statusText.textContent = "Select a local folder first.";
    return;
  }

  const formData = new FormData();
  for (const file of files) {
    formData.append("mediaFiles", file, file.webkitRelativePath || file.name);
  }

  els.statusText.textContent = "Uploading selected files to server library...";

  try {
    const response = await fetch("/api/library/upload", { method: "POST", body: formData });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Upload failed");
    }

    els.statusText.textContent = `Uploaded and added ${data.added} files.`;
    logAction(`Uploaded folder -> added ${data.added} files.`, data.items?.map((item) => item.fileName));
    await loadLibrary(els.searchInput.value.trim());
  } catch (error) {
    els.statusText.textContent = error.message;
    logAction(`Upload failed: ${error.message}`);
  }
}

function toggleAddPathModal(show) {
  if (show) {
    els.addPathModal.classList.add("active");
    els.addPathModal.removeAttribute("aria-hidden");
    els.pathInput.focus();
  } else {
    els.addPathModal.classList.remove("active");
    els.addPathModal.setAttribute("aria-hidden", "true");
  }
}

function formatPercent(v) {
  return `${Math.round(v || 0)}% watched`;
}

function renderHero(data) {
  const pick = data.lastWatched?.item || data.nextUp || state.items[0];
  if (!pick) {
    els.heroTitle.textContent = "Your local cinema, instantly.";
    els.heroMeta.textContent = "Add a folder path to begin.";
    els.heroPoster.style.backgroundImage = "none";
    return;
  }

  const p = state.progress[pick.id];
  els.heroTitle.textContent = pick.title;
  els.heroMeta.textContent = [
    pick.type === "series" && pick.season && pick.episode ? `S${pick.season} E${pick.episode}` : pick.type,
    pick.year || "Year n/a",
    p ? formatPercent(p.percent) : "Not started",
  ]
    .filter(Boolean)
    .join(" • ");

  els.heroPoster.style.backgroundImage = pick.metadata.poster ? `url('${pick.metadata.poster}')` : "none";
}

function goToDetail(id, autoPlay = false) {
  const query = new URLSearchParams({ id, autoplay: autoPlay ? "1" : "0" });
  window.location.href = `/detail.html?${query.toString()}`;
}

function renderCard(item) {
  const node = els.cardTemplate.content.firstElementChild.cloneNode(true);
  const progress = state.progress[item.id];

  const thumb = node.querySelector(".thumb");
  if (item.metadata.poster) {
    thumb.style.backgroundImage = `url('${item.metadata.poster}')`;
  }

  node.querySelector("h3").textContent = item.title;
  node.querySelector(".meta").textContent = [
    item.type === "series" && item.season && item.episode ? `S${item.season}E${item.episode}` : item.type,
    item.year || "year n/a",
    progress ? formatPercent(progress.percent) : "new",
  ].join(" • ");

  node.querySelector(".progress-line span").style.width = `${Math.min(100, progress?.percent || 0)}%`;

  node.querySelector(".play").addEventListener("click", () => goToDetail(item.id, true));
  node.querySelector(".details").addEventListener("click", () => goToDetail(item.id));
  node.querySelector(".refresh").addEventListener("click", () => refreshMetadata(item.id));
  node.querySelector(".delete").addEventListener("click", () => {
    if (!confirm(`Remove "${item.title}" from the library?`)) return;
    deleteItem(item.id);
  });

  return node;
}

async function deleteItem(id) {
  try {
    const data = await fetchJson(`/api/library/${id}`, { method: "DELETE" });
    logAction(`Removed ${data.removed.title} from library.`);
    await loadLibrary(els.searchInput.value.trim());
  } catch (error) {
    els.statusText.textContent = error.message;
    logAction(`Delete failed: ${error.message}`);
  }
}

function renderLibrary() {
  els.movieRow.innerHTML = "";
  els.seriesRow.innerHTML = "";

  for (const item of state.movies) {
    els.movieRow.appendChild(renderCard(item));
  }

  for (const item of state.series) {
    els.seriesRow.appendChild(renderCard(item));
  }
}

function renderStats(summary = {}) {
  els.movieStats.textContent = `${summary.movies ?? 0} movies`;
  els.seriesStats.textContent = `${summary.series ?? 0} series`;
}

async function loadLibrary(query = "") {
  const data = await fetchJson(`/api/library?q=${encodeURIComponent(query)}`);
  state.items = data.items;
  state.progress = data.progress;
  state.nextUp = data.nextUp;
  state.movies = data.items.filter((i) => i.type === "movie");
  state.series = data.items.filter((i) => i.type === "series");

  renderStats(data.summary);
  renderHero(data);
  renderLibrary();
}

function setFolderLabel(path) {
  activeFolder = path || localStorage.getItem("ui-streamer-folder");
  if (activeFolder) {
    localStorage.setItem("ui-streamer-folder", activeFolder);
    els.folderLabel.textContent = activeFolder;
    els.topbarFolder?.classList.remove("empty");
  } else {
    els.folderLabel.textContent = "No folder yet";
    els.topbarFolder?.classList.add("empty");
  }
}

async function addPath() {
  const value = els.pathInput.value.trim();
  if (!value) {
    els.statusText.textContent = "Please enter a folder path.";
    return;
  }

  els.statusText.textContent = "Scanning folder and scraping IMDb metadata...";

  try {
    const result = await fetchJson("/api/library/add-path", {
      method: "POST",
      body: JSON.stringify({ path: value }),
    });
    els.statusText.textContent = `Added ${result.added} new files.`;
    logAction(`Path scan ${value} -> ${result.added} files added.`, result.items?.map((item) => item.fileName));
    await loadLibrary(els.searchInput.value.trim());
    if (result.added) {
      setFolderLabel(value);
    }
  } catch (error) {
    els.statusText.textContent = error.message;
    logAction(`Path scan failed: ${error.message}`);
  }
}

function logAction(message, details = []) {
  if (!els.actionLog) return;
  const entry = document.createElement("li");
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  entry.textContent = `[${time}] ${message}`;
  els.actionLog.prepend(entry);
  if (details.length) {
    const detailList = document.createElement("ul");
    details.forEach((detail) => {
      const detailItem = document.createElement("li");
      detailItem.textContent = detail;
      detailList.appendChild(detailItem);
    });
    els.actionLog.prepend(detailList);
  }
  const maxEntries = 5;
  while (els.actionLog.children.length > maxEntries) {
    els.actionLog.removeChild(els.actionLog.lastChild);
  }
}

async function refreshMetadata(id) {
  try {
    await fetchJson(`/api/library/${id}/refresh-metadata`, { method: "POST" });
    await loadLibrary(els.searchInput.value.trim());
  } catch (error) {
    els.statusText.textContent = `Metadata update failed: ${error.message}`;
  }
}

function wireActions() {
  els.addPathBtn.addEventListener("click", addPath);
  els.uploadBtn.addEventListener("click", uploadFolder);
  els.refreshBtn.addEventListener("click", () => loadLibrary(els.searchInput.value.trim()));

  els.searchInput.addEventListener("input", () => {
    loadLibrary(els.searchInput.value.trim()).catch((error) => {
      els.statusText.textContent = error.message;
    });
  });

  els.playNextBtn.addEventListener("click", () => {
    if (state.nextUp?.id) {
      goToDetail(state.nextUp.id, true);
    }
  });

  els.openLibraryBtn.addEventListener("click", () => {
    document.getElementById("movieRow").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  els.openFolderBtn.addEventListener("click", () => {
    toggleAddPathModal(true);
    els.statusText.textContent = "Enter a new folder path and click Add Path.";
  });

  els.openAddPathBtn.addEventListener("click", () => toggleAddPathModal(true));
  els.closeAddModalBtn.addEventListener("click", () => toggleAddPathModal(false));
  els.addPathModal.addEventListener("click", (event) => {
    if (event.target === els.addPathModal) {
      toggleAddPathModal(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.addPathModal.classList.contains("active")) {
      toggleAddPathModal(false);
    }
  });
}

async function init() {
  wireActions();

  try {
    await loadLibrary();
  } catch (error) {
    els.statusText.textContent = error.message;
  }

  setFolderLabel(activeFolder);
}

init();
