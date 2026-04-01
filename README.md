# UI Streamer (Netflix-style local streamer)

A lightweight full-stack app to manage and stream your local movies/series with a Netflix-like homepage.

## Features

- Netflix-inspired landing UI with hero, continue watching, and next-up behavior
- **Separate Movies & Series rows** with horizontal scrolling (Netflix-style)
- **Detailed modal view** for each title with full IMDb metadata and reviews
- **Local IMDb caching** to avoid re-scraping and improve performance
- Add local media by:
  - Absolute folder path scan from server machine
  - Folder upload from browser (files are copied to server `uploads/`)
- Local library persistence (`data/library.json`)
- Search by title/type/year/genre
- Playback with:
  - Native controls
  - Quick seek buttons (-10s / +10s)
  - Auto-save watch progress
  - Resume from last watched position
- Auto next-up suggestion for partially watched items / next series episode
- IMDb scraping integration for:
  - Poster, rating, genres, plot, runtime, cast
  - Review snippets
  - IMDb link

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start app:
   ```bash
   npm start
   ```
3. Open:
   `http://localhost:3000`

## Notes

- Supported video extensions: `.mp4`, `.mkv`, `.webm`, `.mov`, `.avi`, `.m4v`
- IMDb metadata is cached locally in `data/imdb-cache.json` to avoid repeated requests
- If metadata is missing, use **Update IMDb** per card to re-fetch details
- Click **Details** on any card to see full information in a modal view
