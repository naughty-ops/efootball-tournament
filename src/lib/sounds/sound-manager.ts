/**
 * Centralized eFootball UI Sound Effects (SFX) System
 *
 * Provides responsive, low-latency, leak-free sound effects for interactive UI elements.
 * STRICTLY sound effects only — no background music, no looping, no volume settings.
 */

// Sound asset paths
const SOUND_TOUCH_SRC = '/sounds/efootball-touch-2.mp3';
const SOUND_CONNECTING_SRC = '/sounds/efootball-connecting.mp3';

// Fixed volume levels
const TOUCH_VOLUME = 0.35;
const CONNECTING_VOLUME = 0.5;

// Throttling and cooldowns
const TOUCH_COOLDOWN_MS = 60;
const CONNECTING_COOLDOWN_MS = 800;

let lastTouchTime = 0;
let lastConnectingTime = 0;

// Audio pooling for touch sound (prevents GC pressure and enables rapid, crisp playback)
const TOUCH_POOL_SIZE = 3;
let touchPool: HTMLAudioElement[] = [];
let touchPoolIndex = 0;

let connectingAudio: HTMLAudioElement | null = null;
let isAudioInitialized = false;

/**
 * Initialize and preload audio elements lazily in browser context.
 */
export function preloadSounds(): void {
  if (typeof window === 'undefined') return;
  if (isAudioInitialized) return;

  try {
    // 1. Initialize Touch Audio Pool
    touchPool = [];
    for (let i = 0; i < TOUCH_POOL_SIZE; i++) {
      const audio = new Audio();
      audio.src = SOUND_TOUCH_SRC;
      audio.preload = 'auto';
      audio.volume = TOUCH_VOLUME;
      touchPool.push(audio);
    }

    // 2. Initialize Connecting Sound Element
    connectingAudio = new Audio();
    connectingAudio.src = SOUND_CONNECTING_SRC;
    connectingAudio.preload = 'auto';
    connectingAudio.volume = CONNECTING_VOLUME;

    isAudioInitialized = true;

    // 3. Prepare unlock on first permitted user gesture (handles mobile / desktop autoplay policies)
    const unlockAudio = () => {
      // Warm up one pool item silently to satisfy autoplay gesture requirements
      if (touchPool.length > 0) {
        const testAudio = touchPool[0];
        const prevVol = testAudio.volume;
        testAudio.volume = 0;
        testAudio
          .play()
          .then(() => {
            testAudio.pause();
            testAudio.currentTime = 0;
            testAudio.volume = prevVol;
          })
          .catch(() => {
            testAudio.volume = prevVol;
          });
      }

      window.removeEventListener('pointerdown', unlockAudio, true);
      window.removeEventListener('keydown', unlockAudio, true);
    };

    window.addEventListener('pointerdown', unlockAudio, { capture: true, once: true });
    window.addEventListener('keydown', unlockAudio, { capture: true, once: true });
  } catch (err) {
    console.warn('Audio preloading encountered a non-fatal error:', err);
  }
}

// Auto-prewarm sound pool in browser context on initial script evaluation
if (typeof window !== 'undefined') {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    preloadSounds();
  } else {
    window.addEventListener('DOMContentLoaded', preloadSounds, { once: true });
  }
}

/**
 * Play eFootball Touch 2 SFX
 * Used for button clicks, tab switches, sidebar items, modal triggers, and UI controls.
 */
export function playTouch(): void {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  if (now - lastTouchTime < TOUCH_COOLDOWN_MS) {
    return; // Prevent chaotic overlapping during rapid clicks
  }
  lastTouchTime = now;

  if (!isAudioInitialized) {
    preloadSounds();
  }

  try {
    if (touchPool.length > 0) {
      const audio = touchPool[touchPoolIndex];
      touchPoolIndex = (touchPoolIndex + 1) % TOUCH_POOL_SIZE;

      audio.currentTime = 0;
      audio.volume = TOUCH_VOLUME;
      audio.play().catch(() => {
        // Autoplay restrictions or background tab: silently ignore to never break UI
      });
    }
  } catch {
    // Never allow audio failures to disrupt website interactions
  }
}

/**
 * Play eFootball Connecting SFX
 * Triggered strictly when backend confirms tournament registration success.
 */
export function playConnecting(): void {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  if (now - lastConnectingTime < CONNECTING_COOLDOWN_MS) {
    return; // Prevent duplicate playback from React re-renders or rapid submits
  }
  lastConnectingTime = now;

  if (!isAudioInitialized) {
    preloadSounds();
  }

  try {
    if (connectingAudio) {
      connectingAudio.currentTime = 0;
      connectingAudio.volume = CONNECTING_VOLUME;
      connectingAudio.play().catch(() => {
        // Autoplay restrictions: silently ignore
      });
    }
  } catch {
    // Never allow audio failures to disrupt website interactions
  }
}
