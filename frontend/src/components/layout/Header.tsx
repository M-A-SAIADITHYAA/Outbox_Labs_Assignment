'use client';

import React from 'react';
import { Search, Filter, RotateCw, Zap } from 'lucide-react';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  searchEngine?: string;
  searchTookMs?: number;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  onRefresh,
  isRefreshing = false,
  searchEngine,
  searchTookMs,
}) => {
  return (
    <header className="h-16 border-b border-gray-100 flex items-center justify-between px-6 bg-white shrink-0">
      {/* Search Input Container */}
      <div className="flex items-center gap-3 w-full max-w-xl">
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search"
            className="w-full pl-9 pr-4 py-2 bg-[#F3F4F6] text-gray-900 placeholder-gray-400 text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition border border-transparent focus:border-gray-200"
          />
        </div>

        {/* Filter Action Icon */}
        <button
          title="Filter emails"
          className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full transition"
        >
          <Filter className="w-4 h-4" />
        </button>

        {/* Refresh Action Icon */}
        <button
          onClick={onRefresh}
          title="Refresh emails"
          className={`p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full transition ${
            isRefreshing ? 'animate-spin text-emerald-600' : ''
          }`}
        >
          <RotateCw className="w-4 h-4" />
        </button>
      </div>

      {/* Latency & Engine Indicator (Bonus assignment feature) */}
      {searchEngine && (
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono">
          <Zap className="w-3 h-3 text-emerald-600" />
          <span>
            {searchEngine === 'elasticsearch' ? 'OpenSearch' : 'PG Fallback'} ({searchTookMs || 10}ms)
          </span>
        </div>
      )}
    </header>
  );
};
