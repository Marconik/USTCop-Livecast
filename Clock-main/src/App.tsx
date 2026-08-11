/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Digit, Colon } from './components/SevenSegment';

export default function App() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatNumber = (num: number) => num.toString().padStart(2, '0');

  const hours = formatNumber(time.getHours());
  const minutes = formatNumber(time.getMinutes());
  const seconds = formatNumber(time.getSeconds());

  return (
    <div className="min-h-screen bg-[#111] flex items-center justify-center p-4 font-mono">
      {/* LCD Screen Background */}
      <div className="bg-[#1a2e1a] p-6 sm:p-10 rounded-lg shadow-[0_0_50px_rgba(57,255,20,0.1),inset_0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden border-4 border-[#1a2e1a]">
        
        {/* Subtle Grid Texture */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" 
              style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '4px 4px' }}>
        </div>

        {/* Glass Reflection */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none rounded-lg"></div>

        {/* The Display */}
        <div className="flex items-center justify-center relative z-10">
          <Digit value={hours[0]} />
          <Digit value={hours[1]} />
          <Colon />
          <Digit value={minutes[0]} />
          <Digit value={minutes[1]} />
          <Colon />
          <Digit value={seconds[0]} />
          <Digit value={seconds[1]} />
        </div>

      </div>
    </div>
  );
}

