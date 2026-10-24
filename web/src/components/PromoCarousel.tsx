import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './PromoCarousel.css';

export interface PromoSlide {
  src: string;
  alt: string;
  // Booking page for this promo; both the image and the button go there.
  href: string;
  width: number;
  height: number;
}

const AUTOPLAY_MS = 5000;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Current promotions, one poster per slide, on a CSS scroll-snap track (swipe
// works natively). Dots and autoplay only appear once there's more than one
// promo.
export default function PromoCarousel({ slides }: { slides: PromoSlide[] }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const multiple = slides.length > 1;

  function goTo(target: number) {
    const track = trackRef.current;
    if (!track || slides.length === 0) return;
    const next = ((target % slides.length) + slides.length) % slides.length;
    track.scrollTo({ left: next * track.clientWidth, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  // Swipes and goTo() both end up here, so the dots and button stay in sync.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let timer: number;
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIndex(Math.round(track.scrollLeft / track.clientWidth)), 120);
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      track.removeEventListener('scroll', onScroll);
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!multiple || paused || prefersReducedMotion()) return;
    const id = window.setTimeout(() => {
      if (!document.hidden) goTo(index + 1);
    }, AUTOPLAY_MS);
    return () => window.clearTimeout(id);
    // goTo only reads refs and props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, paused, multiple]);

  const current = slides[index] ?? slides[0];
  if (!current) return null;

  return (
    <div
      className="promo-carousel"
      aria-roledescription="carrusel"
      aria-label="Promociones disponibles"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <ul className="promo-carousel-track" ref={trackRef}>
        {slides.map((slide, i) => (
          <li key={slide.src} className="promo-carousel-slide" aria-hidden={i !== index}>
            <Link to={slide.href} tabIndex={i === index ? 0 : -1}>
              <img
                src={slide.src}
                alt={slide.alt}
                width={slide.width}
                height={slide.height}
                loading={i === 0 ? 'eager' : 'lazy'}
                draggable={false}
              />
            </Link>
          </li>
        ))}
      </ul>

      {multiple && (
        <div className="promo-carousel-dots">
          {slides.map((slide, i) => (
            <button
              key={slide.src}
              type="button"
              className={i === index ? 'is-active' : undefined}
              aria-label={`Promoción ${i + 1} de ${slides.length}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}

      <Link to={current.href} className="promo-carousel-cta">
        Agendar
      </Link>
    </div>
  );
}
