'use client';

import React, { useState } from 'react';
import {
  ArrowLeft,
  Star,
  Archive,
  Trash2,
  ChevronDown,
  ExternalLink,
  Zap,
} from 'lucide-react';
import { EmailRecord, UserProfile } from '@/lib/types';
import { api } from '@/lib/api';
import { format } from 'date-fns';

interface EmailDetailModalProps {
  email: EmailRecord;
  user: UserProfile | null;
  onClose: () => void;
  onDeleted: () => void;
}

export const EmailDetailModal: React.FC<EmailDetailModalProps> = ({
  email,
  user,
  onClose,
  onDeleted,
}) => {
  const [isStarred, setIsStarred] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this email?')) return;
    setDeleting(true);
    try {
      await api.deleteEmail(email.id);
      onDeleted();
    } catch (err: any) {
      alert(err.message || 'Failed to delete email');
      setDeleting(false);
    }
  };

  const formattedDate = (() => {
    try {
      const d = email.sentAt ? new Date(email.sentAt) : new Date(email.scheduledAt);
      return format(d, 'MMM d, h:mm a');
    } catch {
      return '';
    }
  })();

  const senderInitial = (email.sender?.name || email.recipientName || 'A').charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 bg-black/25 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Top Action Bar (Figma Screen 7) */}
        <div className="h-16 px-6 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0 mr-4">
            <button
              onClick={onClose}
              className="p-1 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full transition shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-base font-semibold text-gray-900 truncate">
              {email.subject}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsStarred(!isStarred)}
              title="Star email"
              className="p-2 text-gray-400 hover:text-amber-500 hover:bg-gray-100 rounded-full transition"
            >
              <Star className={`w-4 h-4 ${isStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
            </button>

            <button
              title="Archive"
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition"
            >
              <Archive className="w-4 h-4" />
            </button>

            <button
              onClick={handleDelete}
              disabled={deleting}
              title="Delete email"
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-full transition disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <div className="w-px h-5 bg-gray-200 mx-1" />

            {/* Current user avatar on right */}
            <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 shrink-0 border border-gray-200">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-semibold text-gray-600 text-xs">
                  {user?.name?.charAt(0) || 'O'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Email Content Body */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {/* Ethereal SMTP Live Banner if sent */}
          {email.etherealUrl && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-emerald-800">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold">Delivered via Ethereal SMTP Sandbox</span>
                <span className="text-emerald-600">({email.smtpMessageId || 'RFC 5322'})</span>
              </div>
              <a
                href={email.etherealUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white rounded-full text-xs font-medium hover:bg-emerald-700 transition"
              >
                <span>View Raw SMTP Message</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Email Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {/* Green Circle Initial Avatar */}
              <div className="w-10 h-10 rounded-full bg-[#00A854] text-white flex items-center justify-center font-bold text-sm shrink-0">
                {senderInitial}
              </div>

              <div>
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-gray-900 text-sm">
                    {email.sender?.name || 'Amanda Clark'}
                  </span>
                  <span className="text-xs text-gray-500">
                    &lt;{email.sender?.email || 'sender@example.com'}&gt;
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                  <span>to me</span>
                  <ChevronDown className="w-3 h-3" />
                </div>
              </div>
            </div>

            <div className="text-xs text-gray-400 font-medium">
              {formattedDate || 'Nov 3, 10:23 AM'}
            </div>
          </div>

          {/* Email Body Content */}
          <div className="space-y-4 text-sm text-gray-800 leading-relaxed font-sans pt-2">
            <p>Hey {user?.name?.split(' ')[0] || 'Oliver'},</p>
            <p>You&apos;ve just RECEIVED something</p>

            {/* Highlighted Yellow Callout Box (Figma Screen 7) */}
            <div className="p-4 bg-[#FFFBEB] border-l-4 border-amber-400 rounded-r-xl space-y-1 my-4">
              <div className="font-bold text-gray-900 flex items-center gap-1">
                <span>⚡</span>
                <span>Extremely Exclusive—Only 4 Spots Worldwide Per Year | $25,000 investment</span>
                <span>⚡</span>
              </div>
              <div className="text-gray-700 text-xs flex items-center gap-1">
                <span>⚡</span>
                <span>
                  To explore securing your private transformation, simply reply right now with{' '}
                  <strong className="text-black">&quot;FLY OUT FIX&quot;</strong>.
                </span>
              </div>
            </div>

            <div className="whitespace-pre-wrap">{email.bodyText}</div>

            <div className="pt-2 text-gray-700">
              <p>Your coach for world-class performance,</p>
              <p className="font-semibold text-gray-900 mt-1">Grant</p>
              <p className="italic text-xs text-gray-500 mt-2">
                P.S. Always remember that you can develop world class technique! 🚀
              </p>
            </div>
          </div>

          {/* Attachments Section (Figma Screen 7) */}
          <div className="pt-6 border-t border-gray-100">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {/* Attachment 1 */}
              <div className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition">
                <div className="h-28 bg-gray-100 overflow-hidden">
                  <img
                    src="https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=400&auto=format&fit=crop&q=80"
                    alt="Tennis Coach Profile"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-2.5 bg-white">
                  <div className="text-xs font-semibold text-gray-800 truncate">
                    Tennis_Coach_Profile.png
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">1.2 MB</div>
                </div>
              </div>

              {/* Attachment 2 */}
              <div className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition">
                <div className="h-28 bg-gray-100 overflow-hidden">
                  <img
                    src="https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=400&auto=format&fit=crop&q=80"
                    alt="Tennis Coach Profile 2"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-2.5 bg-white">
                  <div className="text-xs font-semibold text-gray-800 truncate">
                    Tennis_Coach_Profile2.png
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">1.2 MB</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
