import React, { useRef } from 'react';
import firstImage from '../assets/firstimage.jpeg';

const RotatingImage: React.FC = () => {
  const boxRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!boxRef.current || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    
    const rotateX = -y / 10;
    const rotateY = x / 10;
    
    boxRef.current.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  };

  const handleMouseLeave = () => {
    if (!boxRef.current) return;
    boxRef.current.style.transform = 'rotateX(2deg) rotateY(-5deg)';
  };

  return (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        perspective: '1000px',
        display: 'flex',
        justifyContent: 'center',
        padding: '40px 20px',
      }}
    >
      <div
        ref={boxRef}
        style={{
          width: '100%',
          maxWidth: '1200px',
          transformStyle: 'preserve-3d',
          transition: 'transform 0.3s ease',
          cursor: 'grab',
          transform: 'rotateX(2deg) rotateY(-5deg)',
        }}
      >
        <img
          src={firstImage}
          alt="Offerloop Demo"
          style={{
            width: '100%',
            height: 'auto',
            borderRadius: '15px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
          }}
        />
      </div>
    </div>
  );
};

export default RotatingImage;

