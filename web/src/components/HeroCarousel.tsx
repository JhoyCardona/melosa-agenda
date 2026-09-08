import { useCallback, useEffect, useRef, useState } from 'react';
import './HeroCarousel.css';

export interface HeroSlide {
  src: string;
  alt: string;
}

const AUTOPLAY_MS = 3000;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// Dependency-free carousel: a CSS scroll-snap track drives layout and swipe,
// React state drives the autoplay. No arrows or dots on purpose — the client
// wants nothing overlaying the photos. Autoplay is off when the user prefers
// reduced motion, when the tab is hidden, or on hover/focus.
export default function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const goTo = useCallback(
    (target: number) => {
      const count = slides.length;
      if (count === 0) return;
      const next = ((target % count) + count) % count;
      setIndex(next);
      const track = trackRef.current;
      if (track) {
        track.scrollTo({
          left: next * track.clientWidth,
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        });
      }
    },
    [slides.length]
  );

  useEffect(() => {
    if (prefersReducedMotion() || paused || slides.length <= 1) return;
    const id = window.setInterval(() => {
      if (!document.hidden) goTo(index + 1);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [index, paused, goTo, slides.length]);

  // Keep the active dot in sync when the user swipes the track directly.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let timer: number;
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setIndex(Math.round(track.scrollLeft / track.clientWidth));
      }, 120);
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      track.removeEventListener('scroll', onScroll);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div
      className="hero-carousel"
      aria-roledescription="carrusel"
      aria-label="Fotos de tortas de Melosa"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <ul className="hero-carousel-track" ref={trackRef}>
        {slides.map((slide, i) => (
          <li className="hero-carousel-slide" key={slide.src} aria-hidden={i !== index}>
            <img
              src={slide.src}
              alt={slide.alt}
              loading={i === 0 ? 'eager' : 'lazy'}
              draggable={false}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
