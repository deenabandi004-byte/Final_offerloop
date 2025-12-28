import React from 'react';

const ResumeRendererSkeleton: React.FC = () => {
  return (
    <div className="bg-white p-8 animate-pulse">
      {/* Header skeleton */}
      <div className="text-center border-b-2 border-gray-200 pb-4 mb-4">
        <div className="h-8 bg-gray-200 rounded w-64 mx-auto mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-96 mx-auto"></div>
      </div>
      
      {/* Summary skeleton */}
      <div className="mb-4">
        <div className="h-5 bg-gray-200 rounded w-24 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-full mb-1"></div>
        <div className="h-4 bg-gray-200 rounded w-5/6"></div>
      </div>
      
      {/* Education skeleton */}
      <div className="mb-4">
        <div className="h-5 bg-gray-200 rounded w-28 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-72 mb-1"></div>
        <div className="h-4 bg-gray-200 rounded w-48"></div>
      </div>
      
      {/* Experience skeleton */}
      <div className="mb-4">
        <div className="h-5 bg-gray-200 rounded w-32 mb-2"></div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="mb-3">
            <div className="h-4 bg-gray-200 rounded w-48 mb-1"></div>
            <div className="h-3 bg-gray-200 rounded w-36 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-full mb-1"></div>
            <div className="h-3 bg-gray-200 rounded w-11/12"></div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ResumeRendererSkeleton;

