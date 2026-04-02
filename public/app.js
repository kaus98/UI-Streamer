const state = {
  items: [],
  progress: {},
  nextUp: null,
  folders: [],
  movies: [],
  series: [],
  activeFolder: null,
  carouselIndex: 0,
  carouselItems: [],
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
  folderRow: document.getElementById("folderRow"),
  myListRow: document.getElementById("myListRow"),
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
  heroCarousel: document.getElementById("heroCarousel"),
  carouselContainer: document.getElementById("carouselContainer"),
  carouselNav: document.getElementById("carouselNav"),
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

function renderFolderCard(folder) {
  const node = els.cardTemplate.content.firstElementChild.cloneNode(true);
  node.classList.add("folder-card");
  node.dataset.folderId = folder.id;

  const thumb = node.querySelector(".thumb");
  thumb.style.backgroundImage = "none";
  thumb.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:2.5rem;opacity:0.6;">
    <svg viewBox="0 0 24 24" role="presentation" style="width:3rem;height:3rem"><path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8zm-1 1h8l3 3v8H4V5h5z" fill="currentColor"/></svg>
  </div>`;

  node.querySelector("h3").textContent = folder.title || "Root";
  node.querySelector(".meta").textContent = `${folder.summary.movies} movies • ${folder.summary.series} series`;

  node.querySelector(".progress-line span").style.width = "0%";

  const actions = node.querySelector(".card-actions");
  actions.innerHTML = `
    <button class="browse primary icon-only" aria-label="Browse folder" type="button">
      <span class="icon-mark" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M9 3l5 5-5 5M3 12h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    </button>
  `;
  actions.querySelector(".browse").addEventListener("click", () => {
    window.location.href = `/folder.html?id=${folder.id}`;
  });

  return node;
}

function renderCarousel() {
  if (!state.carouselItems.length) {
    els.heroCarousel.style.display = "none";
    return;
  }

  els.heroCarousel.style.display = "block";
  els.carouselContainer.innerHTML = "";
  els.carouselNav.innerHTML = "";

  state.carouselItems.forEach((item, index) => {
    const slide = document.createElement("div");
    slide.className = `carousel-slide ${index === state.carouselIndex ? "active" : ""}`;
    
    slide.innerHTML = `
      <div class="carousel-slide-backdrop" style="${item.metadata.poster ? `background-image: url('${item.metadata.poster}')` : ""}"></div>
      <div class="carousel-content">
        <h2 class="carousel-title">${item.title}</h2>
        <p class="carousel-meta">${[item.type, item.year || "Year n/a"].join(" • ")}</p>
        <p class="carousel-description">${item.metadata.plot || "No description available."}</p>
        <div class="carousel-actions">
          <button class="primary icon-only" aria-label="Play" type="button">
            <span class="icon-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="presentation"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>
            </span>
            <span>Play</span>
          </button>
          <button class="ghost icon-only" aria-label="More Info" type="button">
            <span class="icon-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="presentation"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 10v6M12 7h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </span>
            <span>More Info</span>
          </button>
        </div>
      </div>
      <div class="carousel-poster" style="${item.metadata.poster ? `background-image: url('${item.metadata.poster}')` : ""}"></div>
    `;

    slide.querySelector(".primary").addEventListener("click", () => {
      window.location.href = `/detail.html?id=${item.id}&autoplay=1`;
    });
    slide.querySelector(".ghost").addEventListener("click", () => {
      window.location.href = `/detail.html?id=${item.id}`;
    });

    els.carouselContainer.appendChild(slide);

    const dot = document.createElement("button");
    dot.className = `carousel-dot ${index === state.carouselIndex ? "active" : ""}`;
    dot.setAttribute("aria-label", `Go to slide ${index + 1}`);
    dot.addEventListener("click", () => setCarouselSlide(index));
    els.carouselNav.appendChild(dot);
  });
}

function setCarouselSlide(index) {
  state.carouselIndex = index;
  const slides = els.carouselContainer.querySelectorAll(".carousel-slide");
  const dots = els.carouselNav.querySelectorAll(".carousel-dot");
  
  slides.forEach((slide, i) => {
    slide.classList.toggle("active", i === index);
  });
  
  dots.forEach((dot, i) => {
    dot.classList.toggle("active", i === index);
  });
}

function startCarouselAutoplay() {
  setInterval(() => {
    if (state.carouselItems.length > 1) {
      const nextIndex = (state.carouselIndex + 1) % state.carouselItems.length;
      setCarouselSlide(nextIndex);
    }
  }, 5000);
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
  els.myListRow.innerHTML = "";

  if (state.folders && els.folderRow) {
    els.folderRow.innerHTML = "";
    for (const folder of state.folders) {
      els.folderRow.appendChild(renderFolderCard(folder));
    }
  }

  for (const item of state.movies) {
    els.movieRow.appendChild(renderCard(item));
  }

  for (const item of state.series) {
    els.seriesRow.appendChild(renderCard(item));
  }

  const recentlyWatched = state.items
    .filter(item => state.progress[item.id] && state.progress[item.id].percent > 0)
    .sort((a, b) => new Date(state.progress[b.id].updatedAt) - new Date(state.progress[a.id].updatedAt))
    .slice(0, 5);

  for (const item of recentlyWatched) {
    els.myListRow.appendChild(renderCard(item));
  }

  if (!recentlyWatched.length) {
    els.myListRow.innerHTML = "<p class='helper'>No recently watched items.</p>";
  }

  renderCarousel();
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
  state.folders = data.folders;

  state.movies = state.items.filter((i) => i.type === "movie");
  state.series = state.items.filter((i) => i.type === "series");

  state.carouselItems = state.items
    .filter(item => item.metadata.poster)
    .sort(() => Math.random() - 0.5)
    .slice(0, 5);

  renderStats(data.summary);
  renderLibrary();
  startCarouselAutoplay();
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

  if (els.playNextBtn) {
    els.playNextBtn.addEventListener("click", () => {
      if (state.nextUp?.id) {
        goToDetail(state.nextUp.id, true);
      }
    });
  }

  if (els.openLibraryBtn) {
    els.openLibraryBtn.addEventListener("click", () => {
      document.getElementById("movieRow").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (els.openFolderBtn) {
    els.openFolderBtn.addEventListener("click", () => {
      toggleAddPathModal(true);
      els.statusText.textContent = "Enter a new folder path and click Add Path.";
    });
  }

  if (els.openAddPathBtn) {
    els.openAddPathBtn.addEventListener("click", () => toggleAddPathModal(true));
  }
  if (els.closeAddModalBtn) {
    els.closeAddModalBtn.addEventListener("click", () => toggleAddPathModal(false));
  }
  if (els.addPathModal) {
    els.addPathModal.addEventListener("click", (event) => {
      if (event.target === els.addPathModal) {
        toggleAddPathModal(false);
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.addPathModal?.classList.contains("active")) {
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
