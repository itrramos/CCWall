import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SlideView, richText, youtubeEmbedUrl } from '../player/SlideView';
import type { Slide } from '../api';

function makeSlide(partial: Partial<Slide>): Slide {
  return {
    id: 's1',
    title: 'Test',
    description: '',
    type: 'text',
    enabled: true,
    duration: null,
    background: '#101010',
    textColor: '#ffffff',
    transitionOverride: null,
    startAt: null,
    endAt: null,
    daysOfWeek: null,
    tags: '',
    config: {},
    createdAt: '',
    updatedAt: '',
    ...partial
  };
}

describe('richText', () => {
  it('renders bold and italic without injecting HTML', () => {
    render(<div data-testid="rt">{richText('Hello **bold** and *soft* <script>alert(1)</script>')}</div>);
    const el = screen.getByTestId('rt');
    expect(el.querySelector('strong')?.textContent).toBe('bold');
    expect(el.querySelector('em')?.textContent).toBe('soft');
    // Angle brackets stay literal text — never parsed as markup.
    expect(el.querySelector('script')).toBeNull();
    expect(el.textContent).toContain('<script>alert(1)</script>');
  });
});

describe('youtubeEmbedUrl', () => {
  const opts = { autoplay: true, muted: true, loop: false };

  it('converts watch, short-link, Shorts and /live/ URLs to the embed player', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=z7LFHuBwbpc',
      'https://youtu.be/z7LFHuBwbpc',
      'https://www.youtube.com/shorts/z7LFHuBwbpc',
      'https://www.youtube.com/live/z7LFHuBwbpc',
      'https://www.youtube.com/embed/z7LFHuBwbpc?si=abc'
    ]) {
      const out = youtubeEmbedUrl(url, opts);
      expect(out).toContain('https://www.youtube-nocookie.com/embed/z7LFHuBwbpc');
      expect(out).toContain('autoplay=1');
      expect(out).toContain('mute=1');
    }
  });

  it('converts channel live URLs to the live_stream embed', () => {
    const out = youtubeEmbedUrl('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv/live', opts);
    expect(out).toContain('embed/live_stream?channel=UCabcdefghijklmnopqrstuv');
  });

  it('adds loop via playlist when requested', () => {
    const out = youtubeEmbedUrl('https://youtu.be/z7LFHuBwbpc', { ...opts, loop: true });
    expect(out).toContain('loop=1');
    expect(out).toContain('playlist=z7LFHuBwbpc');
  });

  it('returns null for non-YouTube and malformed URLs', () => {
    expect(youtubeEmbedUrl('https://example.com/watch?v=abc', opts)).toBeNull();
    expect(youtubeEmbedUrl('not a url', opts)).toBeNull();
    expect(youtubeEmbedUrl('https://www.youtube.com/', opts)).toBeNull();
  });
});

describe('SlideView', () => {
  it('renders a text slide with heading, body, callout and footer', () => {
    render(
      <SlideView
        slide={makeSlide({
          type: 'text',
          config: { heading: 'Big News', body: 'Details here', callout: 'Act now', footer: 'fine print' }
        })}
      />
    );
    expect(screen.getByText('Big News')).toBeInTheDocument();
    expect(screen.getByText('Details here')).toBeInTheDocument();
    expect(screen.getByText('Act now')).toBeInTheDocument();
    expect(screen.getByText('fine print')).toBeInTheDocument();
  });

  it('renders announcement items in a grid', () => {
    render(
      <SlideView
        slide={makeSlide({
          type: 'announcement',
          title: 'Team news',
          config: { items: [{ title: 'Reviews: 20', body: 'Nimmy with 4' }] }
        })}
      />
    );
    expect(screen.getByText('Team news')).toBeInTheDocument();
    expect(screen.getByText('Reviews: 20')).toBeInTheDocument();
    expect(screen.getByText('Nimmy with 4')).toBeInTheDocument();
  });

  it('renders a clock slide with a ticking time', () => {
    render(<SlideView slide={makeSlide({ type: 'clock', config: { showSeconds: false, hour12: false } })} />);
    // Time in HH:MM format is on screen.
    expect(screen.getByText(/\d{1,2}:\d{2}/)).toBeInTheDocument();
  });

  it('renders image slides with alt text and fit mode', () => {
    render(
      <SlideView
        slide={makeSlide({
          type: 'image',
          config: { mediaUrl: '/media/x.png', alt: 'Team photo', fit: 'cover' }
        })}
      />
    );
    const img = screen.getByAltText('Team photo');
    expect(img).toHaveStyle({ objectFit: 'cover' });
  });

  it('shows a helpful message when no image is selected', () => {
    render(<SlideView slide={makeSlide({ type: 'image', config: {} })} />);
    expect(screen.getByText('No image selected')).toBeInTheDocument();
  });

  it('shows a hint instead of crashing on incomplete URL slides (regression)', () => {
    // "https://" is the editor's initial value — new URL() would throw on it.
    for (const url of ['https://', '', 'not a url', 'javascript:alert(1)']) {
      const { unmount } = render(<SlideView slide={makeSlide({ type: 'url', config: { url } })} />);
      expect(screen.getByText(/Enter a full URL/)).toBeInTheDocument();
      unmount();
    }
  });

  it('applies announcement layout and style options with per-item overrides', () => {
    render(
      <SlideView
        slide={makeSlide({
          type: 'announcement',
          title: 'Styled news',
          config: {
            columns: '2',
            align: 'left',
            titleSize: 'xl',
            titleColor: '#ff0000',
            bodyColor: '#00ff00',
            cardBackground: '#123456',
            items: [
              { title: 'Inherits defaults', body: 'body one' },
              { title: 'Overridden', body: 'body two', align: 'right', titleColor: '#0000ff', cardBackground: '#654321' }
            ]
          }
        })}
      />
    );
    // The card is the nearest ancestor with the card's rounded corners.
    const cardOf = (el: HTMLElement): HTMLElement => {
      let node: HTMLElement | null = el;
      while (node && node.style.borderRadius !== '16px') node = node.parentElement;
      if (!node) throw new Error('card not found');
      return node;
    };
    const title1 = screen.getByText('Inherits defaults');
    const title2 = screen.getByText('Overridden');

    expect(cardOf(title1).parentElement).toHaveStyle({ gridTemplateColumns: 'repeat(2, 1fr)' });
    expect(cardOf(title1)).toHaveStyle({ background: '#123456' });
    expect(cardOf(title2)).toHaveStyle({ background: '#654321' });
    // Alignment sits on the text block, colors on the title/body elements.
    expect(title1.parentElement).toHaveStyle({ textAlign: 'left' });
    expect(title2.parentElement).toHaveStyle({ textAlign: 'right' });
    expect(title1).toHaveStyle({ color: '#ff0000' });
    expect(title2).toHaveStyle({ color: '#0000ff' });
    expect(screen.getByText('body one')).toHaveStyle({ color: '#00ff00' });
  });

  it('renders announcement cards containing images, videos, YouTube and web pages', () => {
    const { container } = render(
      <SlideView
        slide={makeSlide({
          type: 'announcement',
          title: 'Mixed media',
          config: {
            items: [
              { title: 'Photo', body: '', mediaType: 'image', mediaUrl: '/media/a.png', mediaAlt: 'Team', mediaFit: 'cover' },
              { title: 'Clip', body: 'watch this', mediaType: 'video', mediaUrl: '/media/b.mp4' },
              { title: 'Live', body: '', mediaType: 'video', externalUrl: 'https://youtu.be/z7LFHuBwbpc' },
              { title: 'Report', body: '', mediaType: 'url', externalUrl: 'https://example.com/report' }
            ]
          }
        })}
      />
    );
    // Image card: alt text and fit are applied.
    expect(screen.getByAltText('Team')).toHaveStyle({ objectFit: 'cover' });
    // Uploaded video renders a <video>, YouTube renders the embed player.
    const video = container.querySelector('video');
    expect(video?.getAttribute('src')).toBe('/media/b.mp4');
    const frames = Array.from(container.querySelectorAll('iframe')).map((f) => f.getAttribute('src') ?? '');
    expect(frames.some((s) => s.includes('youtube-nocookie.com/embed/z7LFHuBwbpc'))).toBe(true);
    expect(frames).toContain('https://example.com/report');
    // Text still renders alongside the media.
    expect(screen.getByText('watch this')).toBeInTheDocument();
  });

  it('ignores announcement media when no source is set', () => {
    const { container } = render(
      <SlideView
        slide={makeSlide({
          type: 'announcement',
          config: { items: [{ title: 'Text only', body: 'no media', mediaType: 'image', mediaUrl: '' }] }
        })}
      />
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Text only')).toBeInTheDocument();
  });

  it('renders YouTube video slides as an embedded player iframe', () => {
    const { container } = render(
      <SlideView
        slide={makeSlide({
          type: 'video',
          config: { externalUrl: 'https://www.youtube.com/watch?v=z7LFHuBwbpc', autoplay: true, muted: true }
        })}
      />
    );
    const frame = container.querySelector('iframe');
    expect(frame?.getAttribute('src')).toContain('youtube-nocookie.com/embed/z7LFHuBwbpc');
    expect(container.querySelector('video')).toBeNull();
  });

  it('renders metric tiles', () => {
    render(
      <SlideView
        slide={makeSlide({
          type: 'metrics',
          config: { heading: 'Today', items: [{ label: 'Orders', value: '128', delta: '+12%', tone: 'success' }] }
        })}
      />
    );
    expect(screen.getByText('Orders')).toBeInTheDocument();
    expect(screen.getByText('128')).toBeInTheDocument();
    expect(screen.getByText('+12%')).toBeInTheDocument();
  });
});
