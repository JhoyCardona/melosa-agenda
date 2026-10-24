import type { ProductDesignImage } from '../types';
import { catalogPhotoUrl } from '../bookingShared';

interface DesignCarouselProps {
  images: ProductDesignImage[];
  fallbackImageUrl: string | null;
  alt: string;
  // Controlled by the parent, whose arrows move between the color photos.
  index: number;
}

// Catalog card media: the design's color photo at `index`. Nothing cycles on
// its own — the customer flips through colors with the card's arrows. Falls
// back to the design's cover photo (or "Sin foto") when it has no color
// images loaded yet.
export default function DesignCarousel({ images, fallbackImageUrl, alt, index }: DesignCarouselProps) {
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
