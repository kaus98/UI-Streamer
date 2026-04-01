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
  if (progressThrottle) return;
  progressThrottle = setTimeout(async () => {
    await saveDetailProgress();
    progressThrottle = null;
  }, 3000);
});

els.detailVideo.addEventListener("ended", async () => {
  await saveDetailProgress();
});

els.detailRewind.addEventListener("click", () => {
  if (!Number.isFinite(els.detailVideo.currentTime)) return;
  els.detailVideo.currentTime = Math.max(0, els.detailVideo.currentTime - 10);
});

els.detailForward.addEventListener("click", () => {
  if (!Number.isFinite(els.detailVideo.currentTime)) return;
  const duration = Number.isFinite(els.detailVideo.duration) ? els.detailVideo.duration : els.detailVideo.currentTime + 10;
  els.detailVideo.currentTime = Math.min(duration, els.detailVideo.currentTime + 10);
});

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
