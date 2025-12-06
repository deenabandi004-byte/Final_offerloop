import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const AUDIENCES = [
  'Students',
  'Undergraduates',
  'Graduates',
  'Young Professionals',
  'Career Switchers',
  'First-Generation Students',
  "Anyone figuring out what's next",
];

export const AnimatedMadeForText: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % AUDIENCES.length);
    }, 3000); // 3 seconds per item (2s visible + 1s transition)

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="text-center" style={{ overflow: 'visible', padding: '0.5rem 0' }}>
      <h2 className="text-5xl md:text-6xl lg:text-7xl font-semibold mb-4 text-white dark:text-white text-slate-900 dark:text-white" style={{ lineHeight: '1.2', overflow: 'visible', padding: '0.25rem 0' }}>
        Made for
      </h2>
      <div className="h-24 md:h-28 lg:h-32 flex items-center justify-center" style={{ overflow: 'visible', padding: '0.5rem 0' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ 
              duration: 0.8,
              ease: "easeInOut"
            }}
            className="text-3xl md:text-5xl lg:text-6xl font-bold gradient-text-teal"
            style={{ lineHeight: '1.2', overflow: 'visible', padding: '0.25rem 0.5rem' }}
          >
            {AUDIENCES[currentIndex]}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

