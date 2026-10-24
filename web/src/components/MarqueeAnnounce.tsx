import './MarqueeAnnounce.css';

// Same seamless-loop technique as AnnouncementBar in SiteChrome: COPIES
// identical groups side by side, the track slides by exactly one group.
const COPIES = 4;
// More bulbs than any screen needs; the row is clipped at the edge, so the
// spacing stays fixed instead of stretching on wide screens.
const BULB_COUNT = 80;

// Also used on its own (inside a red strip) to frame page sections.
export function BulbRow() {
  return (
    <div className="marquee-announce-bulbs" aria-hidden="true">
      {Array.from({ length: BULB_COUNT }, (_, i) => (
        <span key={i} className={i % 2 ? 'is-odd' : undefined} />
      ))}
    </div>
  );
}

// Scrolling announcement strip styled like the catalog's circus sign
// (MarqueeFrame): red band, a straight row of blinking bulbs on each edge and
// gold trim around the moving text.
export default function MarqueeAnnounce({ messages }: { messages: string[] }) {
  return (
    <div className="marquee-announce" role="region" aria-label="Anuncios de Melosa">
      <BulbRow />
      <div className="marquee-announce-text">
        <div className="marquee-announce-track" aria-hidden="true">
          {Array.from({ length: COPIES }, (_, copy) => (
            <div key={copy} className="marquee-announce-group">
              {messages.map((msg, i) => (
                <span key={i} className="marquee-announce-item">
                  {msg}
                </span>
              ))}
            </div>
          ))}
        </div>
        {/* One clean copy for screen readers — the visual track is repeated. */}
        <p className="sr-only">{messages.join('. ')}</p>
      </div>
      <BulbRow />
    </div>
  );
}
