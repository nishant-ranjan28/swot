import React from 'react';

const TabSkeleton = ({ rows = 5 }) => (
  <div className="space-y-4 animate-pulse">
    {[...Array(rows)].map((_, i) => (
      <div key={i} className="flex justify-between items-center">
        <div className="h-4 bg-gray-200 rounded w-1/3"></div>
        <div className="h-4 bg-gray-200 rounded w-1/4"></div>
      </div>
    ))}
  </div>
);

export default TabSkeleton;
