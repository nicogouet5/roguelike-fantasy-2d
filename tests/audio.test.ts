import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BODOQUE_SCORE } from '../src/audio/synth.ts';

describe('Bodoque final-battle score', () => {
  it('uses a full sixteen-bar original progression in both phases', () => {
    expect(BODOQUE_SCORE.bpm).toBe(100);
    expect(BODOQUE_SCORE.stepsPerBar).toBe(8);
    expect(BODOQUE_SCORE.phaseOne).toHaveLength(BODOQUE_SCORE.barsPerCycle);
    expect(BODOQUE_SCORE.phaseTwo).toHaveLength(BODOQUE_SCORE.barsPerCycle);
    expect(new Set(BODOQUE_SCORE.phaseOne.map((bar) => bar.root)).size).toBeGreaterThan(3);
  });

  it('raises the rhythmic and melodic density for phase two', () => {
    const phaseOneNotes = BODOQUE_SCORE.phaseOne.flatMap((bar) => bar.melody).filter((note) => note !== null).length;
    const phaseTwoNotes = BODOQUE_SCORE.phaseTwo.flatMap((bar) => bar.melody).filter((note) => note !== null).length;

    expect(phaseTwoNotes).toBeGreaterThan(phaseOneNotes);
    expect(BODOQUE_SCORE.phaseTwo).not.toEqual(BODOQUE_SCORE.phaseOne);
  });
});

describe('game music playback', () => {
  const tracks: MockAudio[] = [];
  const playResult = vi.fn<() => Promise<void>>();

  class MockAudio {
    loop = false;
    preload = '';
    volume = 1;
    muted = false;
    paused = true;
    onerror: (() => void) | null = null;

    constructor(readonly src: string) {
      tracks.push(this);
    }

    play = vi.fn(() => {
      this.paused = false;
      return playResult();
    });

    pause = vi.fn(() => {
      this.paused = true;
    });

    removeAttribute = vi.fn();
    load = vi.fn();
  }

  const timers = {
    setInterval: vi.fn((callback: () => void, delay: number) => setInterval(callback, delay)),
    clearInterval: vi.fn((timer: ReturnType<typeof setInterval>) => clearInterval(timer)),
  };

  function enableWebAudio(): void {
    class MockAudioContext {
      // Keep the graph suspended so the tests can inspect the fallback timer without decoding audio.
      state = 'suspended';
      sampleRate = 1;
      currentTime = 0;
      destination = {};
      resume = vi.fn().mockResolvedValue(undefined);

      createGain() {
        return {
          gain: { value: 0, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() },
          connect: vi.fn(),
        };
      }

      createDynamicsCompressor() {
        return { threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect: vi.fn() };
      }

      createBuffer() {
        return { getChannelData: () => new Float32Array(1) };
      }
    }

    vi.stubGlobal('window', { ...timers, AudioContext: MockAudioContext });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  }

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
    vi.clearAllMocks();
    tracks.length = 0;
    playResult.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('window', timers);
    vi.stubGlobal('Audio', MockAudio);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits for unlock, crossfades looping tracks, and fades to silence on title return', async () => {
    const { audioManager } = await import('../src/audio/synth.ts');
    audioManager.setMusicTrack('floor1');
    expect(tracks).toHaveLength(0);

    audioManager.unlock();
    const first = tracks[0]!;
    expect(first.src).toBe('./assets/music/bgm_floor1.mp3');
    expect(first.loop).toBe(true);
    expect(first.preload).toBe('auto');
    expect(first.play).toHaveBeenCalledOnce();
    expect(first.volume).toBe(0);
    await vi.advanceTimersByTimeAsync(450);
    expect(first.volume).toBeCloseTo(0.8);

    let startNextTrack!: () => void;
    playResult.mockReturnValueOnce(new Promise<void>((resolve) => {
      startNextTrack = resolve;
    }));
    audioManager.setMusicTrack('floor2');
    const second = tracks[1]!;
    expect(second.src).toBe('./assets/music/bgm_floor2.mp3');
    await vi.advanceTimersByTimeAsync(450);
    expect(first.volume).toBeCloseTo(0.8);
    expect(second.volume).toBe(0);

    startNextTrack();
    await vi.advanceTimersByTimeAsync(225);
    expect(first.paused).toBe(false);
    expect(first.volume).toBeCloseTo(0.4);
    expect(second.volume).toBeCloseTo(0.4);
    await vi.advanceTimersByTimeAsync(225);
    expect(first.paused).toBe(true);
    expect(first.removeAttribute).toHaveBeenCalledWith('src');
    expect(second.volume).toBeCloseTo(0.8);

    audioManager.setMusicTrack(null);
    await vi.advanceTimersByTimeAsync(225);
    expect(second.volume).toBeCloseTo(0.4);
    await vi.advanceTimersByTimeAsync(225);
    expect(second.paused).toBe(true);
    audioManager.unlock();
    expect(second.play).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resumes the same track only after both mute and the cutscene are cleared', async () => {
    const { audioManager } = await import('../src/audio/synth.ts');
    audioManager.setCutscenePlaying(true);
    audioManager.unlock();
    audioManager.setMusicTrack('floor3');
    expect(tracks).toHaveLength(0);

    audioManager.setCutscenePlaying(false);
    const track = tracks[0]!;
    await vi.advanceTimersByTimeAsync(450);
    expect(audioManager.toggleMute()).toBe(true);
    expect(track.paused).toBe(true);
    expect(track.muted).toBe(true);
    audioManager.setCutscenePlaying(true);
    audioManager.setCutscenePlaying(false);
    audioManager.unlock();
    expect(track.play).toHaveBeenCalledOnce();

    expect(audioManager.toggleMute()).toBe(false);
    expect(track.muted).toBe(false);
    expect(track.play).toHaveBeenCalledTimes(2);
    expect(tracks).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(450);
    expect(track.volume).toBeCloseTo(0.8);

    audioManager.setCutscenePlaying(true);
    expect(track.paused).toBe(true);
    audioManager.setCutscenePlaying(false);
    expect(track.play).toHaveBeenCalledTimes(3);
  });

  it('keeps the current floor track for ambient mode and the boss track through a phase change', async () => {
    const { audioManager } = await import('../src/audio/synth.ts');
    audioManager.unlock();
    audioManager.setMusicTrack('floor3');
    audioManager.setMusicMode('ambient');
    expect(tracks).toHaveLength(1);

    audioManager.setMusicMode('boss');
    audioManager.setMusicMode('boss');
    expect(tracks[1]!.src).toBe('./assets/music/bgm_boss.mp3');
    expect(tracks[1]!.play).toHaveBeenCalledOnce();
    audioManager.setMusicMode('ambient');
    expect(tracks[2]!.src).toBe('./assets/music/bgm_floor1.mp3');
    await vi.advanceTimersByTimeAsync(450);
  });

  it('uses the synth when Audio is unavailable or MP3 playback fails', async () => {
    const { audioManager } = await import('../src/audio/synth.ts');
    enableWebAudio();
    vi.stubGlobal('Audio', undefined);
    audioManager.setMusicTrack('floor1');
    audioManager.unlock();
    expect(timers.setInterval).toHaveBeenLastCalledWith(expect.any(Function), 300);
    const synthTimer = timers.setInterval.mock.results.at(-1)?.value;

    vi.stubGlobal('Audio', MockAudio);
    audioManager.setMusicTrack('floor2');
    expect(timers.clearInterval).toHaveBeenCalledWith(synthTimer);
    await vi.advanceTimersByTimeAsync(450);
    expect(vi.getTimerCount()).toBe(0);

    tracks[0]!.onerror?.();
    expect(tracks[0]!.paused).toBe(true);
    expect(timers.setInterval).toHaveBeenLastCalledWith(expect.any(Function), 300);

    playResult.mockRejectedValueOnce(new Error('MP3 playback failed'));
    audioManager.setMusicTrack('floor3');
    await vi.advanceTimersByTimeAsync(0);
    expect(tracks[1]!.paused).toBe(true);
    expect(timers.setInterval).toHaveBeenLastCalledWith(expect.any(Function), 300);
    expect(vi.getTimerCount()).toBe(1);

    audioManager.setMusicTrack(null);
    audioManager.unlock();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries playback on the next unlock after an autoplay rejection', async () => {
    const { audioManager } = await import('../src/audio/synth.ts');
    enableWebAudio();
    playResult.mockRejectedValueOnce(new DOMException('Autoplay blocked', 'NotAllowedError'));
    audioManager.unlock();
    audioManager.setMusicTrack('floor1');
    await vi.advanceTimersByTimeAsync(0);
    expect(timers.setInterval).toHaveBeenLastCalledWith(expect.any(Function), 300);

    audioManager.unlock();
    expect(tracks).toHaveLength(2);
    expect(tracks[1]!.play).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(450);
    expect(tracks[1]!.volume).toBeCloseTo(0.8);
    expect(vi.getTimerCount()).toBe(0);
  });
});
