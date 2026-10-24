import { useId } from 'react';
import './MarqueeFrame.css';

// Drawing canvas. The frame is designed wide (not a stretched copy of a
// classic 3:2 sign), so it scales uniformly to the card width and the bulbs
// stay round.
const W = 400;
const H = 130;
const CX = W / 2;
const CY = H / 2;

// Outline of the sign at a given inset from the outer edge: concave corner
// notches, a small crest top and bottom, and a bulge on each side — the
// classic circus marquee silhouette. Insets give concentric layers
// (red band, gold trim, cream panel).
function framePath(inset: number): string {
  const l = 14 + inset;
  const r = W - 14 - inset;
  const t = 14 + inset;
  const b = H - 14 - inset;
  const notch = 26 - inset * 0.4;
  const crest = 10 - inset * 0.5;
  const bulge = 12 - inset * 0.5;
  const crestHalf = 30;
  return [
    `M ${l + notch} ${t}`,
    `L ${CX - crestHalf} ${t}`,
    `C ${CX - 15} ${t} ${CX - 10} ${t - crest} ${CX} ${t - crest}`,
    `C ${CX + 10} ${t - crest} ${CX + 15} ${t} ${CX + crestHalf} ${t}`,
    `L ${r - notch} ${t}`,
    `A ${notch} ${notch} 0 0 0 ${r} ${t + notch}`,
    `L ${r} ${CY - 15}`,
    `C ${r + bulge} ${CY - 10} ${r + bulge} ${CY + 10} ${r} ${CY + 15}`,
    `L ${r} ${b - notch}`,
    `A ${notch} ${notch} 0 0 0 ${r - notch} ${b}`,
    `L ${CX + crestHalf} ${b}`,
    `C ${CX + 15} ${b} ${CX + 10} ${b + crest} ${CX} ${b + crest}`,
    `C ${CX - 10} ${b + crest} ${CX - 15} ${b} ${CX - crestHalf} ${b}`,
    `L ${l + notch} ${b}`,
    `A ${notch} ${notch} 0 0 0 ${l} ${b - notch}`,
    `L ${l} ${CY + 15}`,
    `C ${l - bulge} ${CY + 10} ${l - bulge} ${CY - 10} ${l} ${CY - 15}`,
    `L ${l} ${t + notch}`,
    `A ${notch} ${notch} 0 0 0 ${l + notch} ${t}`,
    'Z',
  ].join(' ');
}

const OUTER = framePath(0);
const GOLD = framePath(13);
const PANEL = framePath(16);
const BULB_TRACK = framePath(6.5);
const BULB_SPACING = 17;

// Bulb positions along the middle of the red band, computed once from the
// path geometry (needs the DOM's SVG engine, so it runs lazily in the browser).
let bulbCache: { x: number; y: number }[] | null = null;
function bulbPoints(): { x: number; y: number }[] {
  if (bulbCache) return bulbCache;
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', BULB_TRACK);
  const total = path.getTotalLength();
  const count = Math.round(total / BULB_SPACING);
  bulbCache = Array.from({ length: count }, (_, i) => {
    const p = path.getPointAtLength((i * total) / count);
    return { x: p.x, y: p.y };
  });
  return bulbCache;
}

// Sunburst rays behind the name, like the reference sign.
const RAYS = Array.from({ length: 36 }, (_, i) => {
  const a = (i / 36) * Math.PI * 2;
  return `M ${CX} ${CY} L ${CX + Math.cos(a) * 260} ${CY + Math.sin(a) * 260}`;
}).join(' ');

interface MarqueeFrameProps {
  title: string;
  // Blink the bulbs only while the sign is on screen; off-screen signs stay
  // still so a long catalog doesn't burn CPU on lights nobody sees.
  live: boolean;
}

// Circus marquee sign with blinking bulbs, used for the design name under each
// catalog photo. Drawn from scratch (no third-party artwork, no license
// strings attached).
export default function MarqueeFrame({ title, live }: MarqueeFrameProps) {
  const clipId = useId();
  // Shrink long names so they always fit inside the panel.
  const fontSize = Math.min(28, 300 / Math.max(title.length * 0.56, 1));

  return (
    <svg
      className={`marquee-frame ${live ? 'marquee-frame-live' : ''}`}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={title}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={PANEL} />
        </clipPath>
      </defs>
      {/* Static offset copy as the shadow: a CSS drop-shadow filter would be
          re-rendered on every blink. */}
      <path d={OUTER} className="marquee-frame-shadow" transform="translate(0 4)" />
      <path d={OUTER} className="marquee-frame-band" />
      <path d={GOLD} className="marquee-frame-gold" />
      <path d={PANEL} className="marquee-frame-panel" />
      <path d={RAYS} className="marquee-frame-rays" clipPath={`url(#${clipId})`} />
      {/* Bulbs in two groups; the blink animates just the two groups'
          opacity instead of every bulb's color. */}
      {[0, 1].map((parity) => (
        <g key={parity} className={`marquee-frame-bulbs marquee-frame-bulbs-${parity}`}>
          {bulbPoints()
            .filter((_, i) => i % 2 === parity)
            .map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={4.2} />
            ))}
        </g>
      ))}
      <text x={CX} y={CY} className="marquee-frame-title" style={{ fontSize }}>
        {title}
      </text>
    </svg>
  );
}
