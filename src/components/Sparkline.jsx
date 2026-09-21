import React, { useRef, useEffect } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useChartTheme } from '@/hooks/useChartTheme';
import { withAlpha } from '@/lib/color';

const Sparkline = ({ data, width = 80, height = 30, color }) => {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const { gain, loss } = useChartTheme();

  useEffect(() => {
    if (!data || data.length < 2 || !containerRef.current) return;

    const isPositive = data[data.length - 1] >= data[0];
    const lineColor = color || (isPositive ? gain : loss);
    const timestamps = data.map((_, i) => i);

    const opts = {
      width,
      height,
      cursor: { show: false },
      legend: { show: false },
      axes: [{ show: false }, { show: false }],
      scales: { x: { time: false } },
      series: [
        {},
        { stroke: lineColor, width: 1.5, fill: withAlpha(lineColor, 0.08) },
      ],
    };

    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new uPlot(opts, [timestamps, data], containerRef.current);

    return () => {
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    };
  }, [data, width, height, color, gain, loss]);

  return <div ref={containerRef} className="inline-block" />;
};

export default Sparkline;
