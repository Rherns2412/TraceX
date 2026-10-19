import React, { useState } from 'react';
import { Search, X, ArrowRight } from 'lucide-react';

interface ForensicSearchBarProps {
  onSearch: (query: string) => void;
  searchSummary?: string | null;
  activeQuery?: string;
  onClear: () => void;
}

export const ForensicSearchBar: React.FC<ForensicSearchBarProps> = ({
  onSearch,
  searchSummary,
  activeQuery,
  onClear,
}) => {
  const [inputVal, setInputVal] = useState<string>(activeQuery || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputVal.trim()) {
      onSearch(inputVal.trim());
    }
  };

  const handleClear = () => {
    setInputVal('');
    onClear();
  };

  return (
    <div className="flex flex-col gap-2 w-full font-mono text-xs">
      {/* Search Input Bar */}
      <form onSubmit={handleSubmit} className="relative flex items-center w-full">
        <div className="absolute left-3 text-neutral-500">
          <Search className="w-3.5 h-3.5" />
        </div>

        <input
          type="text"
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          placeholder="Search detections, camera IDs, or track IDs…"
          className="w-full pl-9 pr-24 py-2 bg-neutral-900 border border-neutral-800 rounded text-neutral-100 placeholder-neutral-500 text-xs focus:outline-none focus:border-purple-600 transition-colors"
        />

        <div className="absolute right-1.5 flex items-center gap-1">
          {inputVal && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-neutral-500 hover:text-neutral-300 rounded"
              title="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}

          <button
            type="submit"
            className="flex items-center gap-1 px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-[11px] font-medium transition-colors"
          >
            <span>Search</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </form>

      {searchSummary && (
        <div className="flex items-start justify-between p-2.5 bg-neutral-900 border border-neutral-800 rounded text-neutral-300 text-xs">
          <div className="flex items-start gap-2">
            <span className="text-purple-400 font-semibold shrink-0">QUERY RESULT:</span>
            <span>{searchSummary}</span>
          </div>
          <button
            onClick={handleClear}
            className="text-[11px] text-neutral-400 hover:text-neutral-200 underline ml-3 shrink-0"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
};
