import { initializeVideoPlayer, getPlayer, destroyPlayer } from './vidstack-player.js';

const params = new URLSearchParams(window.location.search);
const mediaId = params.get("id");
const autoplay = params.has("autoplay");

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
  controlsPanel: document.getElementById("controlsPanel"),
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
  pageRefresh: document.getElementById("pageRefresh"),
};

let player = null;
let controlsTimeout = null;
let isPlaying = false;

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
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatWatchProgress(progress) {
  if (!progress || !progress.percent) return "Not started";
  return `${Math.round(progress.percent)}% watched`;
}

function showControls() {
  els.videoSurface.classList.remove("controls-hidden");
  els.videoSurface.classList.add("show-controls");
  clearTimeout(controlsTimeout);
  if (isPlaying) {
    controlsTimeout = setTimeout(() => {
      els.videoSurface.classList.remove("show-controls");
      els.videoSurface.classList.add("controls-hidden");
    }, 3000);
  }
}

function hideControls() {
  if (isPlaying) {
    els.videoSurface.classList.remove("show-controls");
    els.videoSurface.classList.add("controls-hidden");
  }
}

function updatePlayPauseButton() {
  const icon = els.playPauseBtn.querySelector(".icon-mark svg");
  if (isPlaying) {
    icon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"/>';
    els.playPauseBtn.setAttribute("aria-label", "Pause");
  } else {
    icon.innerHTML = '<path d="M8 5l11 7-11 7z" fill="currentColor"/>';
    els.playPauseBtn.setAttribute("aria-label", "Play");
  }
}

function updateVolumeButton() {
  const player = getPlayer();
  if (!player) return;
  
  const icon = els.volumeBtn.querySelector(".icon-mark svg");
  if (player.muted || player.volume === 0) {
    icon.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 15.14 21 13.62 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27l7.73 7.73L6 17.27V19h2l4.81-4.81L19.73 21 21 19.73 4.27 3z" fill="currentColor"/>';
    els.volumeBtn.setAttribute("aria-label", "Unmute");
  } else if (player.volume < 0.5) {
    icon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" fill="currentColor"/>';
    els.volumeBtn.setAttribute("aria-label", "Volume");
  } else {
    icon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9zm12.5 0c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5S14 11.33 14 10.5s.67-1.5 1.5-1.5z" fill="currentColor"/>';
    els.volumeBtn.setAttribute("aria-label", "Volume");
  }
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

  els.videoTitle.textContent = item.title;
  els.videoMeta.textContent = [item.type === "series" && item.season && item.episode ? `S${item.season}E${item.episode}` : item.type, item.year || "Year n/a"].join(" • ");

  setupVideoPlayer(item.id, progress);
}

function setupVideoPlayer(itemId, progress) {
  const videoSrc = `/stream/${itemId}`;
  const posterSrc = els.detailPoster.style.backgroundImage.slice(5, -2);

  player = initializeVideoPlayer(els.videoPlayer, videoSrc, {
    title: els.videoTitle.textContent,
    poster: posterSrc,
    autoplay: autoplay,
    currentTime: progress?.currentTime || 0,
    volume: 0.8,
    muted: false,
    onPlay: () => {
      isPlaying = true;
      updatePlayPauseButton();
      showControls();
      syncProgress(itemId);
    },
    onPause: () => {
      isPlaying = false;
      updatePlayPauseButton();
      showControls();
    },
    onTimeUpdate: ({ currentTime, duration }) => {
      els.currentTime.textContent = formatTime(currentTime);
      els.duration.textContent = formatTime(duration);
      els.progressSlider.value = duration ? (currentTime / duration) * 100 : 0;
    },
    onEnded: () => {
      isPlaying = false;
      updatePlayPauseButton();
      markAsComplete(itemId);
    },
    onError: (error) => {
      console.error("Video player error:", error);
    }
  });

  setupControls();
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
}

function setupControls() {
  // Play/Pause button
  els.playPauseBtn.addEventListener("click", () => {
    const player = getPlayer();
    if (player) {
      if (isPlaying) {
        player.pause();
      } else {
        player.play();
      }
    }
  });

  // Volume controls
  els.volumeBtn.addEventListener("click", () => {
    const player = getPlayer();
    if (player) {
      player.muted = !player.muted;
      updateVolumeButton();
    }
  });

  els.volumeSlider.addEventListener("input", (e) => {
    const player = getPlayer();
    if (player) {
      const volume = parseFloat(e.target.value);
      player.volume = volume;
      player.muted = volume === 0;
      updateVolumeButton();
    }
  });

  // Progress slider
  els.progressSlider.addEventListener("input", (e) => {
    const player = getPlayer();
    if (player) {
      const percent = parseFloat(e.target.value);
      const time = (percent / 100) * player.duration;
      player.currentTime = time;
    }
  });

  // Fullscreen
  els.fullscreenBtn.addEventListener("click", () => {
    const player = getPlayer();
    if (player) {
      if (document.fullscreenElement) {
        player.exitFullscreen();
      } else {
        player.requestFullscreen();
      }
    }
  });

  // Video surface interactions
  els.videoSurface.addEventListener("mousemove", showControls);
  els.videoSurface.addEventListener("mouseenter", showControls);
  els.videoSurface.addEventListener("mouseleave", hideControls);

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    const player = getPlayer();
    if (!player) return;

    switch (e.key) {
      case " ":
      case "k":
        e.preventDefault();
        if (isPlaying) {
          player.pause();
        } else {
          player.play();
        }
        break;
      case "f":
        e.preventDefault();
        if (document.fullscreenElement) {
          player.exitFullscreen();
        } else {
          player.requestFullscreen();
        }
        break;
      case "m":
        e.preventDefault();
        player.muted = !player.muted;
        updateVolumeButton();
        break;
      case "ArrowLeft":
        e.preventDefault();
        player.currentTime = Math.max(0, player.currentTime - 5);
        break;
      case "ArrowRight":
        e.preventDefault();
        player.currentTime = Math.min(player.duration, player.currentTime + 5);
        break;
    }
  });

  updatePlayPauseButton();
  updateVolumeButton();
}

async function syncProgress(itemId) {
  const player = getPlayer();
  if (!player) return;

  try {
    await fetchJson(`/api/progress/${itemId}`, {
      method: "POST",
      body: JSON.stringify({
        currentTime: player.currentTime,
        duration: player.duration,
        percent: (player.currentTime / player.duration) * 100,
      }),
    });
  } catch (error) {
    console.error("Failed to sync progress:", error);
  }
}

async function markAsComplete(itemId) {
  try {
    await fetchJson(`/api/progress/${itemId}`, {
      method: "POST",
      body: JSON.stringify({
        currentTime: 0,
        duration: 0,
        percent: 100,
      }),
    });
  } catch (error) {
    console.error("Failed to mark as complete:", error);
  }
}

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
  document.body.innerHTML = `<p style='padding:2rem;color:var(--text-primary)'>${error.message}</p>`;
});
