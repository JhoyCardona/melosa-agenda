import { useEffect } from 'react';
import type { ProductDesignImage } from '../types';
import { catalogPhotoUrl } from '../bookingShared';

const INTERVAL_MS = 3000;

interface DesignCarouselProps {
  images: ProductDesignImage[];
  fallbackImageUrl: string | null;
  alt: string;
  // Controlled by the parent so its color buttons can show/pick the photo.
  index: number;
  onIndexChange: (index: number) => void;
  // true once the customer picked a color by hand: stop cycling.
  paused: boolean;
}

// Catalog card media: cycles through a design's color photos automatically
// until the customer picks one. Falls back to the design's cover photo (or
// "Sin foto") when it has no color images loaded yet.
export default function DesignCarousel({
  images,
  fallbackImageUrl,
  alt,
  index,
  onIndexChange,
  paused,
}: DesignCarouselProps) {
  useEffect(() => {
    if (paused || images.length < 2) return;
    const id = window.setTimeout(() => onIndexChange((index + 1) % images.length), INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [paused, images.length, index, onIndexChange]);

  const rawUrl = images[index]?.imageUrl ?? fallbackImageUrl;
  const currentUrl = rawUrl ? catalogPhotoUrl(rawUrl) : null;

  if (!currentUrl) {
    return (
      <span className="catalog-card-noimg" aria-hidden="true">
        Sin foto
      </span>
    );
  }

  return <img src={currentUrl} alt={alt} loading="lazy" />;
}
