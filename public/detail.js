const params = new URLSearchParams(window.location.search);
const mediaId = params.get("id");
const autoplay = params.get("autoplay") === "1";

const els = {
  detailPoster: document.getElementById("detailPoster"),
  detailType: document.getElementById("detailType"),
  detailTitle: document.getElementById("detailTitle"),
  detailSubtitle: document.getElementById("detailSubtitle"),
  detailPlot: document.getElementById("detailPlot"),
  detailGenres: document.getElementById("detailGenres"),
  detailCast: document.getElementById("detailCast"),
  detailRuntime: document.getElementById("detailRuntime"),
  detailRating: document.getElementById("detailRating"),
  detailVideo: document.getElementById("detailVideo"),
  pagePlay: document.getElementById("pagePlay"),
  pageRefresh: document.getElementById("pageRefresh"),
  detailRewind: document.getElementById("detailRewind"),
  detailForward: document.getElementById("detailForward"),
  playerPlay: document.getElementById("playerPlay"),
  playerPause: document.getElementById("playerPause"),
  playerFullscreen: document.getElementById("playerFullscreen"),
  progressBar: document.getElementById("progressBar"),
  currentTime: document.getElementById("currentTime"),
  duration: document.getElementById("duration"),
  volumeBar: document.getElementById("volumeBar"),
  qualityChip: document.getElementById("qualityChip"),
  qualityText: document.getElementById("qualityText"),
  focusTitle: document.getElementById("focusTitle"),
  focusMeta: document.getElementById("focusMeta"),
};

if (!mediaId) {
  document.body.innerHTML = "<p style='padding:2rem;color:#fff'>No media selected. Return to the library.</p>";
  throw new Error("Missing media id");
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

function formatWatchProgress(progress) {
  if (!progress || !progress.percent) return "Not started";
  return `${Math.round(progress.percent)}% watched`;
}

async function loadDetail() {
  const detail = await fetchJson(`/api/library/${mediaId}`);
  const item = detail.item;
  const progress = detail.progress;

  els.detailTitle.textContent = item.title;
  els.detailType.textContent = item.type === "series" ? "TV Series" : "Movie";
  els.detailSubtitle.textContent = [item.year || "Year n/a", formatWatchProgress(progress)].join(" • ");
  els.detailPlot.textContent = item.metadata.plot || "Plot unavailable.";
  els.detailGenres.textContent = (item.metadata.genres || []).join(", ") || "N/A";
  els.detailCast.textContent = (item.metadata.cast || []).join(", ") || "N/A";
  els.detailRuntime.textContent = item.metadata.runtime || "Runtime unavailable";
  els.detailRating.textContent = item.metadata.rating ? `${item.metadata.rating}/10` : "N/A";
  els.detailPoster.style.backgroundImage = item.metadata.poster ? `url('${item.metadata.poster}')` : "none";

  setupVideoPlayer(item.id, progress);
}

function setupVideoPlayer(id, progress) {
  els.detailVideo.src = `/api/stream/${id}`;
  els.detailVideo.onloadedmetadata = () => {
    if (progress?.currentTime && els.detailVideo.duration) {
      const resumeTime = Math.min(progress.currentTime, els.detailVideo.duration - 1);
      els.detailVideo.currentTime = resumeTime;
    }
    if (autoplay) {
      els.detailVideo.play().catch(() => {});
    }
    syncProgressUI();
  };
}

let progressThrottle = null;

async function saveDetailProgress() {
  const duration = els.detailVideo.duration;
  if (!duration || !Number.isFinite(duration)) return;

  await fetchJson(`/api/progress/${mediaId}`, {
    method: "POST",
    body: JSON.stringify({ currentTime: els.detailVideo.currentTime, duration }),
  });
}

els.detailVideo.addEventListener("timeupdate", () => {
  syncProgressUI();
  if (progressThrottle) return;
  progressThrottle = setTimeout(async () => {
    await saveDetailProgress();
    progressThrottle = null;
  }, 2000);
});

els.detailVideo.addEventListener("ended", async () => {
  await saveDetailProgress();
});

els.progressBar.addEventListener("input", () => {
  const percent = Number(els.progressBar.value);
  if (els.detailVideo.duration) {
    els.detailVideo.currentTime = (percent / 100) * els.detailVideo.duration;
  }
});

els.volumeBar.addEventListener("input", () => {
  els.detailVideo.volume = Number(els.volumeBar.value);
});

els.playerPlay.addEventListener("click", () => els.detailVideo.play().catch(() => {}));
els.playerPause.addEventListener("click", () => els.detailVideo.pause());

els.detailRewind.addEventListener("click", () => {
  if (!Number.isFinite(els.detailVideo.currentTime)) return;
  els.detailVideo.currentTime = Math.max(0, els.detailVideo.currentTime - 10);
});

els.detailForward.addEventListener("click", () => {
  if (!Number.isFinite(els.detailVideo.currentTime)) return;
  const duration = Number.isFinite(els.detailVideo.duration) ? els.detailVideo.duration : els.detailVideo.currentTime + 10;
  els.detailVideo.currentTime = Math.min(duration, els.detailVideo.currentTime + 10);
});

els.playerFullscreen.addEventListener("click", () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    els.detailVideo.requestFullscreen().catch(() => {});
  }
});

function syncProgressUI() {
  const current = els.detailVideo.currentTime || 0;
  const total = els.detailVideo.duration || 0;
  els.currentTime.textContent = formatTime(current);
  els.duration.textContent = total ? formatTime(total) : "0:00";
  els.progressBar.value = total ? (current / total) * 100 : 0;
  els.focusTitle.textContent = els.detailTitle.textContent;
  els.focusMeta.textContent = `${els.detailSubtitle.textContent} • ${Math.max(0, Math.floor((current / total) * 100) || 0)}%`;
  const quality = total ? (total > 3600 ? "HD" : "SD") : "Auto";
  els.qualityChip.setAttribute("aria-label", `Stream quality ${quality}`);
  els.qualityChip.title = `Quality: ${quality}`;
  if (els.qualityText) {
    els.qualityText.textContent = quality;
  }
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
}

els.pagePlay.addEventListener("click", () => {
  els.detailVideo.play().catch(() => {});
});

els.pageRefresh.addEventListener("click", async () => {
  try {
    await fetchJson(`/api/library/${mediaId}/refresh-metadata`, { method: "POST" });
    await loadDetail();
  } catch (error) {
    alert(`Metadata refresh failed: ${error.message}`);
  }
});

loadDetail().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<p style='padding:2rem;color:#fff'>${error.message}</p>`;
});
