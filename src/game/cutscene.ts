const CLASS_VIDEOS = new Map([
  ['trex', './assets/cutscenes/intro_trex.mp4'],
  ['velociraptor', './assets/cutscenes/intro_velociraptor.mp4'],
  ['triceratops', './assets/cutscenes/intro_triceratops.mp4'],
  ['dodo', './assets/cutscenes/intro_dodo.mp4'],
  ['pteranodon', './assets/cutscenes/intro_pteranodon.mp4'],
]);

const FADE_MS = 240;
const PLAYBACK_TIMEOUT_MS = 8000;

export function playClassCutscene(
  root: HTMLElement,
  options: { classId: string; className: string; muted: boolean },
): Promise<void> {
  const src = CLASS_VIDEOS.get(options.classId);
  if (!src) return Promise.resolve();

  const overlay = document.createElement('div');
  overlay.id = 'cutscene-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'cutscene-title');

  const video = document.createElement('video');
  video.className = 'cutscene-video';
  video.playsInline = true;
  video.preload = 'auto';
  video.muted = options.muted;

  const vignette = document.createElement('div');
  vignette.className = 'cutscene-vignette';
  vignette.setAttribute('aria-hidden', 'true');

  const footer = document.createElement('div');
  footer.className = 'cutscene-footer';

  const caption = document.createElement('h2');
  caption.id = 'cutscene-title';
  caption.className = 'cutscene-caption';
  caption.textContent = options.className;

  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'cutscene-skip-btn';
  skip.textContent = 'Saltar [Espacio / Esc]';

  footer.append(caption, skip);
  overlay.append(video, vignette, footer);

  return new Promise<void>((resolve) => {
    const listeners = new AbortController();
    const { signal } = listeners;
    let fadeTimer: number | undefined;
    let playbackTimer: number | undefined;
    const heldSkipKeys = new Set<string>();

    function clearPlaybackTimer(): void {
      window.clearTimeout(playbackTimer);
      playbackTimer = undefined;
    }

    function finish(): void {
      listeners.abort();
      window.clearTimeout(fadeTimer);
      clearPlaybackTimer();
      video.pause();
      video.removeAttribute('src');
      video.load();
      overlay.remove();
      if (heldSkipKeys.size) ignoreHeldSkipKeys(heldSkipKeys);
      resolve();
    }

    function watchPlayback(): void {
      playbackTimer ??= window.setTimeout(finish, PLAYBACK_TIMEOUT_MS);
    }

    function fadeOut(): void {
      if (fadeTimer !== undefined) return;
      clearPlaybackTimer();
      overlay.classList.add('cutscene-fade-out');
      video.pause();
      fadeTimer = window.setTimeout(finish, FADE_MS);
    }

    video.addEventListener('playing', clearPlaybackTimer, { signal });
    video.addEventListener('waiting', watchPlayback, { signal });
    video.addEventListener('ended', fadeOut, { signal });
    video.addEventListener('error', finish, { signal });
    overlay.addEventListener('click', fadeOut, { signal });
    window.addEventListener('keydown', (event) => {
      event.stopImmediatePropagation();
      if (event.key === 'Tab') event.preventDefault();
      if (event.key !== ' ' && event.key !== 'Escape' && event.key !== 'Enter') return;
      event.preventDefault();
      heldSkipKeys.add(event.key);
      fadeOut();
    }, { capture: true, signal });
    window.addEventListener('keyup', (event) => heldSkipKeys.delete(event.key), { capture: true, signal });
    window.addEventListener('blur', () => heldSkipKeys.clear(), { signal });

    async function play(): Promise<void> {
      try {
        await video.play();
      } catch (error) {
        if (signal.aborted || fadeTimer !== undefined) return;
        if (!(error instanceof DOMException) || error.name !== 'NotAllowedError' || video.muted) {
          finish();
          return;
        }

        video.muted = true;
        try {
          await video.play();
        } catch {
          if (!signal.aborted && fadeTimer === undefined) finish();
        }
      }
    }

    root.append(overlay);
    skip.focus({ preventScroll: true });
    watchPlayback();
    video.src = src;
    void play();
  });
}

// A held Space or Escape can still generate keydowns after the fade.
function ignoreHeldSkipKeys(keys: Set<string>): void {
  const listeners = new AbortController();
  const options = { capture: true, signal: listeners.signal };
  function release(event: KeyboardEvent): void {
    keys.delete(event.key);
    if (!keys.size) listeners.abort();
  }
  window.addEventListener('keydown', (event) => {
    if (!keys.has(event.key)) return;
    if (event.repeat) {
      event.preventDefault();
      event.stopImmediatePropagation();
    } else {
      release(event);
    }
  }, options);
  window.addEventListener('keyup', release, options);
  window.addEventListener('blur', () => listeners.abort(), options);
}
