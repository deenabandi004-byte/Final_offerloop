import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, X, Pause, Play } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface ScreenshotItem {
  image: string;
  title: string;
  description?: string;
}

interface ScreenshotGalleryProps {
  items: ScreenshotItem[];
  autoPlay?: boolean;
  autoPlayInterval?: number;
}

export default function ScreenshotGallery({ 
  items, 
  autoPlay = true, 
  autoPlayInterval = 4000 
}: ScreenshotGalleryProps) {
  const { theme } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-play with progress bar
  useEffect(() => {
    if (!autoPlay || isPaused || items.length <= 1) {
      setProgress(0);
      return;
    }

    const interval = 50; // Update progress every 50ms
    const steps = autoPlayInterval / interval;
    let currentStep = 0;

    progressRef.current = setInterval(() => {
      currentStep++;
      setProgress((currentStep / steps) * 100);
      
      if (currentStep >= steps) {
        setActiveIndex((prev) => (prev + 1) % items.length);
        currentStep = 0;
        setProgress(0);
      }
    }, interval);

    return () => {
      if (progressRef.current) {
        clearInterval(progressRef.current);
      }
    };
  }, [autoPlay, isPaused, autoPlayInterval, items.length, activeIndex]);

  const goToNext = () => {
    setActiveIndex((prev) => (prev + 1) % items.length);
    setProgress(0);
  };

  const goToPrev = () => {
    setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
    setProgress(0);
  };

  const goToIndex = (index: number) => {
    if (index === activeIndex) return;
    setActiveIndex(index);
    setProgress(0);
  };

  // Track mouse for parallax effect
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setMousePos({ x, y });
  };

  if (items.length === 0) return null;

  const activeItem = items[activeIndex];
  
  // Calculate subtle parallax transform
  const parallaxX = (mousePos.x - 0.5) * 10;
  const parallaxY = (mousePos.y - 0.5) * 10;

  return (
    <>
      <div 
        ref={containerRef}
        className="relative w-full max-w-5xl mx-auto"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setMousePos({ x: 0.5, y: 0.5 });
        }}
        onMouseMove={handleMouseMove}
      >
        {/* Animated Background Glow */}
        <div className="absolute -inset-20 pointer-events-none overflow-hidden">
          <div 
            className="absolute w-[500px] h-[500px] rounded-full blur-[100px] transition-all duration-1000 ease-out animate-pulse-slow"
            style={{
              background: theme === 'light' 
                ? 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%)'
                : 'radial-gradient(circle, rgba(59, 130, 246, 0.25) 0%, transparent 70%)',
              left: `calc(50% + ${parallaxX * 3}px - 250px)`,
              top: `calc(50% + ${parallaxY * 3}px - 250px)`,
            }}
          />
          <div 
            className="absolute w-[400px] h-[400px] rounded-full blur-[80px] transition-all duration-700 ease-out"
            style={{
              background: theme === 'light' 
                ? 'radial-gradient(circle, rgba(6, 182, 212, 0.12) 0%, transparent 70%)'
                : 'radial-gradient(circle, rgba(6, 182, 212, 0.2) 0%, transparent 70%)',
              right: `calc(20% + ${-parallaxX * 2}px)`,
              bottom: `calc(20% + ${-parallaxY * 2}px)`,
            }}
          />
        </div>

        {/* Main Screenshot Display */}
        <div className="relative">
          {/* Navigation Arrows */}
          {items.length > 1 && (
            <>
              <button
                onClick={goToPrev}
                className="absolute -left-4 md:-left-16 top-1/2 -translate-y-1/2 z-30 p-3 rounded-full transition-all duration-300 hover:scale-110 group opacity-0 hover:opacity-100 md:opacity-100"
                style={{
                  background: theme === 'light' 
                    ? 'rgba(255, 255, 255, 0.95)'
                    : 'rgba(30, 41, 59, 0.95)',
                  backdropFilter: 'blur(10px)',
                  border: theme === 'light'
                    ? '1px solid rgba(0, 0, 0, 0.08)'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: theme === 'light'
                    ? '0 4px 20px rgba(0, 0, 0, 0.08)'
                    : '0 4px 20px rgba(0, 0, 0, 0.3)',
                }}
                aria-label="Previous screenshot"
              >
                <ChevronLeft className={`h-5 w-5 transition-all duration-300 group-hover:-translate-x-0.5 ${
                  theme === 'light' 
                    ? 'text-foreground group-hover:text-blue-600' 
                    : 'text-foreground group-hover:text-cyan-400'
                }`} />
              </button>
              <button
                onClick={goToNext}
                className="absolute -right-4 md:-right-16 top-1/2 -translate-y-1/2 z-30 p-3 rounded-full transition-all duration-300 hover:scale-110 group opacity-0 hover:opacity-100 md:opacity-100"
                style={{
                  background: theme === 'light' 
                    ? 'rgba(255, 255, 255, 0.95)'
                    : 'rgba(30, 41, 59, 0.95)',
                  backdropFilter: 'blur(10px)',
                  border: theme === 'light'
                    ? '1px solid rgba(0, 0, 0, 0.08)'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: theme === 'light'
                    ? '0 4px 20px rgba(0, 0, 0, 0.08)'
                    : '0 4px 20px rgba(0, 0, 0, 0.3)',
                }}
                aria-label="Next screenshot"
              >
                <ChevronRight className={`h-5 w-5 transition-all duration-300 group-hover:translate-x-0.5 ${
                  theme === 'light' 
                    ? 'text-foreground group-hover:text-blue-600' 
                    : 'text-foreground group-hover:text-cyan-400'
                }`} />
              </button>
            </>
          )}

          {/* Device Frame with Parallax */}
          <div 
            className="relative rounded-2xl overflow-hidden transition-all duration-300 ease-out group"
            style={{
              transform: isHovered 
                ? `perspective(1000px) rotateY(${parallaxX * 0.5}deg) rotateX(${-parallaxY * 0.5}deg) scale(1.01)`
                : 'perspective(1000px) rotateY(0deg) rotateX(0deg) scale(1)',
              background: theme === 'light' 
                ? 'linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)'
                : 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
              boxShadow: isHovered
                ? theme === 'light'
                  ? '0 35px 60px -15px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05)'
                  : '0 35px 60px -15px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05), 0 0 100px -20px rgba(59, 130, 246, 0.2)'
                : theme === 'light'
                  ? '0 25px 50px -12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)'
                  : '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
            }}
          >
            {/* Shine Effect on Hover */}
            <div 
              className="absolute inset-0 pointer-events-none z-20 transition-opacity duration-500"
              style={{
                background: 'linear-gradient(105deg, transparent 40%, rgba(255, 255, 255, 0.03) 45%, rgba(255, 255, 255, 0.06) 50%, rgba(255, 255, 255, 0.03) 55%, transparent 60%)',
                opacity: isHovered ? 1 : 0,
                transform: `translateX(${(mousePos.x - 0.5) * 100}%)`,
              }}
            />

            {/* Browser Top Bar */}
            <div 
              className="flex items-center px-4 py-3"
              style={{
                background: theme === 'light' 
                  ? 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)'
                  : 'linear-gradient(180deg, #334155 0%, #1e293b 100%)',
                borderBottom: theme === 'light' 
                  ? '1px solid rgba(0, 0, 0, 0.06)'
                  : '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              {/* Window Controls */}
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-[#ff5f57] transition-transform hover:scale-110" />
                <div className="w-3 h-3 rounded-full bg-[#febc2e] transition-transform hover:scale-110" />
                <div className="w-3 h-3 rounded-full bg-[#28c840] transition-transform hover:scale-110" />
              </div>
              
              {/* URL Bar */}
              <div 
                className="flex-1 max-w-md mx-auto h-7 rounded-lg flex items-center justify-center gap-2 px-4"
                style={{
                  background: theme === 'light' 
                    ? 'rgba(0, 0, 0, 0.04)'
                    : 'rgba(0, 0, 0, 0.3)',
                }}
              >
                <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <span className={`text-sm font-medium text-foreground`}>
                  offerloop.ai
                </span>
              </div>
              
              {/* Play/Pause Button */}
              <button
                onClick={() => setIsPaused(!isPaused)}
                className={`p-1.5 rounded-md transition-all duration-200 hover:scale-110 ${
                  theme === 'light' 
                    ? 'hover:bg-muted text-muted-foreground' 
                    : 'hover:bg-white/10 text-muted-foreground'
                }`}
                aria-label={isPaused ? 'Play' : 'Pause'}
              >
                {isPaused ? (
                  <Play className="w-3.5 h-3.5" />
                ) : (
                  <Pause className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {/* Progress Bar */}
            {autoPlay && items.length > 1 && (
              <div 
                className="h-0.5 w-full"
                style={{
                  background: theme === 'light' 
                    ? 'rgba(0, 0, 0, 0.05)'
                    : 'rgba(255, 255, 255, 0.05)',
                }}
              >
                <div
                  className="h-full transition-all duration-100 ease-linear"
                  style={{
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)',
                  }}
                />
              </div>
            )}

            {/* Screenshot Container */}
            <div className="relative overflow-hidden">
              <div 
                className="relative"
                style={{ aspectRatio: '16/9' }}
              >
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="absolute inset-0 transition-all duration-700 ease-out"
                    style={{
                      opacity: index === activeIndex ? 1 : 0,
                      transform: index === activeIndex 
                        ? 'scale(1) translateX(0)' 
                        : index < activeIndex 
                          ? 'scale(1.05) translateX(-30px)' 
                          : 'scale(1.05) translateX(30px)',
                      filter: index === activeIndex ? 'blur(0px)' : 'blur(4px)',
                      pointerEvents: index === activeIndex ? 'auto' : 'none',
                    }}
                  >
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-contain transition-transform duration-500"
                      style={{
                        backgroundColor: theme === 'light' ? '#f8fafc' : '#0f172a',
                        transform: isHovered && index === activeIndex ? 'scale(1.02)' : 'scale(1)',
                      }}
                      loading={index === 0 ? 'eager' : 'lazy'}
                    />
                  </div>
                ))}

                {/* Hover Overlay */}
                <div 
                  className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300 cursor-pointer"
                  onClick={() => setFullscreenImage(activeItem.image)}
                >
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFullscreenImage(activeItem.image);
                      }}
                      className="p-2.5 rounded-xl backdrop-blur-md transition-all duration-300 hover:scale-110"
                      style={{
                        background: 'rgba(0, 0, 0, 0.5)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                      }}
                    >
                      <Maximize2 className="h-4 w-4 text-white" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Animated Reflection */}
          <div 
            className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-[90%] h-12 rounded-full blur-2xl transition-all duration-500"
            style={{
              background: theme === 'light'
                ? 'radial-gradient(ellipse, rgba(0, 0, 0, 0.08) 0%, transparent 70%)'
                : 'radial-gradient(ellipse, rgba(59, 130, 246, 0.15) 0%, transparent 70%)',
              transform: `translateX(calc(-50% + ${parallaxX}px))`,
            }}
          />
        </div>

        {/* Title & Description with Animation */}
        <div className="text-center mt-10 px-4">
          <div 
            key={activeIndex}
            className="animate-fadeSlideUp"
          >
            <h3 className={`text-xl md:text-2xl font-semibold mb-2 text-foreground`}>
              {activeItem.title}
            </h3>
            {activeItem.description && (
              <p className={`text-base text-muted-foreground`}>
                {activeItem.description}
              </p>
            )}
          </div>
        </div>

        {/* Interactive Dots */}
        {items.length > 1 && (
          <div className="flex justify-center gap-2 mt-6">
            {items.map((_, index) => (
              <button
                key={index}
                onClick={() => goToIndex(index)}
                className="relative transition-all duration-300 rounded-full group/dot"
                style={{
                  width: index === activeIndex ? '32px' : '10px',
                  height: '10px',
                  background: index === activeIndex
                    ? 'linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)'
                    : theme === 'light'
                      ? 'rgba(0, 0, 0, 0.12)'
                      : 'rgba(255, 255, 255, 0.15)',
                }}
                aria-label={`Go to screenshot ${index + 1}`}
              >
                {/* Hover ring effect */}
                <span 
                  className="absolute inset-0 rounded-full transition-all duration-300 group-hover/dot:scale-150 group-hover/dot:opacity-50"
                  style={{
                    background: index === activeIndex
                      ? 'linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)'
                      : theme === 'light'
                        ? 'rgba(0, 0, 0, 0.1)'
                        : 'rgba(255, 255, 255, 0.1)',
                    opacity: 0,
                  }}
                />
              </button>
            ))}
          </div>
        )}

        {/* Keyboard hint */}
        <div className={`text-center mt-4 text-xs transition-opacity duration-300 ${
          isHovered ? 'opacity-100' : 'opacity-0'
        } text-muted-foreground`}>
          Click to expand • Drag dots to navigate
        </div>
      </div>

      {/* Fullscreen Modal */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 animate-fadeIn"
          onClick={() => setFullscreenImage(null)}
          style={{
            background: 'rgba(0, 0, 0, 0.92)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <button
            className="absolute top-4 right-4 md:top-6 md:right-6 p-3 rounded-full transition-all duration-300 hover:scale-110 hover:bg-white/20 z-50"
            onClick={() => setFullscreenImage(null)}
            aria-label="Close fullscreen"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
            }}
          >
            <X className="h-5 w-5 text-white" />
          </button>
          
          <img
            src={fullscreenImage}
            alt="Fullscreen screenshot"
            className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg shadow-2xl animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes scaleIn {
          from { 
            opacity: 0;
            transform: scale(0.95);
          }
          to { 
            opacity: 1;
            transform: scale(1);
          }
        }
        
        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes pulse-slow {
          0%, 100% {
            opacity: 0.5;
            transform: scale(1);
          }
          50% {
            opacity: 0.8;
            transform: scale(1.05);
          }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        
        .animate-scaleIn {
          animation: scaleIn 0.3s ease-out;
        }
        
        .animate-fadeSlideUp {
          animation: fadeSlideUp 0.4s ease-out;
        }
        
        .animate-pulse-slow {
          animation: pulse-slow 4s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}
