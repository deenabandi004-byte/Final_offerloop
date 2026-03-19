import React from "react";
import { GlassCard } from "@/components/GlassCard";

interface JobBoardSkeletonProps {
  showNewMatches?: boolean;
}

const shimmerStyle = `
@keyframes shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
@keyframes fadeInUp {
  0% { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes progressSlide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}
`;

const ShimmerBlock: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = "", style }) => (
  <div
    className={`rounded-[3px] ${className}`}
    style={{
      background: "linear-gradient(90deg, hsl(217 20% 93%) 25%, hsl(217 20% 97%) 50%, hsl(217 20% 93%) 75%)",
      backgroundSize: "800px 100%",
      animation: "shimmer 1.8s ease-in-out infinite",
      ...style,
    }}
  />
);

const JobCardSkeleton: React.FC<{ index: number }> = ({ index }) => (
  <GlassCard className="p-5" >
    <div style={{ animation: `shimmer 1.8s ease-in-out infinite`, animationDelay: `${index * 150}ms` }}>
      <div className="flex items-start justify-between gap-4">
        {/* Logo */}
        <ShimmerBlock className="w-12 h-12 flex-shrink-0" style={{ animationDelay: `${index * 150}ms` }} />

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 space-y-2">
              {/* Job title */}
              <ShimmerBlock className="h-4 w-3/4" style={{ animationDelay: `${index * 150}ms` }} />
              {/* Company name */}
              <ShimmerBlock className="h-3 w-1/2" style={{ animationDelay: `${index * 150 + 50}ms` }} />
              {/* Match score */}
              <ShimmerBlock className="h-5 w-16 mt-1" style={{ animationDelay: `${index * 150 + 100}ms` }} />
            </div>
            {/* Bookmark icon placeholder */}
            <ShimmerBlock className="w-8 h-8 rounded-full flex-shrink-0" style={{ animationDelay: `${index * 150}ms` }} />
          </div>

          {/* Badges row */}
          <div className="flex gap-2 mt-3">
            <ShimmerBlock className="h-5 w-20 rounded-full" style={{ animationDelay: `${index * 150 + 100}ms` }} />
            <ShimmerBlock className="h-5 w-16 rounded-full" style={{ animationDelay: `${index * 150 + 150}ms` }} />
            <ShimmerBlock className="h-5 w-14 rounded-full" style={{ animationDelay: `${index * 150 + 200}ms` }} />
          </div>

          {/* Posted time row */}
          <div className="flex items-center gap-3 mt-3">
            <ShimmerBlock className="h-3 w-20" style={{ animationDelay: `${index * 150 + 200}ms` }} />
            <ShimmerBlock className="h-3 w-16" style={{ animationDelay: `${index * 150 + 250}ms` }} />
          </div>
        </div>
      </div>

      {/* Button row */}
      <div className="mt-4 pt-4 border-t border-border/30 space-y-2">
        <div className="flex gap-2">
          <ShimmerBlock className="h-8 flex-1" style={{ animationDelay: `${index * 150 + 250}ms` }} />
          <ShimmerBlock className="h-8 flex-1" style={{ animationDelay: `${index * 150 + 300}ms` }} />
        </div>
        <ShimmerBlock className="h-8 w-full" style={{ animationDelay: `${index * 150 + 350}ms` }} />
      </div>
    </div>
  </GlassCard>
);

const NewMatchCardSkeleton: React.FC<{ index: number }> = ({ index }) => (
  <div className="flex-shrink-0 w-80">
    <GlassCard className="p-3">
      <div className="flex items-center gap-3">
        {/* Small logo */}
        <ShimmerBlock className="w-8 h-8 flex-shrink-0 rounded-md" style={{ animationDelay: `${index * 120}ms` }} />
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Title */}
          <ShimmerBlock className="h-3.5 w-4/5" style={{ animationDelay: `${index * 120 + 50}ms` }} />
          {/* Company + location */}
          <ShimmerBlock className="h-3 w-3/5" style={{ animationDelay: `${index * 120 + 100}ms` }} />
        </div>
        {/* Badge */}
        <ShimmerBlock className="h-5 w-14 rounded-full flex-shrink-0" style={{ animationDelay: `${index * 120 + 80}ms` }} />
      </div>
      {/* Buttons */}
      <div className="flex gap-2 mt-2">
        <ShimmerBlock className="h-7 flex-1" style={{ animationDelay: `${index * 120 + 150}ms` }} />
        <ShimmerBlock className="h-7 flex-1" style={{ animationDelay: `${index * 120 + 200}ms` }} />
      </div>
      <ShimmerBlock className="h-7 w-full mt-1.5" style={{ animationDelay: `${index * 120 + 250}ms` }} />
    </GlassCard>
  </div>
);

export const JobBoardSkeleton: React.FC<JobBoardSkeletonProps> = ({ showNewMatches = true }) => (
  <div className="space-y-6">
    <style>{shimmerStyle}</style>

    {/* Progress indicator */}
    <div style={{ animation: "fadeInUp 0.6s ease-out both" }}>
      <div className="relative overflow-hidden rounded-full h-1 bg-muted/50 mb-3">
        <div
          className="absolute inset-y-0 left-0 w-1/2 rounded-full"
          style={{
            background: "linear-gradient(90deg, transparent, hsl(217 91% 60% / 0.5), hsl(217 91% 60%), hsl(217 91% 60% / 0.5), transparent)",
            animation: "progressSlide 1.8s ease-in-out infinite",
          }}
        />
      </div>
      <p className="text-sm text-muted-foreground" style={{ animation: "fadeInUp 0.8s ease-out both" }}>
        Finding your best matches...
      </p>
    </div>

    {/* New Matches rail skeleton */}
    {showNewMatches && (
      <div style={{ animation: "fadeInUp 0.6s ease-out 0.1s both" }}>
        <ShimmerBlock className="h-5 w-32 mb-3" style={{ animationDelay: "0ms" }} />
        <div className="flex gap-3 overflow-hidden pb-3">
          {[...Array(4)].map((_, i) => (
            <NewMatchCardSkeleton key={i} index={i} />
          ))}
        </div>
      </div>
    )}

    {/* Main grid skeleton */}
    <div style={{ animation: "fadeInUp 0.6s ease-out 0.2s both" }}>
      <ShimmerBlock className="h-5 w-36 mb-3" style={{ animationDelay: "0ms" }} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <JobCardSkeleton key={i} index={i} />
        ))}
      </div>
    </div>
  </div>
);
