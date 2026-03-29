import { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';

const STORAGE_KEY = 'beehiiv_popup_shown';
const DELAY_MS = 20000;
const SCROLL_THRESHOLD = 0.45;

const BeehiivPopup = () => {
  const [visible, setVisible] = useState(false);
  const timerElapsed = useRef(false);
  const scrollMet = useRef(false);
  const dismissed = useRef(false);

  const dismiss = useCallback(() => {
    dismissed.current = true;
    sessionStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  }, []);

  const show = useCallback(() => {
    if (dismissed.current) return;
    if (timerElapsed.current || scrollMet.current) {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY)) return;

    const timer = setTimeout(() => {
      timerElapsed.current = true;
      show();
    }, DELAY_MS);

    const onScroll = () => {
      const scrollPct =
        window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
      if (scrollPct >= SCROLL_THRESHOLD) {
        scrollMet.current = true;
        show();
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
    };
  }, [show]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={dismiss}
    >
      <div
        className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={dismiss}
          className="absolute right-3 top-3 z-10 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <iframe
          src="https://subscribe-forms.beehiiv.com/e92d2565-d9af-4a75-bc9f-fcf4d0c6e952"
          className="beehiiv-embed"
          frameBorder="0"
          scrolling="no"
          style={{
            width: '100%',
            minHeight: 320,
            maxWidth: '100%',
            backgroundColor: 'transparent',
            borderRadius: 12,
          }}
        />
      </div>
    </div>
  );
};

export default BeehiivPopup;
