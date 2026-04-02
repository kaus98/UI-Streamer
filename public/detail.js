const params = new URLSearchParams(window.location.search);
const mediaId = params.get("id");
const autoplay = params.get("autoplay") === "1";

const els = {
  detailTitle: document.getElementById("detailTitle"),
  detailType: document.getElementById("detailType"),
  detailSubtitle: document.getElementById("detailSubtitle"),
  detailPlot: document.getElementById("detailPlot"),
  detailGenres: document.getElementById("detailGenres"),
  detailCast: document.getElementById("detailCast"),
  detailRuntime: document.getElementById("detailRuntime"),
  detailRating: document.getElementById("detailRating"),
  detailPoster: document.getElementById("detailPoster"),
  videoSurface: document.getElementById("videoSurface"),
  videoPlayer: document.getElementById("videoPlayer"),
  videoTitle: document.getElementById("videoTitle"),
  videoMeta: document.getElementById("videoMeta"),
  playPauseBtn: document.getElementById("playPauseBtn"),
  volumeBtn: document.getElementById("volumeBtn"),
  volumeSlider: document.getElementById("volumeSlider"),
  progressSlider: document.getElementById("progressSlider"),
  currentTime: document.getElementById("currentTime"),
  duration: document.getElementById("duration"),
  fullscreenBtn: document.getElementById("fullscreenBtn"),
  qualityChip: document.getElementById("qualityChip"),
  playerLoader: document.getElementById("playerLoader"),
  pagePlay: document.getElementById("pagePlay"),
  pageRefresh: document.getElementById("pageRefresh"),
  manualImdbBox: document.getElementById("manualImdbBox"),
  manualImdbInput: document.getElementById("manualImdbInput"),
  manualImdbBtn: document.getElementById("manualImdbBtn"),
  manualImdbStatus: document.getElementById("manualImdbStatus"),
};

const state = {
  itemId: null,
  controlsTimer: null,
  syncTimer: null,
  isDraggingProgress: false,
  lastSyncAt: 0,
  singleTapTimer: null,
};

if (!mediaId) {
  document.body.innerHTML = "<p style='padding:2rem;color:var(--text-primary)'>No media selected. Return to the library.</p>";
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

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
}

function formatWatchProgress(progress) {
  if (!progress || !progress.percent) return "Not started";
  return `${Math.round(progress.percent)}% watched`;
}

function setPlayingUI(isPlaying) {
  const icon = els.playPauseBtn.querySelector(".icon-mark svg");
  if (isPlaying) {
    icon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"/>';
    els.playPauseBtn.setAttribute("aria-label", "Pause");
    els.videoSurface.classList.add("is-playing");
  } else {
    icon.innerHTML = '<path d="M8 5l11 7-11 7z" fill="currentColor"/>';
    els.playPauseBtn.setAttribute("aria-label", "Play");
    els.videoSurface.classList.remove("is-playing");
  }
}

function togglePlayback() {
  if (els.videoPlayer.paused) {
    els.videoPlayer.play().catch(() => {});
  } else {
    els.videoPlayer.pause();
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    els.videoSurface.requestFullscreen?.().catch(() => {});
  }
}

function setLoadingUI(isLoading) {
  if (!els.playerLoader) return;
  els.playerLoader.classList.toggle("active", isLoading);
  els.playerLoader.setAttribute("aria-hidden", isLoading ? "false" : "true");
}

function showManualImdbPrompt(message = "") {
  if (!els.manualImdbBox) return;
  els.manualImdbBox.hidden = false;
  if (message && els.manualImdbStatus) {
    els.manualImdbStatus.textContent = message;
  }
}

function hideManualImdbPrompt() {
  if (!els.manualImdbBox) return;
  els.manualImdbBox.hidden = true;
  if (els.manualImdbStatus) {
    els.manualImdbStatus.textContent = "";
  }
}

function setVolumeUI() {
  const icon = els.volumeBtn.querySelector(".icon-mark svg");
  const video = els.videoPlayer;
  const isMuted = video.muted || video.volume === 0;
  els.volumeSlider.value = String(video.volume);

  if (isMuted) {
    icon.innerHTML = '<path d="M4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73L19.73 21 21 19.73 4.27 3zm10.23 3.7v2.06c2.89.86 5 3.54 5 6.71 0 .94-.2 1.82-.54 2.64l1.51 1.51A8.97 8.97 0 0 0 21 15.47c0-4.28-2.99-7.86-7-8.77z" fill="currentColor"/>';
    els.volumeBtn.setAttribute("aria-label", "Unmute");
  } else if (video.volume < 0.5) {
    icon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05A4.49 4.49 0 0 0 16.5 12z" fill="currentColor"/>';
    els.volumeBtn.setAttribute("aria-label", "Mute");
  } else {
    icon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm12.5 3c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 3.17-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71z" fill="currentColor"/>';
    els.volumeBtn.setAttribute("aria-label", "Mute");
  }
}

function updateProgressUI() {
  const video = els.videoPlayer;
  els.currentTime.textContent = formatTime(video.currentTime);
  els.duration.textContent = formatTime(video.duration);
  if (!state.isDraggingProgress) {
    const percent = video.duration ? (video.currentTime / video.duration) * 100 : 0;
    els.progressSlider.value = String(percent);
  }
}

function showControls() {
  clearTimeout(state.controlsTimer);
  els.videoSurface.classList.add("show-controls");
  els.videoSurface.classList.remove("controls-hidden");

  if (!els.videoPlayer.paused) {
    state.controlsTimer = setTimeout(() => {
      els.videoSurface.classList.remove("show-controls");
      els.videoSurface.classList.add("controls-hidden");
    }, 2500);
  }
}

function seekBy(seconds) {
  const video = els.videoPlayer;
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const next = Math.max(0, Math.min(duration, video.currentTime + seconds));
  video.currentTime = next;
}

async function saveProgress(force = false) {
  if (!state.itemId) return;

  const now = Date.now();
  if (!force && now - state.lastSyncAt < 10000) return;

  const video = els.videoPlayer;
  if (!Number.isFinite(video.duration) || video.duration <= 0) return;

  state.lastSyncAt = now;

  try {
    await fetchJson(`/api/progress/${state.itemId}`, {
      method: "POST",
      body: JSON.stringify({
        currentTime: video.currentTime,
        duration: video.duration,
      }),
    });
  } catch (error) {
    console.error("Failed to sync progress:", error);
  }
}

function startProgressSync() {
  clearInterval(state.syncTimer);
  state.syncTimer = setInterval(() => {
    void saveProgress(false);
  }, 10000);
}

function stopProgressSync() {
  clearInterval(state.syncTimer);
  state.syncTimer = null;
}

function setupVideoPlayer(item, progress) {
  state.itemId = item.id;
  els.videoPlayer.src = `/stream/${item.id}`;
  els.videoPlayer.currentTime = Number(progress?.currentTime || 0);
  els.videoPlayer.volume = 0.8;
  els.videoPlayer.muted = false;

  els.videoTitle.textContent = item.title;
  els.videoMeta.textContent = [
    item.type === "series" && item.season && item.episode ? `S${item.season}E${item.episode}` : item.type,
    item.year || "Year n/a",
  ].join(" • ");

  els.qualityChip.textContent = "LOCAL";

  setPlayingUI(false);
  setVolumeUI();
  updateProgressUI();

  if (autoplay) {
    els.videoPlayer.play().catch(() => {
      showControls();
    });
  }
}

function wirePlayerControls() {
  els.playPauseBtn.addEventListener("click", () => {
    togglePlayback();
  });

  els.pagePlay?.addEventListener("click", () => {
    togglePlayback();
  });

  els.volumeBtn.addEventListener("click", () => {
    els.videoPlayer.muted = !els.videoPlayer.muted;
    setVolumeUI();
  });

  els.volumeSlider.addEventListener("input", (event) => {
    const value = Number(event.target.value);
    els.videoPlayer.volume = Math.max(0, Math.min(1, value));
    if (els.videoPlayer.volume > 0) {
      els.videoPlayer.muted = false;
    }
    setVolumeUI();
  });

  els.progressSlider.addEventListener("pointerdown", () => {
    state.isDraggingProgress = true;
  });

  els.progressSlider.addEventListener("input", (event) => {
    const percent = Number(event.target.value);
    const duration = els.videoPlayer.duration || 0;
    const targetTime = (percent / 100) * duration;
    els.currentTime.textContent = formatTime(targetTime);
  });

  els.progressSlider.addEventListener("change", (event) => {
    const percent = Number(event.target.value);
    const duration = els.videoPlayer.duration || 0;
    els.videoPlayer.currentTime = (percent / 100) * duration;
    state.isDraggingProgress = false;
    void saveProgress(true);
  });

  els.progressSlider.addEventListener("pointerup", () => {
    state.isDraggingProgress = false;
  });

  els.fullscreenBtn.addEventListener("click", () => {
    toggleFullscreen();
  });

  els.videoSurface.addEventListener("mousemove", showControls);
  els.videoSurface.addEventListener("mouseenter", showControls);
  els.videoSurface.addEventListener("mouseleave", () => {
    if (!els.videoPlayer.paused) {
      els.videoSurface.classList.remove("show-controls");
      els.videoSurface.classList.add("controls-hidden");
    }
  });

  els.videoSurface.addEventListener("click", (event) => {
    if (event.target.closest("button") || event.target.closest("input")) return;
    clearTimeout(state.singleTapTimer);
    state.singleTapTimer = setTimeout(() => {
      togglePlayback();
      showControls();
    }, 220);
  });

  els.videoSurface.addEventListener("dblclick", (event) => {
    if (event.target.closest("button") || event.target.closest("input")) return;
    clearTimeout(state.singleTapTimer);
    toggleFullscreen();
    showControls();
  });

  els.videoPlayer.addEventListener("loadedmetadata", updateProgressUI);
  els.videoPlayer.addEventListener("loadstart", () => setLoadingUI(true));
  els.videoPlayer.addEventListener("waiting", () => setLoadingUI(true));
  els.videoPlayer.addEventListener("seeking", () => setLoadingUI(true));
  els.videoPlayer.addEventListener("stalled", () => setLoadingUI(true));
  els.videoPlayer.addEventListener("canplay", () => setLoadingUI(false));
  els.videoPlayer.addEventListener("playing", () => setLoadingUI(false));
  els.videoPlayer.addEventListener("timeupdate", () => {
    updateProgressUI();
    void saveProgress(false);
  });
  els.videoPlayer.addEventListener("play", () => {
    setPlayingUI(true);
    showControls();
    startProgressSync();
  });
  els.videoPlayer.addEventListener("pause", () => {
    setPlayingUI(false);
    setLoadingUI(false);
    showControls();
    stopProgressSync();
    void saveProgress(true);
  });
  els.videoPlayer.addEventListener("volumechange", setVolumeUI);
  els.videoPlayer.addEventListener("ended", () => {
    stopProgressSync();
    setPlayingUI(false);
    void saveProgress(true);
  });

  document.addEventListener("keydown", (event) => {
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    switch (event.key.toLowerCase()) {
      case " ":
      case "k":
        event.preventDefault();
        if (els.videoPlayer.paused) {
          els.videoPlayer.play().catch(() => {});
        } else {
          els.videoPlayer.pause();
        }
        break;
      case "arrowleft":
        event.preventDefault();
        seekBy(-5);
        showControls();
        break;
      case "arrowright":
        event.preventDefault();
        seekBy(5);
        showControls();
        break;
      case "m":
        event.preventDefault();
        els.videoPlayer.muted = !els.videoPlayer.muted;
        setVolumeUI();
        break;
      case "f":
        event.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          els.videoSurface.requestFullscreen?.().catch(() => {});
        }
        break;
      default:
        break;
    }
  });
}

async function loadDetail() {
  const detail = await fetchJson(`/api/library/item/${mediaId}`);
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

  const hasUsefulMeta = Boolean(
    item.metadata?.plot || item.metadata?.poster || item.metadata?.rating || (item.metadata?.genres || []).length
  );
  if (hasUsefulMeta) {
    hideManualImdbPrompt();
  }

  setupVideoPlayer(item, progress);
}

els.pageRefresh?.addEventListener("click", async () => {
  hideManualImdbPrompt();
  try {
    await fetchJson(`/api/library/${mediaId}/refresh-metadata`, { method: "POST" });
    await loadDetail();
  } catch (error) {
    showManualImdbPrompt(`Auto fetch failed: ${error.message}`);
  }
});

els.manualImdbBtn?.addEventListener("click", async () => {
  const imdbUrl = String(els.manualImdbInput?.value || "").trim();
  if (!imdbUrl) {
    showManualImdbPrompt("Please paste a valid IMDb title URL.");
    return;
  }

  if (els.manualImdbStatus) {
    els.manualImdbStatus.textContent = "Applying IMDb details...";
  }

  try {
    await fetchJson(`/api/library/${mediaId}/manual-imdb`, {
      method: "POST",
      body: JSON.stringify({ imdbUrl }),
    });
    if (els.manualImdbStatus) {
      els.manualImdbStatus.textContent = "IMDb details applied successfully.";
    }
    await loadDetail();
    hideManualImdbPrompt();
  } catch (error) {
    showManualImdbPrompt(`Manual IMDb link failed: ${error.message}`);
  }
});

wirePlayerControls();

loadDetail().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<p style='padding:2rem;color:var(--text-primary)'>${error.message}</p>`;
});
