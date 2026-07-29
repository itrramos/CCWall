import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from 'react';
import type { Slide } from '../api';

/** Renders **bold**, *italic* and line breaks without any raw HTML injection. */
export function richText(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  text.split('\n').forEach((line, li) => {
    if (li > 0) out.push(<br key={`br-${li}`} />);
    const tokens = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    tokens.forEach((tok, ti) => {
      if (tok.startsWith('**') && tok.endsWith('**') && tok.length > 4) {
        out.push(<strong key={`${li}-${ti}`}>{tok.slice(2, -2)}</strong>);
      } else if (tok.startsWith('*') && tok.endsWith('*') && tok.length > 2) {
        out.push(<em key={`${li}-${ti}`}>{tok.slice(1, -1)}</em>);
      } else if (tok) {
        out.push(tok);
      }
    });
  });
  return out;
}

export interface AnnouncementItem {
  title: string;
  body: string;
  align?: string;
  titleSize?: string;
  titleColor?: string;
  bodySize?: string;
  bodyColor?: string;
  cardBackground?: string;
  mediaType?: 'none' | 'image' | 'video' | 'url';
  mediaId?: string | null;
  mediaUrl?: string;
  externalUrl?: string;
  mediaAlt?: string;
  mediaFit?: 'contain' | 'cover';
  mediaPosition?: 'top' | 'bottom' | 'left' | 'right' | 'background';
  mediaSize?: 'sm' | 'md' | 'lg' | 'full';
}

const MEDIA_SIZES: Record<string, string> = {
  sm: '30%',
  md: '45%',
  lg: '65%',
  full: '100%'
};

/**
 * Scales its children down (never up) so they always fit the available box.
 * Keeps long announcement text readable without overflowing or clipping.
 */
export function FitBox({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const measure = (): void => {
      const o = outer.current;
      const i = inner.current;
      if (!o || !i) return;
      const availW = o.clientWidth;
      const availH = o.clientHeight;
      // scrollWidth/Height are layout values — unaffected by our transform,
      // so measuring here cannot feed back into itself.
      const needW = i.scrollWidth;
      const needH = i.scrollHeight;
      if (!availW || !availH || !needW || !needH) return;
      const next = Math.min(1, availW / needW, availH / needH);
      setScale(Number.isFinite(next) && next > 0.05 ? next : 1);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    if (outer.current) ro.observe(outer.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div
      ref={outer}
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        ...style
      }}
    >
      <div ref={inner} style={{ maxWidth: '100%', transform: `scale(${scale})`, transformOrigin: 'center' }}>
        {children}
      </div>
    </div>
  );
}

/** Renders the optional media block inside an announcement card. */
function AnnouncementMedia({ item, active }: { item: AnnouncementItem; active: boolean }) {
  const type = item.mediaType ?? 'none';
  const fit = item.mediaFit ?? 'contain';
  const src = item.mediaUrl || item.externalUrl || '';
  if (type === 'none' || !src) return null;

  if (type === 'image') {
    return (
      <img
        src={src}
        alt={item.mediaAlt ?? ''}
        style={{ width: '100%', height: '100%', objectFit: fit, display: 'block' }}
      />
    );
  }

  if (type === 'video') {
    const yt = youtubeEmbedUrl(src, { autoplay: active, muted: true, loop: true });
    if (yt) {
      return (
        <iframe
          src={yt}
          title={item.title || 'Video'}
          allow="autoplay; encrypted-media; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
        />
      );
    }
    return (
      <video
        src={src}
        autoPlay={active}
        muted
        loop
        playsInline
        style={{ width: '100%', height: '100%', objectFit: fit, display: 'block' }}
      />
    );
  }

  // type === 'url' — embedded web page (YouTube links still get the player).
  const embed = youtubeEmbedUrl(src, { autoplay: active, muted: true, loop: true }) ?? src;
  return (
    <iframe
      src={embed}
      title={item.title || 'Embedded page'}
      allow="autoplay; encrypted-media; fullscreen"
      referrerPolicy="strict-origin-when-cross-origin"
      style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
    />
  );
}

const ANNOUNCEMENT_FONTS: Record<string, string> = {
  default: 'inherit',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "Cascadia Mono", Consolas, monospace'
};

const ANNOUNCEMENT_TITLE_SIZES: Record<string, string> = {
  sm: 'clamp(14px, 1.6vw, 24px)',
  md: 'clamp(16px, 2vw, 30px)',
  lg: 'clamp(19px, 2.6vw, 38px)',
  xl: 'clamp(24px, 3.6vw, 52px)'
};

const ANNOUNCEMENT_BODY_SIZES: Record<string, string> = {
  sm: 'clamp(12px, 1.3vw, 20px)',
  md: 'clamp(14px, 1.7vw, 25px)',
  lg: 'clamp(17px, 2.2vw, 32px)',
  xl: 'clamp(21px, 2.9vw, 42px)'
};

const FONT_SIZES: Record<string, string> = {
  sm: 'clamp(14px, 2vw, 22px)',
  md: 'clamp(18px, 2.8vw, 32px)',
  lg: 'clamp(24px, 3.8vw, 46px)',
  xl: 'clamp(32px, 5.2vw, 64px)',
  xxl: 'clamp(44px, 7vw, 92px)'
};

function cfg<T>(slide: Slide, key: string, fallback: T): T extends string ? string : T {
  const v = slide.config[key];
  return (v === undefined || v === null ? fallback : v) as T extends string ? string : T;
}

function ClockSlide({ slide }: { slide: Slide }) {
  const [nowTs, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const timeZone = cfg(slide, 'timeZone', '') || undefined;
  const hour12 = cfg(slide, 'hour12', false);
  const showSeconds = cfg(slide, 'showSeconds', true);
  const dateFormat = cfg(slide, 'dateFormat', 'full');
  let time = '—';
  let date = '';
  try {
    time = nowTs.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      ...(showSeconds ? { second: '2-digit' as const } : {}),
      hour12,
      timeZone
    });
    if (dateFormat !== 'none') {
      date = nowTs.toLocaleDateString(undefined, {
        dateStyle: dateFormat as 'full' | 'long' | 'medium' | 'short',
        timeZone
      });
    }
  } catch {
    time = nowTs.toLocaleTimeString();
  }
  const size = cfg(slide, 'fontSize', 'xl');
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: FONT_SIZES[size] ?? FONT_SIZES.xl, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {time}
      </div>
      {date && <div style={{ fontSize: 'clamp(16px, 2.4vw, 34px)', opacity: 0.8, marginTop: '0.4em' }}>{date}</div>}
    </div>
  );
}

/**
 * Converts any common YouTube URL (watch, youtu.be, Shorts, /live/<id>,
 * /embed/<id>, channel live pages) into an embeddable player URL, or returns
 * null when the URL is not a YouTube link. Regular pages like
 * youtube.com/watch refuse to load in iframes (X-Frame-Options) — only the
 * /embed/ player works, so wallboards need this rewrite.
 */
export function youtubeEmbedUrl(
  raw: string,
  opts: { autoplay: boolean; muted: boolean; loop: boolean }
): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.replace(/^(www|m)\./, '');
  let id: string | null = null;
  let channel: string | null = null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (host === 'youtu.be') {
    id = parts[0] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else if (parts[0] === 'embed' && parts[1] === 'live_stream') channel = u.searchParams.get('channel');
    else if ((parts[0] === 'live' || parts[0] === 'shorts' || parts[0] === 'embed') && parts[1]) id = parts[1];
    else if (parts[0] === 'channel' && parts[1] && parts[2] === 'live') channel = parts[1];
  } else {
    return null;
  }
  if (!/^[\w-]{6,64}$/.test(id ?? channel ?? '')) return null;
  const params = new URLSearchParams({ playsinline: '1', rel: '0' });
  if (opts.autoplay) params.set('autoplay', '1');
  if (opts.muted) params.set('mute', '1');
  if (opts.loop && id) {
    params.set('loop', '1');
    params.set('playlist', id);
  }
  const base = 'https://www.youtube-nocookie.com/embed/';
  return channel
    ? `${base}live_stream?channel=${encodeURIComponent(channel)}&${params}`
    : `${base}${encodeURIComponent(id!)}?${params}`;
}

/** Hostname of a URL, or null when the string is not a loadable http(s) URL. */
function safeHostname(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.hostname || null;
  } catch {
    return null;
  }
}

function UrlSlide({ slide, active }: { slide: Slide; active: boolean }) {
  const rawUrl = cfg(slide, 'url', '');
  // YouTube links can't be framed directly — swap in the embeddable player.
  const url = youtubeEmbedUrl(rawUrl, { autoplay: active, muted: true, loop: true }) ?? rawUrl;
  const refreshSeconds = cfg(slide, 'refreshSeconds', 0);
  const timeoutSeconds = cfg(slide, 'timeoutSeconds', 20);
  const fit = cfg(slide, 'fit', 'fit');
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    if (!active || !refreshSeconds) return;
    const t = setInterval(() => setNonce((n) => n + 1), refreshSeconds * 1000);
    return () => clearInterval(t);
  }, [active, refreshSeconds]);

  useEffect(() => {
    setState('loading');
    const t = setTimeout(() => {
      setState((s) => (s === 'loading' ? 'error' : s));
    }, timeoutSeconds * 1000);
    return () => clearTimeout(t);
  }, [nonce, timeoutSeconds, url]);

  const scale = fit === 'scale-75' ? 0.75 : fit === 'scale-50' ? 0.5 : 1;
  const frameStyle: CSSProperties =
    scale === 1
      ? { width: '100%', height: '100%', border: 0 }
      : {
          width: `${100 / scale}%`,
          height: `${100 / scale}%`,
          border: 0,
          transform: `scale(${scale})`,
          transformOrigin: 'top left'
        };

  const hostname = safeHostname(url);
  if (!hostname) {
    return (
      <div style={overlayStyle}>
        <div style={{ fontSize: 'clamp(16px, 2.2vw, 30px)', fontWeight: 600, opacity: 0.75 }}>
          Enter a full URL (e.g. https://example.com/report)
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/* No sandbox: these are admin-configured URLs, and sign-in flows
          (e.g. Tableau, Grafana, Power BI) need popups, redirects and
          storage access that sandboxing blocks. */}
      <iframe
        key={nonce}
        src={url}
        title={slide.title}
        style={frameStyle}
        allow="autoplay; encrypted-media; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setState('ok')}
      />
      {state === 'loading' && (
        <div style={overlayStyle}>
          <div className="spinner" />
          <div style={{ opacity: 0.7 }}>Loading {hostname}…</div>
        </div>
      )}
      {state === 'error' && (
        <div style={overlayStyle}>
          <div style={{ fontSize: 'clamp(18px, 2.6vw, 34px)', fontWeight: 600 }}>
            {cfg(slide, 'errorMessage', '') || 'This page could not be displayed'}
          </div>
          <div style={{ opacity: 0.7, maxWidth: '70%', textAlign: 'center' }}>
            {cfg(slide, 'fallbackText', '') ||
              'The site may block embedding (X-Frame-Options / CSP) or be unreachable.'}
          </div>
        </div>
      )}
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  background: 'rgba(5, 8, 16, 0.85)',
  color: '#e7eaf3'
};

/**
 * Full-bleed renderer for one slide. `active` indicates the slide is currently
 * shown (drives refresh timers and autoplay).
 */
export function SlideView({ slide, active = true }: { slide: Slide; active?: boolean }) {
  const background = slide.background || 'transparent';
  const color = slide.textColor || 'inherit';

  const body = useMemo(() => {
    switch (slide.type) {
      case 'text': {
        const align = cfg(slide, 'align', 'center');
        const size = cfg(slide, 'fontSize', 'lg');
        const weight = cfg(slide, 'fontWeight', 'normal');
        const heading = cfg(slide, 'heading', '');
        const bodyText = cfg(slide, 'body', '');
        const callout = cfg(slide, 'callout', '');
        const footer = cfg(slide, 'footer', '');
        return (
          <div style={{ textAlign: align as CSSProperties['textAlign'], maxWidth: '86%', width: '100%' }}>
            {heading && (
              <div style={{ fontSize: FONT_SIZES[size] ?? FONT_SIZES.lg, fontWeight: 700, marginBottom: '0.35em' }}>
                {richText(heading)}
              </div>
            )}
            {bodyText && (
              <div
                style={{
                  fontSize: `calc(${FONT_SIZES[size] ?? FONT_SIZES.lg} * 0.55)`,
                  fontWeight: weight === 'bold' ? 700 : weight === 'medium' ? 500 : 400,
                  lineHeight: 1.5
                }}
              >
                {richText(bodyText)}
              </div>
            )}
            {callout && (
              <div
                style={{
                  display: 'inline-block',
                  marginTop: '1em',
                  padding: '0.5em 1.2em',
                  borderRadius: 12,
                  background: 'rgba(99, 102, 241, 0.25)',
                  fontSize: 'clamp(15px, 2vw, 26px)',
                  fontWeight: 600
                }}
              >
                {richText(callout)}
              </div>
            )}
            {footer && (
              <div style={{ position: 'absolute', bottom: '3%', left: 0, right: 0, opacity: 0.65, fontSize: 'clamp(12px, 1.4vw, 20px)' }}>
                {richText(footer)}
              </div>
            )}
          </div>
        );
      }
      case 'image': {
        const url = cfg(slide, 'mediaUrl', '');
        const fit = cfg(slide, 'fit', 'contain');
        const position = cfg(slide, 'position', 'center');
        const caption = cfg(slide, 'caption', '');
        if (!url) return <div style={{ opacity: 0.6 }}>No image selected</div>;
        return (
          <>
            <img
              src={url}
              alt={cfg(slide, 'alt', '')}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: fit === 'original' ? 'none' : (fit as CSSProperties['objectFit']),
                objectPosition: position
              }}
            />
            {caption && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  padding: '0.8em 1.2em',
                  background: 'linear-gradient(transparent, rgba(0,0,0,0.75))',
                  color: '#fff',
                  fontSize: 'clamp(14px, 1.8vw, 26px)',
                  textAlign: 'center'
                }}
              >
                {caption}
              </div>
            )}
          </>
        );
      }
      case 'url':
        return <UrlSlide slide={slide} active={active} />;
      case 'video': {
        const src = cfg(slide, 'mediaUrl', '') || cfg(slide, 'externalUrl', '');
        if (!src) return <div style={{ opacity: 0.6 }}>No video selected</div>;
        const yt = youtubeEmbedUrl(src, {
          autoplay: active && cfg(slide, 'autoplay', true),
          muted: cfg(slide, 'muted', true),
          loop: cfg(slide, 'loop', true)
        });
        if (yt) {
          return (
            <iframe
              key={`${yt}-${active}`}
              src={yt}
              title={slide.title}
              allow="autoplay; encrypted-media; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
            />
          );
        }
        return (
          <video
            key={`${src}-${active}`}
            src={src}
            poster={cfg(slide, 'posterUrl', '') || undefined}
            autoPlay={active && cfg(slide, 'autoplay', true)}
            muted={cfg(slide, 'muted', true)}
            loop={cfg(slide, 'loop', true)}
            playsInline
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: cfg(slide, 'fit', 'contain') as CSSProperties['objectFit']
            }}
          />
        );
      }
      case 'html': {
        // Sandboxed iframe without allow-scripts: markup and CSS render,
        // scripts never execute.
        return (
          <iframe
            title={slide.title}
            sandbox=""
            srcDoc={`<style>body{margin:0;font-family:system-ui,sans-serif;color:${slide.textColor || '#e7eaf3'};background:transparent}</style>${cfg(slide, 'html', '')}`}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          />
        );
      }
      case 'clock':
        return <ClockSlide slide={slide} />;
      case 'announcement': {
        const items = cfg(slide, 'items', [] as AnnouncementItem[]);
        const columns = cfg(slide, 'columns', 'auto');
        const family = ANNOUNCEMENT_FONTS[cfg(slide, 'fontFamily', 'default')] ?? 'inherit';
        // Slide-level defaults; each item can override any of them.
        const defaults = {
          align: cfg(slide, 'align', 'center'),
          titleSize: cfg(slide, 'titleSize', 'lg'),
          titleColor: cfg(slide, 'titleColor', ''),
          bodySize: cfg(slide, 'bodySize', 'md'),
          bodyColor: cfg(slide, 'bodyColor', ''),
          cardBackground: cfg(slide, 'cardBackground', '')
        };
        return (
          <div
            style={{
              width: '92%',
              height: '92%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              fontFamily: family
            }}
          >
            <div
              style={{
                fontSize: 'clamp(22px, 3.4vw, 44px)',
                fontWeight: 700,
                textAlign: 'center',
                marginBottom: '0.7em',
                flex: '0 0 auto'
              }}
            >
              {slide.title}
            </div>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'grid',
                gridTemplateColumns:
                  columns === 'auto'
                    ? items.length > 1
                      ? 'repeat(auto-fit, minmax(280px, 1fr))'
                      : '1fr'
                    : `repeat(${columns}, 1fr)`,
                gridAutoRows: '1fr',
                gap: 'clamp(10px, 1.6vw, 24px)'
              }}
            >
              {items.map((it, i) => {
                const hasMedia = (it.mediaType ?? 'none') !== 'none' && Boolean(it.mediaUrl || it.externalUrl);
                const hasText = Boolean(it.title || it.body);
                const position = it.mediaPosition ?? 'top';
                const isRow = position === 'left' || position === 'right';
                const isBackdrop = position === 'background';
                // "Full" (and any card without text) means the media takes whatever
                // space the text leaves, so a card can never overflow itself.
                const mediaFillsRest = hasMedia && !isBackdrop && (!hasText || (it.mediaSize ?? 'md') === 'full');
                const mediaExtent = MEDIA_SIZES[it.mediaSize ?? 'md'] ?? '45%';
                const mediaBoxStyle: CSSProperties = mediaFillsRest
                  ? { flex: '1 1 0', minWidth: 0, minHeight: 0, overflow: 'hidden' }
                  : {
                      flex: '0 0 auto',
                      overflow: 'hidden',
                      minWidth: 0,
                      minHeight: 0,
                      ...(isRow ? { width: mediaExtent, height: '100%' } : { height: mediaExtent, width: '100%' })
                    };
                const media = hasMedia ? <AnnouncementMedia item={it} active={active} /> : null;

                const text = hasText ? (
                  <FitBox
                    style={{
                      // Shrink to the text's natural size when the media claims
                      // the remainder; otherwise fill the leftover space.
                      flex: mediaFillsRest ? '0 1 auto' : 1,
                      padding: 'clamp(10px, 1.6vw, 24px)',
                      zIndex: 1
                    }}
                  >
                    <div style={{ textAlign: (it.align || defaults.align) as CSSProperties['textAlign'] }}>
                      {it.title && (
                        <div
                          style={{
                            fontSize:
                              ANNOUNCEMENT_TITLE_SIZES[it.titleSize || defaults.titleSize] ??
                              ANNOUNCEMENT_TITLE_SIZES.lg,
                            fontWeight: 700,
                            color: it.titleColor || defaults.titleColor || undefined
                          }}
                        >
                          {richText(it.title)}
                        </div>
                      )}
                      {it.body && (
                        <div
                          style={{
                            fontSize:
                              ANNOUNCEMENT_BODY_SIZES[it.bodySize || defaults.bodySize] ??
                              ANNOUNCEMENT_BODY_SIZES.md,
                            color: it.bodyColor || defaults.bodyColor || undefined,
                            opacity: it.bodyColor || defaults.bodyColor ? 1 : 0.85,
                            marginTop: it.title ? '0.4em' : 0
                          }}
                        >
                          {richText(it.body)}
                        </div>
                      )}
                    </div>
                  </FitBox>
                ) : null;

                return (
                  <div
                    key={i}
                    style={{
                      position: 'relative',
                      background: it.cardBackground || defaults.cardBackground || 'rgba(255,255,255,0.07)',
                      border: '1px solid rgba(255,255,255,0.14)',
                      borderRadius: 16,
                      overflow: 'hidden',
                      minHeight: 0,
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: isRow ? 'row' : 'column'
                    }}
                  >
                    {media && isBackdrop && (
                      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>{media}</div>
                    )}
                    {media && !isBackdrop && (position === 'top' || position === 'left') && (
                      <div style={mediaBoxStyle}>
                        {media}
                      </div>
                    )}
                    {text}
                    {media && !isBackdrop && (position === 'bottom' || position === 'right') && (
                      <div style={mediaBoxStyle}>{media}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      }
      case 'metrics': {
        const items = cfg(slide, 'items', [] as { label: string; value: string; delta: string; tone: string }[]);
        const heading = cfg(slide, 'heading', '');
        const toneColor: Record<string, string> = {
          success: '#34d399',
          warning: '#fbbf24',
          danger: '#f87171',
          default: '#8b9dff'
        };
        return (
          <div style={{ width: '92%' }}>
            {heading && (
              <div style={{ fontSize: 'clamp(20px, 3vw, 40px)', fontWeight: 700, textAlign: 'center', marginBottom: '0.8em' }}>
                {richText(heading)}
              </div>
            )}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 'clamp(10px, 1.6vw, 24px)'
              }}
            >
              {items.map((it, i) => (
                <div
                  key={i}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 16,
                    padding: 'clamp(14px, 2vw, 30px)',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ fontSize: 'clamp(11px, 1.2vw, 17px)', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7 }}>
                    {it.label}
                  </div>
                  <div style={{ fontSize: 'clamp(28px, 4.4vw, 68px)', fontWeight: 800, margin: '0.15em 0' }}>{it.value}</div>
                  {it.delta && (
                    <div style={{ fontSize: 'clamp(13px, 1.5vw, 22px)', fontWeight: 600, color: toneColor[it.tone] ?? toneColor.default }}>
                      {it.delta}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      }
      case 'blank':
        return null;
      default:
        return <div style={{ opacity: 0.6 }}>Unsupported slide type: {slide.type}</div>;
    }
  }, [slide, active]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background,
        color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}
    >
      {body}
    </div>
  );
}
