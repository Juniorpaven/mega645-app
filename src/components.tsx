// File: src/components.tsx
// Các component hiển thị — khai báo ở cấp module (không tạo lại mỗi lần render).
import { Maximize2 } from 'lucide-react';
import { DOUBLE_NUMBERS, type TicketStats } from './strategies';

export const FrequencyHeatmap = ({
  data,
  title,
  highlight = [],
  isPrevious = false,
  onClick
}: {
  data: Record<number, number>,
  title: string,
  highlight?: number[],
  isPrevious?: boolean,
  onClick?: () => void
}) => {
  const vals = Object.values(data);
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const range = max - min;
  const hotThreshold = max - (range / 3);
  const coldThreshold = min + (range / 3);

  return (
    <div
      onClick={onClick}
      className={`flex flex-col gap-2 bg-slate-900/50 p-2 rounded-lg border border-slate-800 transition-all cursor-pointer hover:border-slate-600 ${isPrevious ? 'opacity-60 grayscale-[0.3]' : ''}`}
    >
      <div className="flex justify-between items-center">
        <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-wider truncate flex items-center gap-1">
          {title} <Maximize2 className="w-2 h-2 opacity-50" />
        </h3>
      </div>
      <div className="grid grid-cols-8 gap-1">
        {Array.from({ length: 45 }, (_, i) => i + 1).map(num => {
          const freq = data[num] || 0;
          const isHighlighted = highlight.includes(num);

          // 3-Level Logic: Hot / Warm / Cold
          let bgClass = 'bg-slate-800 text-slate-500 border-slate-700'; // Default (0 freq or error)

          if (freq > 0) {
            if (freq >= hotThreshold) {
              bgClass = 'bg-red-600 text-white border-red-800 shadow-red-900/50';
            } else if (freq <= coldThreshold) {
              bgClass = 'bg-blue-600 text-white border-blue-800 shadow-blue-900/50';
            } else {
              bgClass = 'bg-amber-500 text-black border-amber-700 shadow-amber-900/50';
            }
          }

          return (
            <div
              key={num}
              className={`
                relative w-full aspect-square rounded-full flex flex-col items-center justify-center transition-all border-2
                ${bgClass}
                ${isHighlighted ? 'ring-1 ring-white scale-110 z-10 shadow-lg' : 'opacity-90 hover:opacity-100 hover:scale-105'}
              `}
              title={`Số ${num}: ${freq} lần`}
            >
              <span className="text-[9px] font-bold leading-none">{num < 10 ? `0${num}` : num}</span>
              <span className="text-[7px] font-bold leading-none mt-px opacity-80">{freq}</span>
              {isHighlighted && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const HealthBadge = ({ score, status }: { score: number, status: string }) => {
  let color = 'bg-slate-500';
  if (status === 'EXCELLENT') color = 'bg-emerald-500';
  if (status === 'GOOD') color = 'bg-blue-500';
  if (status === 'WARNING') color = 'bg-yellow-500';
  if (status === 'BAD') color = 'bg-red-500';

  return (
    <div className="flex items-center gap-2" title={`Điểm sức khỏe: ${score}/100`}>
      <div className="w-20 h-2.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${score}%` }}></div>
      </div>
      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${color.replace('bg-', 'text-')} bg-opacity-20 border border-opacity-50 border-${color.replace('bg-', '')}`}>
        {score}
      </span>
    </div>
  );
};

export const TicketRowV10 = ({ stats, index, isLocked, lockedSet, onClickNumber, latestResult = [] }: { stats: TicketStats, index: number, isLocked: boolean, lockedSet?: Set<number>, onClickNumber?: (n: number) => void, latestResult?: number[] }) => {
  const isBad = stats.status === 'BAD';
  const opacityClass = isBad && !isLocked ? 'opacity-50 grayscale hover:opacity-100 hover:grayscale-0 transition-all' : '';

  return (
    <div className={`flex flex-col gap-3 p-4 rounded-xl border bg-slate-900/80 shadow-sm ${opacityClass} ${isBad ? 'border-red-900/50 bg-red-900/5' : 'border-slate-800'}`}>

      {/* Row Header: Score & Status */}
      <div className="flex justify-between items-center border-b border-slate-800/50 pb-3 mb-1">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500 font-mono font-bold">#{index + 1}</span>
          <HealthBadge score={stats.score} status={stats.status} />
        </div>
        {stats.issues.length > 0 && (
          <div className="flex gap-1.5 flex-wrap justify-end">
            {stats.issues.map((issue, i) => (
              <span key={i} className="text-[10px] uppercase font-bold bg-red-950 text-red-400 px-2 py-1 rounded border border-red-900/50">
                {issue}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Numbers & Stats */}
      <div className="flex flex-col xl:flex-row justify-between items-center gap-4">
        <div className="flex gap-1 md:gap-1.5 flex-nowrap overflow-x-auto max-w-full py-2 px-2 justify-start md:justify-center scrollbar-hide">
          {stats.numbers.map((n, i) => {
            const isDouble = DOUBLE_NUMBERS.includes(n);
            const isMatch = !isLocked && lockedSet?.has(n);

            // LIVE MATRIX: Gold Border Style (No Hot/Cold Colors)
            // LOCKED MATRIX: Green Tint
            let bgClass = 'bg-slate-800';
            let textClass = 'text-slate-200';
            let borderClass = 'border-slate-700';
            let shadowClass = '';
            let ringClass = '';
            let scaleClass = '';
            let zIndexClass = '';

            if (isLocked) {
              bgClass = 'bg-emerald-900/20';
              textClass = 'text-emerald-100';
              borderClass = 'border-emerald-800/50';
            } else {
              // Live Matrix Style
              bgClass = 'bg-slate-950';
              textClass = 'text-yellow-500';
              borderClass = 'border-yellow-600/50';
              shadowClass = 'shadow-[0_0_8px_rgba(234,179,8,0.15)]';
            }

            // Match highlight for Live Matrix (vs Locked) - Standard Match
            if (isMatch && !isLocked) {
              bgClass = 'bg-yellow-900/20';
              textClass = 'text-yellow-400';
              borderClass = 'border-yellow-500';
              shadowClass = 'shadow-[0_0_15px_rgba(234,179,8,0.6)]';
              ringClass = 'ring-1 ring-yellow-400';
              zIndexClass = 'z-10';
              scaleClass = 'scale-110';
            }

            // LATEST RESULT MATCH (Highest Priority BG, but KEEP Border)
            if (latestResult.includes(n)) {
              bgClass = 'bg-purple-600';
              textClass = 'text-white font-bold';
              // Keep borderClass from above to preserve "Pool/Locked" status indication
              // Add a ring or shadow to emphasize the match
              ringClass = 'ring-1 ring-purple-300';
              shadowClass = 'shadow-[0_0_15px_rgba(168,85,247,0.8)]';
              zIndexClass = 'z-20';
              scaleClass = 'scale-110';
            }

            const finalClass = `${bgClass} ${textClass} border ${borderClass} ${shadowClass} ${ringClass} ${zIndexClass} ${scaleClass}`;

            return (
              <span key={i} onClick={() => onClickNumber && onClickNumber(n)} className={`relative font-mono font-bold w-7 h-7 md:w-9 md:h-9 flex-none flex items-center justify-center rounded-lg text-xs md:text-base cursor-pointer hover:scale-110 transition-transform ${finalClass}`}>
                {n < 10 ? `0${n}` : n}
                {isDouble && <span className="absolute -top-1 -right-1 w-1.5 h-1.5 md:w-2 md:h-2 bg-purple-500 rounded-full border-2 border-slate-900"></span>}
              </span>
            );
          })}
        </div>

        {/* Mini Indicators (Always Visible) */}
        <div className="flex gap-2 text-xs font-mono font-medium flex-wrap justify-center">
          <span className={`px-2 py-1 rounded border ${stats.sum >= 95 && stats.sum <= 181 ? 'border-slate-700 text-slate-400 bg-slate-800/50' : 'border-red-800 text-red-400 bg-red-900/20'}`}>
            ∑{stats.sum}
          </span>
          <span className={`px-2 py-1 rounded border ${stats.evens >= 2 && stats.evens <= 4 ? 'border-slate-700 text-slate-400 bg-slate-800/50' : 'border-yellow-800 text-yellow-400 bg-yellow-900/20'}`}>
            {stats.evens}C/{stats.odds}L
          </span>
          <span className={`px-2 py-1 rounded border ${stats.highs >= 2 && stats.highs <= 4 ? 'border-slate-700 text-slate-400 bg-slate-800/50' : 'border-blue-800 text-blue-400 bg-blue-900/20'}`}>
            {stats.highs}T/{stats.lows}X
          </span>
          {stats.consecutive && <span className="px-2 py-1 rounded bg-emerald-900/30 text-emerald-400 border border-emerald-800">LiênKề</span>}
        </div>
      </div>
    </div>
  );
};

export const LineItem = ({ line, idx, isHistory = false }: { line: string, idx: number, isHistory?: boolean }) => (
  <div className={`flex items-center gap-2 font-mono ${isHistory ? 'opacity-30' : 'text-slate-300'}`}>
    <span className="w-6 text-right text-slate-600 select-none">{idx + 1}</span>
    <span className="whitespace-pre">{line}</span>
  </div>
);
