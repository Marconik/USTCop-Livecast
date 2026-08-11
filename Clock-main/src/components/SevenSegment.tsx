import React from 'react';

type SegmentProps = {
  active: boolean;
  type: 'h' | 'v'; // horizontal or vertical
  className?: string;
};

const Segment = ({ active, type, className = '' }: SegmentProps) => {
  // Colors for the lit and unlit states
  // Using a classic "LCD Green" palette
  const activeColor = "bg-[#39ff14] shadow-[0_0_10px_#39ff14]";
  const inactiveColor = "bg-[#1a2e1a] opacity-20";

  const baseClasses = `transition-all duration-200 ${active ? activeColor : inactiveColor} ${className}`;

  if (type === 'h') {
    return (
      <div className={`h-2 sm:h-3 w-12 sm:w-16 rounded-full relative ${baseClasses}`}>
        {/* Hexagonal edges for realism */}
        <div className={`absolute left-[-4px] top-0 border-y-[4px] sm:border-y-[6px] border-r-[4px] sm:border-r-[6px] border-l-0 border-y-transparent border-r-current ${active ? 'text-[#39ff14]' : 'text-[#1a2e1a]'}`} />
        <div className={`absolute right-[-4px] top-0 border-y-[4px] sm:border-y-[6px] border-l-[4px] sm:border-l-[6px] border-r-0 border-y-transparent border-l-current ${active ? 'text-[#39ff14]' : 'text-[#1a2e1a]'}`} />
      </div>
    );
  }

  return (
    <div className={`w-2 sm:w-3 h-12 sm:h-16 rounded-full relative ${baseClasses}`}>
       <div className={`absolute top-[-4px] left-0 border-x-[4px] sm:border-x-[6px] border-b-[4px] sm:border-b-[6px] border-t-0 border-x-transparent border-b-current ${active ? 'text-[#39ff14]' : 'text-[#1a2e1a]'}`} />
       <div className={`absolute bottom-[-4px] left-0 border-x-[4px] sm:border-x-[6px] border-t-[4px] sm:border-t-[6px] border-b-0 border-x-transparent border-t-current ${active ? 'text-[#39ff14]' : 'text-[#1a2e1a]'}`} />
    </div>
  );
};

export const Digit = ({ value }: { value: number | string }) => {
  const num = parseInt(value.toString(), 10);
  
  // Segment mapping for 0-9
  //   A
  // F   B
  //   G
  // E   C
  //   D
  const segments = {
    0: [1, 1, 1, 1, 1, 1, 0],
    1: [0, 1, 1, 0, 0, 0, 0],
    2: [1, 1, 0, 1, 1, 0, 1],
    3: [1, 1, 1, 1, 0, 0, 1],
    4: [0, 1, 1, 0, 0, 1, 1],
    5: [1, 0, 1, 1, 0, 1, 1],
    6: [1, 0, 1, 1, 1, 1, 1],
    7: [1, 1, 1, 0, 0, 0, 0],
    8: [1, 1, 1, 1, 1, 1, 1],
    9: [1, 1, 1, 1, 0, 1, 1],
  }[num] || [0, 0, 0, 0, 0, 0, 0]; // Default off

  return (
    <div className="relative w-16 sm:w-20 h-28 sm:h-36 mx-1 sm:mx-2">
      {/* A */}
      <div className="absolute top-0 left-2 sm:left-3">
        <Segment active={!!segments[0]} type="h" />
      </div>
      {/* B */}
      <div className="absolute top-2 sm:top-3 right-0">
        <Segment active={!!segments[1]} type="v" />
      </div>
      {/* C */}
      <div className="absolute bottom-2 sm:bottom-3 right-0">
        <Segment active={!!segments[2]} type="v" />
      </div>
      {/* D */}
      <div className="absolute bottom-0 left-2 sm:left-3">
        <Segment active={!!segments[3]} type="h" />
      </div>
      {/* E */}
      <div className="absolute bottom-2 sm:bottom-3 left-0">
        <Segment active={!!segments[4]} type="v" />
      </div>
      {/* F */}
      <div className="absolute top-2 sm:top-3 left-0">
        <Segment active={!!segments[5]} type="v" />
      </div>
      {/* G */}
      <div className="absolute top-[50%] left-2 sm:left-3 -translate-y-1/2">
        <Segment active={!!segments[6]} type="h" />
      </div>
    </div>
  );
};

export const Colon = () => (
  <div className="flex flex-col justify-center gap-4 sm:gap-6 mx-2 sm:mx-4 h-28 sm:h-36 pb-4">
    <div className="w-3 h-3 sm:w-4 sm:h-4 bg-[#39ff14] rounded-full shadow-[0_0_10px_#39ff14] animate-pulse" />
    <div className="w-3 h-3 sm:w-4 sm:h-4 bg-[#39ff14] rounded-full shadow-[0_0_10px_#39ff14] animate-pulse" />
  </div>
);
