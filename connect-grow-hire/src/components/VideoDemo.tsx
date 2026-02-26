import { useState, useCallback, useEffect } from "react";
import { PlayCircle, X } from "lucide-react";
import { createPortal } from "react-dom";

interface VideoDemoProps {
  videoId: string;
}

export function VideoDemo({ videoId }: VideoDemoProps) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary cursor-pointer hover:opacity-70 transition-opacity mt-3"
      >
        <PlayCircle className="h-4 w-4" />
        Video Demo
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.6)" }}
            onClick={close}
          >
            <div
              className="relative w-full max-w-3xl mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={close}
                className="absolute -top-10 right-0 text-white/80 hover:text-white transition-colors"
                aria-label="Close video"
              >
                <X className="h-6 w-6" />
              </button>
              <div className="w-full rounded-lg overflow-hidden" style={{ aspectRatio: "16/9" }}>
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
                  className="w-full h-full"
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                  title="Video Demo"
                />
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
