import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const INTERESTS = [
  'Investment Banking',
  'Management Consulting',
  'Private Equity',
  'Venture Capital',
  'Software Development',
  'Product Management',
  'Data Science',
  'Marketing',
];

interface AnimatedInterestTextProps {
  className?: string;
}

export const AnimatedInterestText: React.FC<AnimatedInterestTextProps> = ({ className = '' }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % INTERESTS.length);
    }, 2500); // Change every 2.5 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <span className={`inline-block ${className}`}>
      <AnimatePresence mode="wait">
        <motion.span
          key={currentIndex}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.4 }}
        >
          {INTERESTS[currentIndex]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
};
