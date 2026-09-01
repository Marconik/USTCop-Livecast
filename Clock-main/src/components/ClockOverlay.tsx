import {useEffect, useMemo, useState} from 'react';
import {Colon, Digit} from './SevenSegment';

const getClockSettings = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    showSeconds: params.get('seconds') !== '0',
    scale: Number(params.get('scale') ?? '1') || 1,
  };
};

const beijingTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'Asia/Shanghai',
});

const getBeijingTimeParts = (date: Date) => {
  const parts = beijingTimeFormatter.formatToParts(date);
  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    hours: valueByType.hour ?? '00',
    minutes: valueByType.minute ?? '00',
    seconds: valueByType.second ?? '00',
  };
};

export default function ClockOverlay() {
  const [now, setNow] = useState(() => new Date());
  const settings = useMemo(getClockSettings, []);

  useEffect(() => {
    document.body.classList.add('obs-clock-page');
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 250);

    return () => {
      window.clearInterval(timer);
      document.body.classList.remove('obs-clock-page');
    };
  }, []);

  const {hours, minutes, seconds} = getBeijingTimeParts(now);
  const digits = settings.showSeconds
    ? `${hours}:${minutes}:${seconds}`
    : `${hours}:${minutes}`;

  return (
    <main className="clock-overlay" style={{transform: `scale(${settings.scale})`}}>
      <div className="clock-display" aria-label={digits}>
        <Digit value={digits[0]} />
        <Digit value={digits[1]} />
        <Colon />
        <Digit value={digits[3]} />
        <Digit value={digits[4]} />
        {settings.showSeconds && (
          <>
            <Colon />
            <Digit value={digits[6]} />
            <Digit value={digits[7]} />
          </>
        )}
      </div>
    </main>
  );
}
