import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import type { Slide, Wallboard } from '../api';
import { SlideView } from './SlideView';
import './player.css';

interface DisplayData {
  wallboard: Wallboard;
  onAir: boolean;
  version: string;
  settings: {
    loopSlides: boolean;
    autoStart: boolean;
    showControls: boolean;
    hideCursorSeconds: number;
    refreshIntervalSeconds: number;
    preloadNext: boolean;
    errorFallbackSeconds: number;
    keepScreenAwake: boolean;
  };
  slides: Slide[];
}

/** Catches per-slide render errors so one bad slide can't kill the player. */
class SlideBoundary extends Component<
  { children: ReactNode; onError: () => void; resetKey: string },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="player-standby">
          <div className="player-standby-title">Slide error</div>
          <div className="player-standby-sub">Skipping to the next slide…</div>
        </div>
      );
    }
    return this.props.children;
  }
}

function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    let disposed = false;
    const acquire = async (): Promise<void> => {
      try {
        lock = await (navigator as Navigator & {
          wakeLock: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> };
        }).wakeLock.request('screen');
      } catch {
        /* not supported / denied — non-fatal */
      }
    };
    const onVisible = (): void => {
      if (document.visibilityState === 'visible' && !disposed) void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [enabled]);
}

export default function DisplayPage() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const isPreview = params.get('preview') === '1';
  const token = params.get('token');
  const [pin, setPin] = useState<string | null>(params.get('pin'));
  const [pinInput, setPinInput] = useState('');
  const [needPin, setNeedPin] = useState(false);

  const [data, setData] = useState<DisplayData | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const versionRef = useRef('');
  const indexRef = useRef(0);
  indexRef.current = index;

  const apiUrl = useMemo(() => {
    const p = new URLSearchParams();
    if (token) p.set('token', token);
    if (pin) p.set('pin', pin);
    const qs = p.toString();
    return `/api/display/${slug}${qs ? `?${qs}` : ''}`;
  }, [slug, token, pin]);

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(apiUrl, { credentials: 'same-origin' });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const code = payload?.error?.code as string | undefined;
        if (code === 'pin_required') {
          setNeedPin(true);
          setData(null);
          return;
        }
        if (code === 'token_required') {
          setFatal('This wallboard requires a valid access token in its URL.');
          return;
        }
        if (res.status === 404) {
          setFatal('This wallboard does not exist or is disabled.');
          return;
        }
        throw new Error(payload?.error?.message ?? `HTTP ${res.status}`);
      }
      const next = payload.data as DisplayData;
      setNeedPin(false);
      setFatal(null);
      setDisconnected(false);
      if (next.version !== versionRef.current) {
        versionRef.current = next.version;
        setData((prev) => {
          // Keep position on the same slide where possible.
          if (prev) {
            const currentId = prev.slides[indexRef.current]?.id;
            const newIndex = next.slides.findIndex((s) => s.id === currentId);
            setIndex(newIndex >= 0 ? newIndex : 0);
          }
          return next;
        });
      }
    } catch {
      setDisconnected(true);
    }
  }, [apiUrl]);

  useEffect(() => {
    versionRef.current = '';
    void load();
  }, [load]);

  // Poll for playlist updates.
  useEffect(() => {
    if (!data) return;
    const interval = Math.max(10, data.settings.refreshIntervalSeconds) * 1000;
    const t = setInterval(() => void load(), interval);
    return () => clearInterval(t);
  }, [data, load]);

  // Periodic full reload when configured.
  useEffect(() => {
    if (!data || isPreview || data.wallboard.refreshMinutes <= 0) return;
    const t = setTimeout(() => window.location.reload(), data.wallboard.refreshMinutes * 60 * 1000);
    return () => clearTimeout(t);
  }, [data, isPreview]);

  useWakeLock(Boolean(data?.settings.keepScreenAwake) && !isPreview);

  const slides = data?.slides ?? [];
  const slide = slides[index] ?? null;

  const advance = useCallback(
    (dir: 1 | -1): void => {
      if (slides.length === 0) return;
      setIndex((i) => {
        const loop = data?.wallboard.loopSlides ?? true;
        let next = i + dir;
        if (next >= slides.length) next = loop ? 0 : slides.length - 1;
        if (next < 0) next = loop ? slides.length - 1 : 0;
        return next;
      });
    },
    [slides.length, data?.wallboard.loopSlides]
  );

  // Slide timer.
  useEffect(() => {
    if (!data || !slide || paused || slides.length <= 1) return;
    if (!data.settings.autoStart && !data.wallboard.autostart) return;
    const seconds = slide.durationOverride ?? slide.duration ?? data.wallboard.defaultDuration;
    const t = setTimeout(() => advance(1), Math.max(1, seconds) * 1000);
    return () => clearTimeout(t);
  }, [data, slide, index, paused, slides.length, advance]);

  // Keyboard controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === 'ArrowRight') advance(1);
      else if (e.key === 'ArrowLeft') advance(-1);
      else if (e.key.toLowerCase() === 'f') {
        void toggleFullscreen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance]);

  // Cursor / controls auto-hide.
  useEffect(() => {
    if (!data) return;
    const hideAfter = (data.settings.hideCursorSeconds || 0) * 1000;
    if (hideAfter <= 0) return;
    let timer: ReturnType<typeof setTimeout>;
    const show = (): void => {
      setControlsVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setControlsVisible(false), hideAfter);
    };
    show();
    window.addEventListener('mousemove', show);
    window.addEventListener('touchstart', show);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', show);
      window.removeEventListener('touchstart', show);
    };
  }, [data]);

  // Transition layering.
  const transition = slide?.transitionOverride ?? data?.wallboard.transition ?? 'fade';
  const transitionMs = data?.wallboard.transitionDuration ?? 500;
  const [layers, setLayers] = useState<{ slide: Slide; key: string }[]>([]);
  useEffect(() => {
    if (!slide) {
      setLayers([]);
      return;
    }
    setLayers((prev) => {
      const key = `${slide.id}-${Date.now()}`;
      const next = [...prev.filter((l) => l.slide.id !== slide.id), { slide, key }];
      return next.slice(-2);
    });
    const t = setTimeout(
      () => setLayers((prev) => prev.slice(-1)),
      transitionMs + 60
    );
    return () => clearTimeout(t);
  }, [slide, transitionMs]);

  const skipOnError = useCallback((): void => {
    const wait = (data?.settings.errorFallbackSeconds ?? 10) * 1000;
    setTimeout(() => advance(1), wait);
  }, [advance, data?.settings.errorFallbackSeconds]);

  if (fatal) {
    return (
      <div className="player-root">
        <div className="player-standby">
          <div className="player-standby-title">Unavailable</div>
          <div className="player-standby-sub">{fatal}</div>
        </div>
      </div>
    );
  }

  if (needPin) {
    return (
      <div className="player-root">
        <form
          className="player-pin"
          onSubmit={(e) => {
            e.preventDefault();
            setPin(pinInput);
          }}
        >
          <div className="player-standby-title">Enter PIN</div>
          <input
            className="player-pin-input"
            type="password"
            inputMode="numeric"
            autoFocus
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            aria-label="Wallboard PIN"
          />
          <button className="player-btn" type="submit">
            Unlock
          </button>
          {pin && <div className="player-standby-sub">Incorrect PIN — try again.</div>}
        </form>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="player-root">
        <div className="player-standby">
          <div className="spinner" />
          {disconnected && <div className="player-standby-sub">Reconnecting…</div>}
        </div>
      </div>
    );
  }

  const showControls = data.settings.showControls && !isPreview;
  const aspect = data.wallboard.aspectRatio;
  const stage = (
    <div className="player-stage" style={{ background: data.wallboard.background }}>
      {!data.onAir && (
        <div className="player-standby">
          <div className="player-standby-title">{data.wallboard.name}</div>
          <div className="player-standby-sub">Off air — scheduled content resumes later.</div>
        </div>
      )}
      {data.onAir && slides.length === 0 && (
        <div className="player-standby">
          <div className="player-standby-title">{data.wallboard.name}</div>
          <div className="player-standby-sub">No active slides in this wallboard.</div>
        </div>
      )}
      {data.onAir &&
        layers.map((layer, li) => {
          const incoming = li === layers.length - 1;
          return (
            <div
              key={layer.key}
              className={`player-layer${incoming && layers.length > 1 ? ` in-${transition}` : ''}`}
              style={{ animationDuration: `${transitionMs}ms`, zIndex: li + 1 }}
            >
              <SlideBoundary onError={skipOnError} resetKey={layer.slide.id}>
                <SlideView slide={layer.slide} active={incoming} />
              </SlideBoundary>
            </div>
          );
        })}
      {/* Preload the next slide off-screen to avoid flashes. */}
      {data.onAir && data.settings.preloadNext && slides.length > 1 && (
        <div className="player-preload" aria-hidden="true">
          <SlideView slide={slides[(index + 1) % slides.length]!} active={false} />
        </div>
      )}
    </div>
  );

  return (
    <div
      className={`player-root${controlsVisible ? '' : ' cursor-hidden'}`}
      onDoubleClick={() => !isPreview && void toggleFullscreen()}
    >
      {aspect !== 'auto' ? (
        <div className="player-letterbox">
          <div className="player-aspect" style={{ aspectRatio: aspect.replace(':', ' / ') }}>
            {stage}
          </div>
        </div>
      ) : (
        stage
      )}
      {disconnected && (
        <div className="player-status" role="status">
          ● Reconnecting…
        </div>
      )}
      {paused && (
        <div className="player-status player-status-paused" role="status">
          ⏸ Paused
        </div>
      )}
      {showControls && (
        <div className={`player-controls${controlsVisible ? '' : ' hidden'}`}>
          <button className="player-btn" onClick={() => advance(-1)} aria-label="Previous slide">
            ⏮
          </button>
          <button className="player-btn" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Resume' : 'Pause'}>
            {paused ? '▶' : '⏸'}
          </button>
          <button className="player-btn" onClick={() => advance(1)} aria-label="Next slide">
            ⏭
          </button>
          {data.wallboard.fullscreenBehavior !== 'hidden' && (
            <button className="player-btn" onClick={() => void toggleFullscreen()} aria-label="Toggle full screen">
              ⛶
            </button>
          )}
          <span className="player-counter">
            {slides.length > 0 ? `${index + 1} / ${slides.length}` : '—'}
          </span>
        </div>
      )}
    </div>
  );
}

async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    /* Fullscreen may be blocked in iframes — ignore. */
  }
}
