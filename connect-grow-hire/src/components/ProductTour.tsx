import React from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, Search, Building2, Coffee, Library } from 'lucide-react';
import { ContactSearchDemoPlaceholder } from './demo/ContactSearchDemoPlaceholder';
import { FirmSearchDemoPlaceholder } from './demo/FirmSearchDemoPlaceholder';
import { CoffeeChatDemoPlaceholder } from './demo/CoffeeChatDemoPlaceholder';
import { ContactLibraryDemoPlaceholder } from './demo/ContactLibraryDemoPlaceholder';
import { AnimatedInterestText } from './AnimatedInterestText';
import { AnimatedMadeForText } from './AnimatedMadeForText';
import { useTheme } from '@/contexts/ThemeContext';
import proSearchVideo from '@/assets/Offerloop Professional Search.mp4';
import directoryVideo from '@/assets/contact directory and emails.mp4';
import scoutWavingDark from '@/assets/ScoutWavingDark.mp4';
import scoutWavingWhite from '@/assets/ScoutWavingWhite.mp4';
import TextType from './TextType';

export const ProductTour: React.FC = () => {
  const { theme } = useTheme();
  const cardVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <section id="features" className="py-32 px-6 overflow-visible relative">
      <div className="max-w-7xl mx-auto overflow-visible">
        {/* Made for Animated Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-24 overflow-visible"
        >
          <AnimatedMadeForText />
        </motion.div>

        {/* Feature 1: Contact Search - Large, Left Aligned, No Box */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="mb-32"
        >
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Text - Minimal */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 dark:from-purple-500/20 dark:to-indigo-500/20 from-purple-100 to-indigo-100 dark:from-purple-500/20 dark:to-indigo-500/20 flex items-center justify-center border border-purple-200/50 dark:border-transparent">
                  <Search className="h-6 w-6 text-blue-400 dark:text-blue-400 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-4xl font-bold text-section-heading">Contact Search</h3>
              </div>
              <p className="text-xl text-section-body leading-relaxed">
                Turn "who should I reach out to?" into a real list — in one click.
              </p>
            </div>
            
            {/* Large Demo Area - Video */}
            <div className="relative">
              <div className="aspect-video rounded-2xl overflow-hidden border border-purple-500/20 dark:border-purple-500/20 border-purple-300/60 dark:border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-indigo-500/5 dark:from-purple-500/5 dark:to-indigo-500/5 from-purple-50/80 to-indigo-50/80 dark:from-purple-500/5 dark:to-indigo-500/5 shadow-lg dark:shadow-none shadow-purple-100/50 dark:shadow-none">
                <video
                  src={proSearchVideo}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-blue-500/10 dark:bg-blue-500/10 bg-blue-200/40 dark:bg-blue-500/10 rounded-full blur-3xl"></div>
            </div>
          </div>
        </motion.div>

        {/* Feature 2: Firm Search - Asymmetrical, Right Aligned, With Box */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mb-32"
        >
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Large Demo Area - Left Side */}
            <div className="relative order-2 lg:order-1">
              <div className="aspect-[4/3] rounded-2xl overflow-hidden border-2 border-emerald-500/30 dark:border-emerald-500/30 border-emerald-300/60 dark:border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 dark:from-emerald-500/5 dark:to-teal-500/5 from-emerald-50/80 to-teal-50/80 dark:from-emerald-500/5 dark:to-teal-500/5 glass-card shadow-lg dark:shadow-none shadow-emerald-100/50 dark:shadow-none">
                <FirmSearchDemoPlaceholder />
              </div>
              <div className="absolute -top-4 -left-4 w-32 h-32 bg-emerald-500/10 dark:bg-emerald-500/10 bg-emerald-200/40 dark:bg-emerald-500/10 rounded-full blur-3xl"></div>
            </div>
            
            {/* Text - Right Side */}
            <div className="space-y-6 order-1 lg:order-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 dark:from-emerald-500/20 dark:to-teal-500/20 from-emerald-100 to-teal-100 dark:from-emerald-500/20 dark:to-teal-500/20 flex items-center justify-center border border-emerald-200/50 dark:border-transparent">
                  <Building2 className="h-6 w-6 text-emerald-400 dark:text-emerald-400 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="text-4xl font-bold text-section-heading">Firm Search</h3>
              </div>
              <p className="text-xl text-section-body leading-relaxed">
                Not sure what you want to do? Start with what you're interested in.
              </p>
              <div className="p-6 bg-emerald-500/10 dark:bg-emerald-500/10 bg-emerald-50/80 dark:bg-emerald-500/10 rounded-xl border border-emerald-500/20 dark:border-emerald-500/20 border-emerald-200/60 dark:border-emerald-500/20">
                <p className="text-lg text-foreground">
                  I don't know what to do but I'm interested in{' '}
                  <AnimatedInterestText className="text-emerald-400 dark:text-emerald-400 text-emerald-600 dark:text-emerald-400" />
                  .
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Feature 3: Contact Library (replaces Coffee Chat Prep visually) */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mb-32"
        >
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 dark:from-purple-500/20 dark:to-indigo-500/20 from-purple-100 to-indigo-100 dark:from-purple-500/20 dark:to-indigo-500/20 flex items-center justify-center border border-purple-200/50 dark:border-transparent">
                <Library className="h-6 w-6 text-blue-400 dark:text-blue-400 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-4xl font-bold text-section-heading">Contact Library</h3>
            </div>
            <p className="text-2xl text-section-body">
              All your outreach — organized in one place.
            </p>
            
            {/* Large Centered Demo - Contact Library video */}
            <div className="relative mt-12">
              <div className="aspect-video rounded-2xl overflow-hidden border border-purple-500/20 dark:border-purple-500/20 border-purple-300/60 dark:border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-indigo-500/5 dark:from-purple-500/5 dark:to-indigo-500/5 from-purple-50/80 to-indigo-50/80 dark:from-purple-500/5 dark:to-indigo-500/5 shadow-lg dark:shadow-none shadow-purple-100/50 dark:shadow-none">
                <video
                  src={directoryVideo}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -top-8 -left-8 w-40 h-40 bg-purple-500/10 dark:bg-purple-500/10 bg-purple-200/40 dark:bg-purple-500/10 rounded-full blur-3xl"></div>
              <div className="absolute -bottom-8 -right-8 w-40 h-40 bg-indigo-500/10 dark:bg-indigo-500/10 bg-indigo-200/40 dark:bg-indigo-500/10 rounded-full blur-3xl"></div>
            </div>
          </div>
        </motion.div>

        {/* Feature 4: Coffee Chat Prep - Large, Full Width, Purple Accent */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mb-32"
        >
          <div className="glass-card p-12 rounded-3xl border-2 border-purple-500/30 dark:border-purple-500/30 border-purple-300/60 dark:border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-indigo-500/5 dark:from-purple-500/5 dark:to-indigo-500/5 from-purple-50/60 to-indigo-50/60 dark:from-purple-500/5 dark:to-indigo-500/5 shadow-xl dark:shadow-none shadow-purple-100/30 dark:shadow-none">
            <div className="grid lg:grid-cols-[1.2fr,1fr] gap-16 items-center">
              {/* Text Side */}
              <div className="space-y-8">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 dark:from-purple-500/20 dark:to-indigo-500/20 from-purple-100 to-indigo-100 dark:from-purple-500/20 dark:to-indigo-500/20 flex items-center justify-center border border-purple-200/50 dark:border-transparent">
                    <Coffee className="h-8 w-8 text-blue-400 dark:text-blue-400 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="text-5xl font-bold text-section-heading">Coffee Chat Prep</h3>
                </div>
                <p className="text-2xl text-section-body leading-relaxed">
                  Paste a LinkedIn URL. Walk in prepared.
                </p>
              </div>
              
              {/* Demo Side - Image */}
              <div className="relative">
                <div className="aspect-[4/3] rounded-2xl overflow-hidden border border-purple-500/20 dark:border-purple-500/20 border-purple-300/50 dark:border-purple-500/20 shadow-lg dark:shadow-none shadow-purple-100/40 dark:shadow-none">
                  <CoffeeChatDemoPlaceholder />
                </div>
                <div className="absolute -top-6 -right-6 w-32 h-32 bg-purple-500/10 dark:bg-purple-500/10 bg-purple-200/40 dark:bg-purple-500/10 rounded-full blur-3xl"></div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Scout - Enhanced with Video and Speech Bubble */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="max-w-5xl mx-auto"
        >
          <div className="flex flex-col md:flex-row items-center md:items-start gap-8 p-8">
            {/* Scout Video - Left side on desktop, top on mobile */}
            <div className="flex-shrink-0 w-[28rem] h-[32rem] md:w-[32rem] md:h-[36rem] relative overflow-hidden rounded-2xl">
              <video
                src={theme === 'light' ? scoutWavingWhite : scoutWavingDark}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full"
                style={{
                  objectFit: 'cover',
                  objectPosition: 'center center',
                  transform: 'scale(1.1)',
                  transformOrigin: 'center center'
                }}
                aria-hidden="true"
              />
            </div>

            {/* Text and Speech Bubble - Right side on desktop, below on mobile */}
            <div className="flex-1 space-y-6">
              <div>
                <h4 className="text-3xl md:text-4xl font-bold mb-3">
                  <span className="text-section-heading">Meet </span>
                  <motion.span
                    className="gradient-text-teal inline-block"
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 200,
                      damping: 15,
                      delay: 0.3
                    }}
                  >
                    Scout
                  </motion.span>
                </h4>
                <p className="text-lg text-section-body leading-relaxed">
                  Your built-in guide when you're stuck — Scout suggests prompts and helps you decide what to type at every step.
                </p>
              </div>

              {/* Speech Bubble */}
              <div className="relative">
                {/* Speech bubble tail/pointer */}
                <div 
                  className="absolute -left-4 top-6 w-0 h-0 border-t-[12px] border-t-transparent border-r-[12px] border-b-[12px] border-b-transparent"
                  style={{
                    borderRightColor: theme === 'light' 
                      ? 'rgba(255, 255, 255, 0.95)' 
                      : 'rgba(15, 23, 42, 0.9)'
                  }}
                />
                
                {/* Speech bubble content */}
                <div 
                  className="relative p-5 rounded-2xl shadow-lg"
                  style={{
                    backgroundColor: theme === 'light' 
                      ? 'rgba(255, 255, 255, 0.95)' 
                      : 'rgba(15, 23, 42, 0.9)',
                    border: theme === 'light'
                      ? '1px solid rgba(59, 130, 246, 0.2)'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: theme === 'light'
                      ? '0 4px 12px rgba(59, 130, 246, 0.1)'
                      : '0 4px 12px rgba(0, 0, 0, 0.3)'
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 bg-green-400 dark:bg-green-400 bg-green-500 dark:bg-green-400 rounded-full animate-pulse"></div>
                    <span className="text-sm font-medium text-muted-foreground">Scout</span>
                  </div>
                  <p className="text-base text-foreground leading-relaxed">
                    Try searching for{' '}
                    <TextType
                      as="span"
                      text={[
                        '"Investment Banking Analyst at Goldman Sachs"',
                        '"Software Engineer at Google"',
                        '"Consultant at McKinsey"',
                        '"Product Manager at Apple"',
                        '"Data Scientist at Meta"',
                        '"Private Equity Analyst at Blackstone"'
                      ]}
                      typingSpeed={30}
                      deletingSpeed={20}
                      pauseDuration={2500}
                      loop={true}
                      showCursor={true}
                      cursorCharacter="|"
                      className="inline"
                      startOnVisible={true}
                    />
                    {' '}to get started.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
