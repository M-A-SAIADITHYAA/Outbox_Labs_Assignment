'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  Clock,
  Send,
  ChevronDown,
  LogOut,
  Bell,
  Activity,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { UserProfile } from '@/lib/types';

interface SidebarProps {
  user: UserProfile | null;
  currentTab: 'scheduled' | 'sent';
  scheduledCount: number;
  sentCount: number;
  onTabChange: (tab: 'scheduled' | 'sent') => void;
  onOpenCompose: () => void;
  onOpenSlackModal: () => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  currentTab,
  scheduledCount,
  sentCount,
  onTabChange,
  onOpenCompose,
  onOpenSlackModal,
  onLogout,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <aside className="w-64 border-r border-gray-100 flex flex-col justify-between h-screen p-5 bg-white select-none shrink-0">
      {/* Top Section */}
      <div className="space-y-6">
        {/* Brand Logo */}
        <div className="flex items-center gap-2">
          <div className="font-extrabold text-2xl tracking-tighter text-black flex items-center gap-1 font-mono">
            <span>ON8</span>
          </div>
        </div>

        {/* User Profile Card */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full flex items-center justify-between p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition"
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-200 shrink-0 relative">
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-semibold text-gray-700 bg-emerald-100 text-sm">
                    {user?.name?.charAt(0) || 'O'}
                  </div>
                )}
              </div>
              <div className="text-left truncate">
                <div className="text-sm font-semibold text-gray-900 truncate">
                  {user?.name || 'Oliver Brown'}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {user?.email || 'oliver.brown@domain.io'}
                </div>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 ml-1" />
          </button>

          {/* User Menu Dropdown */}
          {dropdownOpen && (
            <div className="absolute top-full left-0 mt-2 w-full bg-white border border-gray-100 rounded-xl shadow-lg p-2 z-50 space-y-1">
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  onOpenSlackModal();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
              >
                <Bell className="w-3.5 h-3.5 text-gray-500" />
                <span>Slack Rate Limit Alerts</span>
              </button>
              <a
                href="/admin/queues"
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
              >
                <Activity className="w-3.5 h-3.5 text-gray-500" />
                <span>Bull-Board Monitor</span>
              </a>
              <div className="h-px bg-gray-100 my-1" />
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>

        {/* Compose Button */}
        <button
          onClick={onOpenCompose}
          className="w-full py-2.5 px-4 rounded-full border border-[#00A854] text-[#00A854] font-medium text-sm hover:bg-[#E6F7EF] active:scale-[0.99] transition shadow-sm"
        >
          Compose
        </button>

        {/* Navigation Core */}
        <div className="space-y-1.5 pt-2">
          <div className="text-[11px] font-semibold tracking-wider text-gray-400 uppercase px-3 pb-1">
            CORE
          </div>

          {/* Scheduled Nav Item */}
          <button
            onClick={() => onTabChange('scheduled')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-full text-sm transition ${
              currentTab === 'scheduled'
                ? 'bg-[#E6F7EF] text-[#008744] font-semibold'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 font-normal'
            }`}
          >
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4" />
              <span>Scheduled</span>
            </div>
            <span
              className={`text-xs ${
                currentTab === 'scheduled' ? 'text-[#008744] font-semibold' : 'text-gray-400'
              }`}
            >
              {scheduledCount}
            </span>
          </button>

          {/* Sent Nav Item */}
          <button
            onClick={() => onTabChange('sent')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-full text-sm transition ${
              currentTab === 'sent'
                ? 'bg-[#E6F7EF] text-[#008744] font-semibold'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 font-normal'
            }`}
          >
            <div className="flex items-center gap-3">
              <Send className="w-4 h-4" />
              <span>Sent</span>
            </div>
            <span
              className={`text-xs ${
                currentTab === 'sent' ? 'text-[#008744] font-semibold' : 'text-gray-400'
              }`}
            >
              {sentCount}
            </span>
          </button>
        </div>
      </div>

      {/* Bottom Status / Slack Footer */}
      <div className="pt-4 border-t border-gray-100 space-y-2">
        <button
          onClick={onOpenSlackModal}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs bg-gray-50 hover:bg-gray-100 transition border border-gray-100"
        >
          <div className="flex items-center gap-2">
            {user?.slackConnected ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
            )}
            <span className="font-medium text-gray-700">Slack Alerts</span>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              user?.slackConnected
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            {user?.slackConnected ? 'Connected' : 'Setup'}
          </span>
        </button>

        <a
          href="/admin/queues"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-800 transition"
        >
          <Activity className="w-3 h-3 text-emerald-600" />
          <span>BullMQ Dashboard</span>
        </a>
      </div>
    </aside>
  );
};
