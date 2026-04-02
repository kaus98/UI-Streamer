const express = require("express");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const LIBRARY_FILE = path.join(DATA_DIR, "library.json");
const IMDB_CACHE_FILE = path.join(DATA_DIR, "imdb-cache.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOADS_DIR = path.join(__dirname, "uploads");

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".webm", ".mov", ".avi", ".m4v"]);

app.use(express.json({ limit: "2mb" }));
app.use(express.static(PUBLIC_DIR));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, UPLOADS_DIR),
    filename: (_, file, cb) => {
      const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${stamp}-${safeName}`);
    },
  }),
});

app.delete("/api/library/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readLibrary();
    const index = data.items.findIndex((x) => x.id === id);
    if (index === -1) {
      return res.status(404).json({ error: "Item not found" });
    }

    const [removed] = data.items.splice(index, 1);
    if (data.progress[id]) {
      delete data.progress[id];
    }

    await writeLibrary(data);
    res.json({ removed });
  } catch (error) {
    res.status(500).json({ error: "Failed to remove item", detail: error.message });
  }
});

app.post("/api/library/:id/manual-imdb", async (req, res) => {
  try {
    const { id } = req.params;
    const imdbUrlRaw = String(req.body.imdbUrl || "").trim();
    if (!imdbUrlRaw) {
      return res.status(400).json({ error: "IMDb URL is required" });
    }

    let parsed;
    try {
      parsed = new URL(imdbUrlRaw);
    } catch {
      return res.status(400).json({ error: "Invalid IMDb URL" });
    }

    if (!/imdb\.com$/i.test(parsed.hostname)) {
      return res.status(400).json({ error: "Please provide a valid imdb.com URL" });
    }

    const titleMatch = parsed.pathname.match(/\/title\/(tt\d+)/i);
    if (!titleMatch) {
      return res.status(400).json({ error: "IMDb title URL must include /title/tt..." });
    }

    const titlePath = `/title/${titleMatch[1]}/`;
    const imdbUrl = `https://www.imdb.com${titlePath}`;
    const reviewsUrl = `${imdbUrl}reviews`;

    const data = await readLibrary();
    const item = data.items.find((x) => x.id === id);
    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    const [titleRes, reviewsRes] = await Promise.all([
      fetchImdbPage(imdbUrl),
      fetchImdbPage(reviewsUrl).catch(() => ({ data: "" })),
    ]);

    const meta = extractImdbMetaFromHtml({
      imdbUrl,
      titlePath,
      titleHtml: titleRes.data,
      reviewsHtml: reviewsRes.data,
    });

    if (!isMetaUseful(meta)) {
      return res.status(404).json({ error: "Could not extract useful metadata from provided IMDb URL" });
    }

    item.metadata = { ...item.metadata, ...meta };

    const cache = await readImdbCache();
    cache[makeCacheKey(item.title, item.year)] = item.metadata;
    await writeImdbCache(cache);

    await writeLibrary(data);
    res.json({ item });
  } catch (error) {
    res.status(500).json({ error: "Failed to apply manual IMDb metadata", detail: error.message });
  }
});

async function ensureStorage() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(UPLOADS_DIR, { recursive: true });
  try {
    await fsp.access(LIBRARY_FILE);
  } catch {
    const seed = { items: [], progress: {}, lastUpdated: null };
    await fsp.writeFile(LIBRARY_FILE, JSON.stringify(seed, null, 2), "utf8");
  }
  try {
    await fsp.access(IMDB_CACHE_FILE);
  } catch {
    await fsp.writeFile(IMDB_CACHE_FILE, JSON.stringify({}), "utf8");
  }
}

async function enrichLibraryItemWithImdb(item) {
  try {
    const imdbMeta = await scrapeImdbMeta(item.title, item.year);
    if (imdbMeta) item.metadata = imdbMeta;
  } catch (error) {
    console.error(`[IMDB] Failed for ${item.title} (${item.year}):`, error.message);
  }
}

async function readLibrary() {
  const raw = await fsp.readFile(LIBRARY_FILE, "utf8");
  return JSON.parse(raw);
}

async function writeLibrary(data) {
  data.lastUpdated = new Date().toISOString();
  await fsp.writeFile(LIBRARY_FILE, JSON.stringify(data, null, 2), "utf8");
}

async function readImdbCache() {
  try {
    const raw = await fsp.readFile(IMDB_CACHE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeImdbCache(cache) {
  await fsp.writeFile(IMDB_CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
}

function makeCacheKey(title, year) {
  return `${title.toLowerCase().trim()}|${year || ""}`;
}

function toId(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseMediaName(fileName) {
  const name = path.parse(fileName).name;
  const normalized = name.replace(/[._]/g, " ").replace(/\s+/g, " ").trim();

  const seasonEpisodeMatch = normalized.match(/s(\d{1,2})e(\d{1,2})/i);
  const yearMatch = normalized.match(/(19\d{2}|20\d{2})/);

  if (seasonEpisodeMatch) {
    const season = Number(seasonEpisodeMatch[1]);
    const episode = Number(seasonEpisodeMatch[2]);
    const title = normalized
      .replace(/s\d{1,2}e\d{1,2}.*/i, "")
      .replace(/\b(19\d{2}|20\d{2})\b/, "")
      .trim();

    return {
      inferredTitle: title || normalized,
      type: "series",
      season,
      episode,
      year: yearMatch ? Number(yearMatch[1]) : null,
    };
  }

  const title = normalized.replace(/\b(19\d{2}|20\d{2})\b/, "").trim();

  return {
    inferredTitle: title || normalized,
    type: "movie",
    season: null,
    episode: null,
    year: yearMatch ? Number(yearMatch[1]) : null,
  };
}

async function walkMediaFiles(dirPath) {
  const entries = await fsp.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkMediaFiles(fullPath)));
      continue;
    }

    if (VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
}

function buildLibraryItem(filePath, rootPath) {
  const stats = fs.statSync(filePath);
  const fileName = path.basename(filePath);
  const parsed = parseMediaName(fileName);
  const relativePath = path.relative(rootPath, filePath);
  const parentDir = path.dirname(relativePath).split(path.sep)[0] || "";

  const baseId = `${parsed.inferredTitle}-${parsed.year || "na"}-${relativePath}`;

  return {
    id: toId(baseId),
    title: parsed.inferredTitle,
    type: parsed.type,
    season: parsed.season,
    episode: parsed.episode,
    year: parsed.year,
    duration: null,
    fileName,
    filePath,
    relativePath,
    parentDir,
    fileSize: stats.size,
    addedAt: new Date().toISOString(),
    metadata: {
      source: null,
      imdbId: null,
      imdbUrl: null,
      poster: null,
      rating: null,
      genres: [],
      plot: null,
      runtime: null,
      cast: [],
      reviews: [],
    },
  };
}

function safeJsonParseLD(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseImdbDuration(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/i);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  if (!hours && !minutes) return null;
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function pickPrimaryLdObject($) {
  const scripts = $("script[type='application/ld+json']")
    .map((_, el) => safeJsonParseLD($(el).contents().text()))
    .get()
    .filter(Boolean);

  const nodes = scripts.flatMap((node) => {
    if (Array.isArray(node)) return node;
    if (node && Array.isArray(node["@graph"])) return node["@graph"];
    return [node];
  });

  return (
    nodes.find((node) => {
      const types = normalizeArray(node?.["@type"]).map((x) => String(x || "").toLowerCase());
      return types.some((t) => ["movie", "tvseries", "tvepisode", "tvminiseries"].includes(t));
    }) || null
  );
}

function isMetaUseful(meta) {
  if (!meta) return false;
  return Boolean(meta.poster || meta.rating || meta.plot || (meta.genres && meta.genres.length));
}

function extractImdbMetaFromHtml({ imdbUrl, titlePath, titleHtml, reviewsHtml }) {
  const $ = cheerio.load(titleHtml || "");
  const $reviews = cheerio.load(reviewsHtml || "");

  const ld = pickPrimaryLdObject($);
  const ldImage = normalizeArray(ld?.image)[0];
  const ldImageUrl = typeof ldImage === "string" ? ldImage : ldImage?.url;
  const ldRating = Number(ld?.aggregateRating?.ratingValue);
  const ldGenres = normalizeArray(ld?.genre)
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  const ldCast = normalizeArray(ld?.actor)
    .map((actor) => (typeof actor === "string" ? actor : actor?.name))
    .map((name) => String(name || "").trim())
    .filter(Boolean);

  const posterFallback =
    $(".ipc-media img.ipc-image").first().attr("src") ||
    $("img.ipc-image").first().attr("src") ||
    $(".poster img").first().attr("src") ||
    "";

  const poster = (ldImageUrl || posterFallback || "").trim() || null;
  const ratingText =
    $("span[data-testid='hero-rating-bar__aggregate-rating__score'] span").first().text() ||
    $("span[data-testid='rating-score--score']").first().text() ||
    "";
  const ratingFromText = parseFloat(String(ratingText).replace(/[^\d.]/g, ""));

  const runtimeFromLd = parseImdbDuration(ld?.duration);
  const runtimeFallback =
    $("li[data-testid='title-techspec_runtime'] .ipc-metadata-list-item__list-content-item").first().text() ||
    $("li[data-testid='title-techspec_runtime']").first().text() ||
    "";

  return {
    source: imdbUrl,
    imdbId: titlePath.replace(/^\/title\//, "").replace(/\/$/, ""),
    imdbUrl,
    poster,
    rating: Number.isFinite(ldRating) ? ldRating : Number.isFinite(ratingFromText) ? ratingFromText : null,
    genres: (
      ldGenres.length
        ? ldGenres
        : $("a[href*='/search/title/?genres='] span, li[data-testid='storyline-genres'] a")
            .map((_, el) => $(el).text())
            .get()
    )
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .slice(0, 5),
    plot: (
      ld?.description ||
      $("span[data-testid='plot-xl']").first().text() ||
      $("span[data-testid='plot-xs_to_m']").first().text() ||
      $("meta[name='description']").attr("content") ||
      ""
    ).trim(),
    runtime: (runtimeFromLd || runtimeFallback || "").trim() || null,
    cast: (
      ldCast.length
        ? ldCast
        : $("[data-testid='title-cast-item'] a[data-testid='title-cast-item__actor']")
            .map((_, el) => $(el).text())
            .get()
    )
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .slice(0, 8),
    reviews: $reviews(".review-container")
      .map((_, el) => {
        const $r = $reviews(el);
        const author = $r.find("a.display-name-link").first().text().trim();
        const rating = $r.find(".lister-item-header span.ipl-rating-star").first().text().trim();
        const text = pickReviewText($r);
        return text ? { author, rating, text } : null;
      })
      .get()
      .filter(Boolean)
      .slice(0, 3),
  };
}

function pickReviewText($reviewNode) {
  const body = $reviewNode.find(".ipc-html-content-inner-div").first().text().trim();
  if (body) return body;
  return $reviewNode.find("div.text.show-more__control").first().text().trim();
}

async function fetchImdbPage(url) {
  try {
    return await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 10000 });
  } catch (error) {
    const proxyUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`;
    return await axios.get(proxyUrl, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 15000 });
  }
}

async function scrapeImdbMeta(title, year) {
  const key = makeCacheKey(title, year);
  const cache = await readImdbCache();
  if (isMetaUseful(cache[key])) {
    return cache[key];
  }

  const query = `${title} ${year || ""}`.trim();
  const searchUrl = `https://www.imdb.com/find/?q=${encodeURIComponent(query)}&s=tt&ttype=ft`;

  try {
    const searchResponse = await fetchImdbPage(searchUrl);
    const $search = cheerio.load(searchResponse.data);
    const firstResultHref =
      $search("a.ipc-metadata-list-summary-item__t").first().attr("href") ||
      $search("a[data-testid='title-result']").first().attr("href") ||
      $search("li.find-result a").first().attr("href") ||
      $search("a[href^='/title/tt']").first().attr("href");

    if (!firstResultHref) {
      console.warn(`[IMDB] No search result for: ${query}`);
      return null;
    }

    const titlePath = firstResultHref.split("?")[0];
    const imdbUrl = `https://www.imdb.com${titlePath}`;
    const reviewsUrl = `${imdbUrl}reviews`;

    const [titleRes, reviewsRes] = await Promise.all([
      fetchImdbPage(imdbUrl),
      fetchImdbPage(reviewsUrl).catch(() => ({ data: "" })),
    ]);

    const meta = extractImdbMetaFromHtml({
      imdbUrl,
      titlePath,
      titleHtml: titleRes.data,
      reviewsHtml: reviewsRes.data,
    });

    cache[key] = meta;
    await writeImdbCache(cache);
    return meta;
  } catch (error) {
    console.error(`[IMDB] Scrape error for ${query}:`, error.message);
    return cache[key] || null;
  }
}

function getLastWatched(data) {
  const entries = Object.entries(data.progress)
    .map(([id, value]) => ({ id, ...value }))
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  return entries[0] || null;
}

function computeNextUp(data) {
  const progressEntries = Object.entries(data.progress).map(([id, p]) => ({ id, ...p }));
  const partiallyWatched = progressEntries
    .filter((p) => p.percent > 5 && p.percent < 95)
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

  if (partiallyWatched.length) {
    return data.items.find((item) => item.id === partiallyWatched[0].id) || null;
  }

  const seriesItems = data.items
    .filter((item) => item.type === "series")
    .sort((a, b) => {
      if (a.title !== b.title) return a.title.localeCompare(b.title);
      if ((a.season || 0) !== (b.season || 0)) return (a.season || 0) - (b.season || 0);
      return (a.episode || 0) - (b.episode || 0);
    });

  for (const episode of seriesItems) {
    const p = data.progress[episode.id];
    if (!p || p.percent < 95) {
      return episode;
    }
  }

  return data.items[0] || null;
}

app.get("/api/library", async (req, res) => {
  try {
    const data = await readLibrary();
    const q = (req.query.q || "").toString().trim().toLowerCase();

    let items = data.items;
    if (q) {
      items = items.filter((item) => {
        const hay = `${item.title} ${item.type} ${item.year || ""} ${(item.metadata.genres || []).join(" ")}`.toLowerCase();
        return hay.includes(q);
      });
    }

    const byId = Object.fromEntries(data.items.map((item) => [item.id, item]));
    const lastWatched = getLastWatched(data);
    const nextUp = computeNextUp(data);

    const grouped = {};
    for (const item of items) {
      const key = item.parentDir || "_root";
      if (!grouped[key]) grouped[key] = { type: "folder", name: key, items: [] };
      grouped[key].items.push(item);
    }

    const folders = Object.values(grouped).map(folder => ({
      id: toId(`folder-${folder.name}`),
      title: folder.name,
      type: "folder",
      items: folder.items,
      summary: {
        total: folder.items.length,
        movies: folder.items.filter(i => i.type === "movie").length,
        series: folder.items.filter(i => i.type === "series").length,
      }
    }));

    res.json({
      items,
      folders,
      progress: data.progress,
      summary: {
        total: items.length,
        movies: items.filter((i) => i.type === "movie").length,
        series: items.filter((i) => i.type === "series").length,
      },
      lastWatched: lastWatched ? { ...lastWatched, item: byId[lastWatched.id] || null } : null,
      nextUp,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to read library", detail: error.message });
  }
});

app.post("/api/library/upload", upload.array("mediaFiles", 300), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const mediaFiles = files.filter((file) => VIDEO_EXTENSIONS.has(path.extname(file.originalname).toLowerCase()));
    if (!mediaFiles.length) {
      return res.status(400).json({ error: "No supported media files in upload" });
    }

    const data = await readLibrary();
    const existingByPath = new Set(data.items.map((item) => item.filePath));
    const added = [];

    for (const file of mediaFiles) {
      if (existingByPath.has(file.path)) continue;
      const item = buildLibraryItem(file.path, UPLOADS_DIR);
      item.relativePath = file.originalname;
      item.source = "upload";
      await enrichLibraryItemWithImdb(item);
      data.items.push(item);
      added.push(item);
    }

    await writeLibrary(data);
    res.json({ added: added.length, items: added });
  } catch (error) {
    res.status(500).json({ error: "Failed to upload media", detail: error.message });
  }
});

app.post("/api/library/add-path", async (req, res) => {
  try {
    const inputPath = (req.body.path || "").toString().trim();
    if (!inputPath) {
      return res.status(400).json({ error: "Path is required" });
    }

    const resolvedPath = path.resolve(inputPath);
    const stats = await fsp.stat(resolvedPath).catch(() => null);
    if (!stats || !stats.isDirectory()) {
      return res.status(400).json({ error: "Path must be an existing directory" });
    }

    const mediaFiles = await walkMediaFiles(resolvedPath);
    if (!mediaFiles.length) {
      return res.status(400).json({ error: "No supported media files found" });
    }

    const data = await readLibrary();
    const existingByPath = new Set(data.items.map((item) => item.filePath));

    const added = [];
    for (const filePath of mediaFiles) {
      if (existingByPath.has(filePath)) continue;
      const item = buildLibraryItem(filePath, resolvedPath);
      await enrichLibraryItemWithImdb(item);
      data.items.push(item);
      added.push(item);
    }

    await writeLibrary(data);
    res.json({ added: added.length, items: added });
  } catch (error) {
    res.status(500).json({ error: "Failed to add media path", detail: error.message });
  }
});

app.post("/api/library/:id/refresh-metadata", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readLibrary();
    const item = data.items.find((x) => x.id === id);

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    const imdbMeta = await scrapeImdbMeta(item.title, item.year);
    if (!imdbMeta) {
      return res.status(404).json({ error: "IMDb metadata not found" });
    }

    item.metadata = imdbMeta;
    await writeLibrary(data);
    res.json({ item });
  } catch (error) {
    res.status(500).json({ error: "Failed to refresh metadata", detail: error.message });
  }
});

app.get("/api/library/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readLibrary();
    const item = data.items.find((x) => x.id === id);
    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    const progress = data.progress[id] || null;
    res.json({ item, progress });
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve item", detail: error.message });
  }
});

app.get("/api/library/folder/:folderId", async (req, res) => {
  try {
    const { folderId } = req.params;
    const data = await readLibrary();
    const folderName = folderId.replace(/^folder-/, "");
    const items = data.items.filter(item => (item.parentDir || "_root") === folderName);

    const groupedBySeries = {};
    for (const item of items) {
      const key = item.type === "series" ? item.title : item.id;
      if (!groupedBySeries[key]) {
        groupedBySeries[key] = {
          id: item.type === "series" ? toId(`series-${item.title}`) : item.id,
          title: item.type === "series" ? item.title : item.title,
          type: item.type,
          year: item.year,
          metadata: item.metadata,
          episodes: [],
        };
      }
      if (item.type === "series") {
        groupedBySeries[key].episodes.push(item);
      } else {
        groupedBySeries[key].movie = item;
      }
    }

    const result = Object.values(groupedBySeries).map(entry => ({
      id: entry.id,
      title: entry.title,
      type: entry.type,
      year: entry.year,
      metadata: entry.metadata,
      ...(entry.type === "series" ? { episodes: entry.episodes.sort((a, b) => (a.season || 0) - (b.season || 0) || (a.episode || 0) - (b.episode || 0)) } : { movie: entry.movie }),
    }));

    res.json({ items: result });
  } catch (error) {
    res.status(500).json({ error: "Failed to load folder contents", detail: error.message });
  }
});

app.post("/api/progress/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const currentTime = Number(req.body.currentTime || 0);
    const duration = Number(req.body.duration || 0);

    if (!Number.isFinite(currentTime) || !Number.isFinite(duration)) {
      return res.status(400).json({ error: "Invalid currentTime or duration" });
    }

    const data = await readLibrary();
    const percent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

    data.progress[id] = {
      currentTime,
      duration,
      percent,
      updatedAt: new Date().toISOString(),
    };

    await writeLibrary(data);
    res.json({ ok: true, progress: data.progress[id] });
  } catch (error) {
    res.status(500).json({ error: "Failed to save progress", detail: error.message });
  }
});

app.get("/api/stream/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readLibrary();
    const item = data.items.find((x) => x.id === id);

    if (!item) {
      return res.status(404).send("Media item not found");
    }

    const filePath = item.filePath;
    const stat = await fsp.stat(filePath).catch(() => null);
    if (!stat) {
      return res.status(404).send("Media file not found on disk");
    }

    const fileSize = stat.size;
    const range = req.headers.range;
    const ext = path.extname(filePath).toLowerCase();

    const contentTypeMap = {
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".mkv": "video/x-matroska",
      ".mov": "video/quicktime",
      ".avi": "video/x-msvideo",
      ".m4v": "video/x-m4v",
    };

    const contentType = contentTypeMap[ext] || "application/octet-stream";

    if (range) {
      const [startRaw, endRaw] = range.replace(/bytes=/, "").split("-");
      let start = Number.isNaN(parseInt(startRaw, 10)) ? 0 : parseInt(startRaw, 10);
      let end = Number.isNaN(parseInt(endRaw, 10)) ? fileSize - 1 : parseInt(endRaw, 10);
      start = Math.min(Math.max(0, start), fileSize - 1);
      end = Math.min(Math.max(start, end), fileSize - 1);
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": contentType,
      });

      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": contentType,
    });

    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    res.status(500).send(`Streaming failed: ${error.message}`);
  }
});

app.get("*", (_, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

ensureStorage()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`UI Streamer running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
