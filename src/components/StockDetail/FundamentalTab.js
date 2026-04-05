import React from 'react';
import { useStockData } from '../../hooks/useStockData';
import TabSkeleton from './TabSkeleton';

const ScoreBadge = ({ verdict }) => {
  const colors = {
    'Excellent': 'bg-green-600 text-white',
    'Strong': 'bg-green-600 text-white',
    'Attractive': 'bg-green-100 text-green-700',
    'Good': 'bg-green-100 text-green-700',
    'Sustainable': 'bg-green-100 text-green-700',
    'Moderate': 'bg-yellow-100 text-yellow-700',
    'Fair': 'bg-yellow-100 text-yellow-700',
    'Average': 'bg-yellow-100 text-yellow-700',
    'Conservative': 'bg-blue-100 text-blue-700',
    'Adequate': 'bg-yellow-100 text-yellow-700',
    'Weak': 'bg-red-100 text-red-700',
    'Slow': 'bg-red-100 text-red-700',
    'Low': 'bg-orange-100 text-orange-700',
    'High': 'bg-red-100 text-red-700',
    'Very High': 'bg-red-600 text-white',
    'Low Debt': 'bg-green-100 text-green-700',
    'Expensive': 'bg-red-100 text-red-700',
    'Very Low': 'bg-orange-100 text-orange-700',
    'Negative': 'bg-red-600 text-white',
    'Declining': 'bg-red-600 text-white',
    'High Yield': 'bg-green-100 text-green-700',
    'Unsustainable': 'bg-red-600 text-white',
    'None': 'bg-gray-100 text-gray-600',
    'Poor': 'bg-red-600 text-white',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${colors[verdict] || 'bg-gray-100 text-gray-600'}`}>
      {verdict}
    </span>
  );
};

const ScoreRing = ({ score, maxScore, label }) => {
  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const color = pct >= 70 ? '#16a34a' : pct >= 50 ? '#eab308' : '#ef4444';
  const circumference = 2 * Math.PI * 30;
  const strokeDash = (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-[76px] h-[76px]">
        <svg width="76" height="76" className="-rotate-90 absolute inset-0">
          <circle cx="38" cy="38" r="30" fill="none" stroke="#e5e7eb" strokeWidth="6" />
          <circle cx="38" cy="38" r="30" fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${strokeDash} ${circumference}`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold" style={{ color }}>{Math.round(pct)}%</span>
        </div>
      </div>
      <div className="text-xs text-gray-500 font-medium mt-2">{label}</div>
      <div className="text-[10px] text-gray-400">{score}/{maxScore}</div>
    </div>
  );
};

const OverallScore = ({ percentage, verdict }) => {
  const color = percentage >= 70 ? '#16a34a' : percentage >= 50 ? '#eab308' : '#ef4444';
  const circumference = 2 * Math.PI * 45;
  const strokeDash = (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center py-4">
      <div className="relative w-[120px] h-[120px]">
        <svg width="120" height="120" className="-rotate-90 absolute inset-0">
          <circle cx="60" cy="60" r="45" fill="none" stroke="#e5e7eb" strokeWidth="8" />
          <circle cx="60" cy="60" r="45" fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={`${strokeDash} ${circumference}`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold" style={{ color }}>{percentage}%</span>
        </div>
      </div>
      <div className="text-lg font-semibold mt-2" style={{ color }}>{verdict}</div>
      <div className="text-xs text-gray-500 mt-1">Fundamental Score</div>
    </div>
  );
};

const MetricRow = ({ item }) => (
  <div className="border-b border-gray-100 last:border-0 py-3">
    <div className="flex justify-between items-start mb-1">
      <span className="text-sm font-medium text-gray-800">{item.name}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-gray-900">
          {item.value}{item.unit || ''}
        </span>
        <ScoreBadge verdict={item.verdict} />
      </div>
    </div>
    <div className="flex justify-between items-center">
      <span className="text-xs text-gray-500">{item.description}</span>
      <span className="text-xs text-gray-400">{item.score}/{item.max_score}</span>
    </div>
    {/* Score bar */}
    <div className="mt-1.5 h-1.5 bg-gray-200 rounded-full">
      <div
        className="h-1.5 rounded-full transition-all"
        style={{
          width: `${(item.score / item.max_score) * 100}%`,
          backgroundColor: item.score >= 8 ? '#16a34a' : item.score >= 5 ? '#eab308' : '#ef4444',
        }}
      ></div>
    </div>
  </div>
);

const Section = ({ title, section }) => {
  if (!section || !section.items || section.items.length === 0) return null;
  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-md font-semibold text-gray-800">{title}</h3>
        <span className="text-xs text-gray-500 font-medium">{section.score}/{section.max} points</span>
      </div>
      <div className="bg-gray-50 rounded-lg p-4">
        {section.items.map((item) => (
          <MetricRow key={item.name} item={item} />
        ))}
      </div>
    </div>
  );
};

const FundamentalTab = ({ symbol }) => {
  const { data, loading, error, refetch } = useStockData(`/api/stocks/${symbol}/fundamental`);

  if (loading) return <TabSkeleton rows={10} />;
  if (error) return <div className="text-red-600 text-center py-8">{error} <button onClick={refetch} className="text-blue-600 underline ml-2">Retry</button></div>;
  if (!data) return <div className="text-gray-500 text-center py-8">No fundamental data available.</div>;

  return (
    <div className="space-y-6">
      {/* Overall Score */}
      <div className="bg-gray-50 rounded-xl p-6">
        <OverallScore percentage={data.overall_percentage} verdict={data.overall_verdict} />

        {/* Category scores */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-4 mt-4">
          <ScoreRing score={data.valuation?.score || 0} maxScore={data.valuation?.max || 1} label="Valuation" />
          <ScoreRing score={data.profitability?.score || 0} maxScore={data.profitability?.max || 1} label="Profitability" />
          <ScoreRing score={data.growth?.score || 0} maxScore={data.growth?.max || 1} label="Growth" />
          <ScoreRing score={data.financial_health?.score || 0} maxScore={data.financial_health?.max || 1} label="Health" />
          <ScoreRing score={data.dividend?.score || 0} maxScore={data.dividend?.max || 1} label="Dividend" />
        </div>
      </div>

      {/* Sections */}
      <Section title="Valuation" section={data.valuation} />
      <Section title="Profitability" section={data.profitability} />
      <Section title="Growth" section={data.growth} />
      <Section title="Financial Health" section={data.financial_health} />
      <Section title="Dividend" section={data.dividend} />

      {/* Disclaimer */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex gap-2">
          <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <p className="text-xs text-amber-700 leading-relaxed">
            <span className="font-semibold">Disclaimer:</span> Fundamental scores are calculated using standard financial metrics and general industry thresholds. They provide a simplified view and may not capture industry-specific nuances. Different sectors have different benchmarks (e.g., high P/B is normal for IT companies). This is not financial advice. Always conduct thorough research and consult a qualified financial advisor.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FundamentalTab;
