import React from 'react';
import { motion } from 'framer-motion';

const AnimatedDots: React.FC = () => {
  return (
    <span className="inline-flex items-baseline gap-3 ml-3">
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="inline-block w-6 h-6 rounded-full bg-black dark:bg-black"
          style={{ marginBottom: '0.15em' }}
          animate={{
            y: [0, -10, 0],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: index * 0.2,
            ease: "easeInOut",
          }}
        />
      ))}
    </span>
  );
};

export default AnimatedDots;

