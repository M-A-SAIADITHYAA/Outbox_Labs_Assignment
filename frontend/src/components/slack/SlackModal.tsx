'use client';

import React, { useState } from 'react';
import { X, CheckCircle2, AlertCircle, ExternalLink, ShieldAlert } from 'lucide-react';
import { UserProfile } from '@/lib/types';
import { api } from '@/lib/api';

interface SlackModalProps {
  user: UserProfile | null;
  onClose: () => void;
  onUpdated: () => void;
}

export const SlackModal: React.FC<SlackModalProps> = ({
  user,
  onClose,
  onUpdated,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleConnect = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const { authUrl } = await api.getSlackInstallUrl();
      window.location.href = authUrl;
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to initiate Slack OAuth flow');
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Slack rate-limit alerts?')) return;
    setLoading(true);
    setErrorMsg('');
    try {
      await api.disconnectSlack();
      onUpdated();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to disconnect Slack');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/25 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-gray-100 p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Slack Rate Limit Alerts</h3>
              <p className="text-[11px] text-gray-500">Live webhook notifications for hourly sender limits</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-700 rounded-full transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="space-y-4 text-xs text-gray-600">
          <p>
            When any sender identity exceeds its configured hourly rate limit (e.g., 200 emails/hour),
            the atomic Redis engine intercepts the spike, reschedules remaining emails to the top of the
            next hour, and dispatches a rich alert to your Slack channel.
          </p>

          <div className="p-4 rounded-xl border border-gray-100 bg-gray-50/70 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-700">Connection Status:</span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold ${
                  user?.slackConnected
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {user?.slackConnected ? (
                  <>
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Connected</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3" />
                    <span>Not Connected</span>
                  </>
                )}
              </span>
            </div>

            {user?.slackDetails && (
              <div className="pt-2 text-[11px] text-gray-500 space-y-1">
                <div>Workspace: <strong className="text-gray-700">{user.slackDetails.teamName}</strong></div>
                <div>Target Channel: <strong className="text-gray-700">{user.slackDetails.channel}</strong></div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full text-xs font-medium text-gray-600 hover:bg-gray-100 transition"
          >
            Close
          </button>

          {user?.slackConnected ? (
            <button
              type="button"
              disabled={loading}
              onClick={handleDisconnect}
              className="px-4 py-2 rounded-full text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition disabled:opacity-50"
            >
              Disconnect Slack
            </button>
          ) : (
            <button
              type="button"
              disabled={loading}
              onClick={handleConnect}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-medium bg-[#00A854] hover:bg-[#008f47] text-white transition shadow-sm active:scale-95 disabled:opacity-50"
            >
              <span>Connect with Slack</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
