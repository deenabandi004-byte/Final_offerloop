import React from 'react';

export const GranolaBackground = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Base layer - very light blue-white */}
      <div 
        className="fixed inset-0"
        style={{
          background: '#F8FAFC',
          zIndex: -30,
        }}
      />
      
      {/* Large gradient blob - top right (most prominent) */}
      <div 
        className="fixed pointer-events-none"
        style={{
          top: '-20%',
          right: '-15%',
          width: '70%',
          height: '70%',
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.35) 0%, rgba(96, 165, 250, 0.2) 30%, rgba(147, 197, 253, 0.1) 50%, transparent 70%)',
          filter: 'blur(40px)',
          zIndex: -20,
        }}
      />
      
      {/* Large gradient blob - bottom left */}
      <div 
        className="fixed pointer-events-none"
        style={{
          bottom: '-25%',
          left: '-20%',
          width: '80%',
          height: '80%',
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, rgba(96, 165, 250, 0.15) 35%, rgba(147, 197, 253, 0.08) 55%, transparent 75%)',
          filter: 'blur(50px)',
          zIndex: -20,
        }}
      />
      
      {/* Medium blob - top left accent */}
      <div 
        className="fixed pointer-events-none"
        style={{
          top: '10%',
          left: '-10%',
          width: '50%',
          height: '50%',
          background: 'radial-gradient(circle, rgba(96, 165, 250, 0.25) 0%, rgba(147, 197, 253, 0.1) 40%, transparent 65%)',
          filter: 'blur(35px)',
          zIndex: -20,
        }}
      />
      
      {/* Medium blob - center right */}
      <div 
        className="fixed pointer-events-none"
        style={{
          top: '40%',
          right: '5%',
          width: '40%',
          height: '40%',
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.2) 0%, rgba(96, 165, 250, 0.1) 40%, transparent 60%)',
          filter: 'blur(30px)',
          zIndex: -20,
        }}
      />
      
      {/* Smaller accent blob - bottom center */}
      <div 
        className="fixed pointer-events-none"
        style={{
          bottom: '10%',
          left: '30%',
          width: '35%',
          height: '35%',
          background: 'radial-gradient(circle, rgba(147, 197, 253, 0.22) 0%, rgba(191, 219, 254, 0.1) 40%, transparent 60%)',
          filter: 'blur(25px)',
          zIndex: -20,
        }}
      />
      
      {/* Subtle noise texture overlay */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          opacity: 0.02,
          zIndex: -10,
        }}
      />
      
      {/* Content */}
      <div className="relative" style={{ zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
};

export default GranolaBackground;
