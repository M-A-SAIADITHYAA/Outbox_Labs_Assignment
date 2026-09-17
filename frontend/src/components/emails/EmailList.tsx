'use client';

import React, { useState } from 'react';
import { Clock, Star, ExternalLink, Mail } from 'lucide-react';
import { EmailRecord } from '@/lib/types';
import { format, isToday, isTomorrow } from 'date-fns';

interface EmailListProps {
  emails: EmailRecord[];
  type: 'scheduled' | 'sent';
  loading: boolean;
  onSelectEmail: (email: EmailRecord) => void;
}

export const EmailList: React.FC<EmailListProps> = ({
  emails,
  type,
  loading,
  onSelectEmail,
}) => {
  const [starredMap, setStarredMap] = useState<Record<string, boolean>>({});

  const toggleStar = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setStarredMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const formatScheduleBadge = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const timePart = format(d, 'h:mm:ss a');
      const dayPart = format(d, 'EEE');
      return `${dayPart} ${timePart}`;
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center text-gray-400 space-y-3">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-medium">Loading emails...</span>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="p-16 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mb-3">
          <Mail className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-gray-700">No {type} emails found</h3>
        <p className="text-xs text-gray-500 mt-1 max-w-sm">
          {type === 'scheduled'
            ? 'Click "Compose" to schedule outgoing outbound emails with atomic rate limiting.'
            : 'No delivered emails yet. Dispatched emails will appear here once processed by the worker cluster.'}
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {emails.map((email) => {
        const isStarred = Boolean(starredMap[email.id]);

        return (
          <div
            key={email.id}
            onClick={() => onSelectEmail(email)}
            className="group flex items-center justify-between px-6 py-3.5 hover:bg-gray-50/80 cursor-pointer transition select-none"
          >
            {/* Left Content Area */}
            <div className="flex items-center gap-4 min-w-0 flex-1 mr-4">
              {/* Recipient Column */}
              <div className="w-40 shrink-0 text-sm font-medium text-gray-800 truncate">
                To: {email.recipientName || email.recipientEmail}
              </div>

              {/* Status Badge */}
              <div className="shrink-0">
                {type === 'scheduled' || email.status === 'SCHEDULED' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#FFF3E8] text-[#D97706]">
                    <Clock className="w-3 h-3" />
                    <span>{formatScheduleBadge(email.scheduledAt)}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F3F4F6] text-gray-600">
                    Sent
                  </span>
                )}
              </div>

              {/* Subject & Snippet Preview */}
              <div className="flex items-baseline gap-1 text-sm truncate min-w-0 flex-1">
                <span className="font-semibold text-gray-900 shrink-0">
                  {email.subject}
                </span>
                <span className="text-gray-400 font-normal truncate">
                  - {email.bodyText.replace(/\n+/g, ' ')}
                </span>
              </div>
            </div>

            {/* Right Actions Area */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Ethereal Preview link if present */}
              {email.etherealUrl && (
                <a
                  href={email.etherealUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title="Open live Ethereal SMTP message preview"
                  className="hidden group-hover:flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full transition"
                >
                  <span>Preview</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}

              {/* Star toggle icon */}
              <button
                onClick={(e) => toggleStar(e, email.id)}
                className="p-1 text-gray-300 hover:text-amber-400 transition"
              >
                <Star
                  className={`w-4 h-4 ${
                    isStarred ? 'fill-amber-400 text-amber-400' : 'text-gray-300'
                  }`}
                />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
