import 'vidstack/player/styles/default/theme.css';
import 'vidstack/player/styles/default/layouts/video.css';
import { createPlayer } from 'vidstack/player';

let currentPlayer = null;

export function initializeVideoPlayer(container, videoSrc, options = {}) {
  // Destroy existing player if any
  if (currentPlayer) {
    currentPlayer.destroy();
    currentPlayer = null;
  }

  // Create new Vidstack player
  currentPlayer = createPlayer({
    target: container,
    props: {
      src: videoSrc,
      title: options.title || '',
      poster: options.poster || '',
      autoplay: options.autoplay || false,
      controls: false, // We'll use custom controls
      loop: options.loop || false,
      muted: options.muted || false,
      volume: options.volume || 1,
      currentTime: options.currentTime || 0,
      playsInline: options.playsInline || true,
      crossOrigin: options.crossOrigin || 'anonymous',
      ...options.customProps
    }
  });

  // Set up event listeners
  currentPlayer.addEventListener('provider-change', (event) => {
    const provider = event.detail;
    console.log('Video provider changed:', provider);
  });

  currentPlayer.addEventListener('can-play', () => {
    console.log('Video can play');
  });

  currentPlayer.addEventListener('play', () => {
    console.log('Video playing');
    if (options.onPlay) options.onPlay();
  });

  currentPlayer.addEventListener('pause', () => {
    console.log('Video paused');
    if (options.onPause) options.onPause();
  });

  currentPlayer.addEventListener('time-update', (event) => {
    if (options.onTimeUpdate) {
      options.onTimeUpdate({
        currentTime: event.detail.currentTime,
        duration: event.detail.duration
      });
    }
  });

  currentPlayer.addEventListener('ended', () => {
    console.log('Video ended');
    if (options.onEnded) options.onEnded();
  });

  currentPlayer.addEventListener('error', (event) => {
    console.error('Video error:', event.detail);
    if (options.onError) options.onError(event.detail);
  });

  return currentPlayer;
}

export function getPlayer() {
  return currentPlayer;
}

export function destroyPlayer() {
  if (currentPlayer) {
    currentPlayer.destroy();
    currentPlayer = null;
  }
}

export function updatePlayerSrc(newSrc) {
  if (currentPlayer) {
    currentPlayer.src = newSrc;
  }
}

export function play() {
  if (currentPlayer) {
    currentPlayer.play();
  }
}

export function pause() {
  if (currentPlayer) {
    currentPlayer.pause();
  }
}

export function setCurrentTime(time) {
  if (currentPlayer) {
    currentPlayer.currentTime = time;
  }
}

export function setVolume(volume) {
  if (currentPlayer) {
    currentPlayer.volume = Math.max(0, Math.min(1, volume));
  }
}

export function setMuted(muted) {
  if (currentPlayer) {
    currentPlayer.muted = muted;
  }
}

export function requestFullscreen() {
  if (currentPlayer) {
    currentPlayer.requestFullscreen();
  }
}

export function exitFullscreen() {
  if (currentPlayer) {
    currentPlayer.exitFullscreen();
  }
}
