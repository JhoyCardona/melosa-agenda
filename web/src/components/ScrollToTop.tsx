import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// React Router doesn't reset scroll position on navigation — without this, a
// link from the bottom of one page (e.g. the footer, or the sticky checkout
// bar) lands the next page already scrolled down instead of at the top.
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
