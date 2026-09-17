import { useEffect, useState } from 'react';
import type { ProductDesignImage } from '../types';

const INTERVAL_MS = 3000;

interface DesignCarouselProps {
  images: ProductDesignImage[];
  fallbackImageUrl: string | null;
  alt: string;
}

// Catalog card media: cycles through a design's color photos automatically.
// Falls back to the design's cover photo (or "Sin foto") when it has no color
// images loaded yet.
export default function DesignCarousel({ images, fallbackImageUrl, alt }: DesignCarouselProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (images.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [images.length]);

  const currentUrl = images[index]?.imageUrl ?? fallbackImageUrl;

  if (!currentUrl) {
    return (
      <span className="catalog-card-noimg" aria-hidden="true">
        Sin foto
      </span>
    );
  }

  return <img src={currentUrl} alt={alt} loading="lazy" />;
}
