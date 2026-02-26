import { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { AppHeader } from "@/components/AppHeader";
import { videoTutorials, chromeExtensionVideos, type VideoTutorial } from "@/data/videoTutorials";

const CARD_GAP = 16;

const FALLBACK_THUMB = (videoId: string) =>
  `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

function VideoCard({ video }: { video: VideoTutorial }) {
  const [hovered, setHovered] = useState(false);
  const [thumbSrc, setThumbSrc] = useState(video.thumbnailUrl);
  return (
    <a
      href={video.youtubeUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="carousel-card flex-shrink-0 rounded-xl overflow-hidden transition-all duration-300 cursor-pointer"
      style={{
        scrollSnapAlign: "start",
        background: "#fff",
        boxShadow: hovered ? "0 8px 30px rgba(37, 99, 235, 0.18)" : "0 1px 4px rgba(0,0,0,0.06)",
        transform: hovered ? "scale(1.04)" : "scale(1)",
        zIndex: hovered ? 10 : 1,
        position: "relative",
        minWidth: 0,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="relative w-full flex items-center justify-center"
        style={{
          aspectRatio: "16/9",
          minHeight: 100,
          background: "#f1f5f9",
        }}
      >
        <img
          src={thumbSrc}
          alt={video.title}
          className="w-full h-full object-contain"
          style={{ maxHeight: "100%" }}
          loading="lazy"
          onError={() => setThumbSrc(FALLBACK_THUMB(video.videoId))}
        />
        <div
          className="absolute inset-0 flex items-center justify-center transition-opacity duration-200"
          style={{
            background: "rgba(0,0,0,0.25)",
            opacity: hovered ? 1 : 0.6,
          }}
        >
          <div
            className="flex items-center justify-center rounded-full transition-transform duration-200"
            style={{
              width: "56px",
              height: "56px",
              background: "rgba(37, 99, 235, 0.9)",
              transform: hovered ? "scale(1.15)" : "scale(1)",
            }}
          >
            <Play className="h-6 w-6 ml-0.5" style={{ color: "#fff" }} fill="#fff" />
          </div>
        </div>
      </div>
      <div className="px-4 py-3">
        <h3
          className="text-sm font-medium leading-snug mb-1"
          style={{
            color: "#1E293B",
            fontFamily: "var(--font-body)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {video.title}
        </h3>
        <p
          className="text-xs leading-relaxed transition-all duration-300"
          style={{
            color: "#64748B",
            fontFamily: "var(--font-body)",
            display: "-webkit-box",
            WebkitLineClamp: hovered ? 6 : 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {video.description}
        </p>
      </div>
    </a>
  );
}

function VideoCarousel({ title, videos }: { title: string; videos: VideoTutorial[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScrollability = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    checkScrollability();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScrollability, { passive: true });
    window.addEventListener("resize", checkScrollability);
    return () => {
      el.removeEventListener("scroll", checkScrollability);
      window.removeEventListener("resize", checkScrollability);
    };
  }, [checkScrollability, videos.length]);

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const firstCard = el.querySelector(".carousel-card") as HTMLElement;
    const step = firstCard ? firstCard.offsetWidth + CARD_GAP : el.clientWidth * 0.8;
    el.scrollBy({ left: direction === "left" ? -step : step, behavior: "smooth" });
  };

  return (
    <section className="min-w-0 overflow-hidden">
      <div className="flex items-center justify-between mb-5">
        <h2
          className="text-xl font-semibold"
          style={{ color: "#1E293B", fontFamily: "var(--font-body)" }}
        >
          {title}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canScrollLeft}
            onClick={() => scroll("left")}
            className="flex items-center justify-center w-8 h-8 rounded-full transition-all"
            style={{
              background: canScrollLeft ? "rgba(37, 99, 235, 0.10)" : "rgba(0,0,0,0.04)",
              color: canScrollLeft ? "#2563EB" : "#CBD5E1",
              cursor: canScrollLeft ? "pointer" : "default",
            }}
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={!canScrollRight}
            onClick={() => scroll("right")}
            className="flex items-center justify-center w-8 h-8 rounded-full transition-all"
            style={{
              background: canScrollRight ? "rgba(37, 99, 235, 0.10)" : "rgba(0,0,0,0.04)",
              color: canScrollRight ? "#2563EB" : "#CBD5E1",
              cursor: canScrollRight ? "pointer" : "default",
            }}
            aria-label="Scroll right"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex pb-2 carousel-scroll-area"
        style={{
          gap: `${CARD_GAP}px`,
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {videos.map((video) => (
          <VideoCard key={video.videoId} video={video} />
        ))}
      </div>
    </section>
  );
}

export default function DocumentationPage() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="" />
          <main style={{ background: '#F8FAFF', flex: 1, overflowY: 'auto' }}>
            <div className="max-w-4xl mx-auto px-3 py-6 sm:px-6 sm:py-12">
              <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                <h1
                  className="text-[28px] sm:text-[42px]"
                  style={{
                    fontFamily: "'Instrument Serif', Georgia, serif",
                    fontWeight: 400,
                    letterSpacing: "-0.025em",
                    color: "#0F172A",
                    textAlign: "center",
                    marginBottom: "10px",
                    lineHeight: 1.1,
                  }}
                >
                  Documentation
                </h1>
                <p
                  style={{
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    fontSize: "16px",
                    color: "#64748B",
                    textAlign: "center",
                    marginBottom: "28px",
                    lineHeight: 1.5,
                  }}
                >
                  Watch feature tutorials and learn how to get the most out of Offerloop.
                </p>
              </div>

              <VideoCarousel title="Features" videos={videoTutorials} />
              <div style={{ marginTop: '36px' }}>
                <VideoCarousel title="Chrome Extension" videos={chromeExtensionVideos} />
              </div>
            </div>

            <style>{`
              .carousel-scroll-area::-webkit-scrollbar { display: none; }
              .carousel-scroll-area { scrollbar-width: none; -ms-overflow-style: none; min-width: 0; }
              .carousel-card {
                width: calc((100% - 48px) / 4);
                min-width: 240px;
                max-width: 100%;
              }
              @media (max-width: 1024px) {
                .carousel-card {
                  width: calc((100% - 32px) / 3);
                }
              }
              @media (max-width: 768px) {
                .carousel-card {
                  width: calc((100% - 16px) / 2);
                }
              }
              @media (max-width: 480px) {
                .carousel-card {
                  width: calc(100% - 32px);
                  min-width: 0;
                }
              }
            `}</style>
          </main>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
