import React, { useState, useEffect } from 'react';

interface DynamicBackgroundProps {
  images: string[];
  transitionDuration?: number; // seconds per image
  fadeDuration?: number; // seconds for crossfade
}

const DynamicBackground: React.FC<DynamicBackgroundProps> = ({
  images,
  transitionDuration = 8,
  fadeDuration = 2,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [nextIndex, setNextIndex] = useState(1);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (images.length === 0) return;

    const interval = setInterval(() => {
      setFadeOut(true);
      
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % images.length);
        setNextIndex((prev) => (prev + 1) % images.length);
        setFadeOut(false);
      }, fadeDuration * 1000);
    }, transitionDuration * 1000);

    return () => clearInterval(interval);
  }, [images.length, transitionDuration, fadeDuration]);

  if (images.length === 0) return null;

  return (
    <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
      {images.map((image, index) => (
        <div
          key={index}
          className={`absolute inset-0 transition-opacity ${
            index === currentIndex
              ? fadeOut
                ? 'opacity-0'
                : 'opacity-100'
              : 'opacity-0'
          }`}
          style={{
            backgroundImage: `url(${image})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            transitionDuration: `${fadeDuration}s`,
          }}
        />
      ))}
    </div>
  );
};

export default DynamicBackground;
