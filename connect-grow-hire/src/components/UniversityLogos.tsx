import React from 'react';
import Callogo from '@/assets/Callogo.png';
import Caltechlogo from '@/assets/Caltechlogo.png';
import LMUlogo from '@/assets/LMUlogo.png';
import SDSUlogo from '@/assets/SDSUlogo.png';
import UCIlogo from '@/assets/UCIlogo.png';
import UCLAlogo from '@/assets/UCLAlogo.png';
import UCSBlogo from '@/assets/UCSBlogo.png';
import UCSDlogo from '@/assets/UCSDlogo.png';
import Udublogo from '@/assets/Udublogo.png';
import UofOlogo from '@/assets/UofOlogo.png';
import USClogo from '@/assets/USClogo.png';
import USDlogo from '@/assets/USDlogo.png';
import WSUlogo from '@/assets/WSUlogo.png';

const universityLogos = [
  { name: 'UC Berkeley', src: Callogo },
  { name: 'Caltech', src: Caltechlogo },
  { name: 'LMU', src: LMUlogo },
  { name: 'SDSU', src: SDSUlogo },
  { name: 'UCI', src: UCIlogo },
  { name: 'UCLA', src: UCLAlogo },
  { name: 'UCSB', src: UCSBlogo },
  { name: 'UCSD', src: UCSDlogo },
  { name: 'UW', src: Udublogo },
  { name: 'Oregon', src: UofOlogo },
  { name: 'USC', src: USClogo },
  { name: 'USD', src: USDlogo },
  { name: 'WSU', src: WSUlogo },
];

const UniversityLogos: React.FC = () => {
  return (
    <section className="bg-white py-16 px-5 w-full overflow-hidden">
      <style>{`
        @keyframes scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        
        .animate-scroll {
          animation: scroll 30s linear infinite;
        }
      `}</style>
      
      <h2 className="text-center text-2xl font-semibold text-gray-800 mb-10">
        Trusted by Students/Alumni From Top Universities
      </h2>
      
      <div className="relative w-full overflow-hidden">
        <div className="flex items-center gap-16 animate-scroll w-max">
          {/* Logos duplicated for seamless loop */}
          {[...universityLogos, ...universityLogos].map((logo, index) => (
            <img
              key={index}
              src={logo.src}
              alt={logo.name}
              className="h-12 w-auto object-contain flex-shrink-0 opacity-90 hover:opacity-100 transition-opacity duration-300"
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default UniversityLogos;
