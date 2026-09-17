'use client';

import React, { useState } from 'react';
import { X, CheckCircle2, AlertCircle, ExternalLink, ShieldAlert, Send, Link2 } from 'lucide-react';
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
  const [webhookUrl, setWebhookUrl] = useState('');
  const [channelName, setChannelName] = useState('#rate-limit-alerts');
  const [loading, setLoading] = useState(false);
  const [testingAlert, setTestingAlert] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleConnectOAuth = async () => {
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

  const handleSaveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookUrl.trim().startsWith('https://hooks.slack.com/')) {
      setErrorMsg('Please enter a valid Slack webhook URL (must start with https://hooks.slack.com/)');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      await api.saveSlackWebhook(webhookUrl.trim(), channelName.trim());
      setSuccessMsg('Slack webhook configured and encrypted successfully!');
      onUpdated();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save Slack webhook');
    } finally {
      setLoading(false);
    }
  };

  const handleTestAlert = async () => {
    setTestingAlert(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      await api.testSlackAlert();
      setSuccessMsg('Test alert dispatched! Check your Slack channel.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to dispatch test alert');
    } finally {
      setTestingAlert(false);
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
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-gray-100 p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Slack Rate Limit Alerts</h3>
              <p className="text-[11px] text-gray-500">Real-time alerts on hourly quota breaches</p>
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

        {successMsg && (
          <div className="p-3 bg-emerald-50 text-emerald-700 text-xs rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Connection Status Box */}
        <div className="p-4 rounded-xl border border-gray-100 bg-gray-50/70 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium text-xs text-gray-700">Status:</span>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                user?.slackConnected
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {user?.slackConnected ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Connected</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Not Connected</span>
                </>
              )}
            </span>
          </div>

          {user?.slackConnected && user?.slackDetails && (
            <div className="pt-2 text-[11px] text-gray-600 space-y-1">
              <div>Workspace: <strong className="text-gray-800">{user.slackDetails.teamName}</strong></div>
              <div>Channel: <strong className="text-gray-800">{user.slackDetails.channel}</strong></div>
            </div>
          )}
        </div>

        {user?.slackConnected ? (
          /* Connected State: Test Alert or Disconnect */
          <div className="space-y-4 pt-1">
            <p className="text-xs text-gray-500 leading-relaxed">
              Slack alerts are active. When any sender hits their hourly limit, an alert will be dispatched to your channel. Remaining emails will be rescheduled automatically.
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={testingAlert}
                onClick={handleTestAlert}
                className="flex-1 py-2 px-4 rounded-xl border border-emerald-600 text-emerald-700 hover:bg-emerald-50 text-xs font-medium transition flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{testingAlert ? 'Dispatching...' : 'Send Test Alert to Slack'}</span>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={handleDisconnect}
                className="py-2 px-4 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 text-xs font-medium transition disabled:opacity-50"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          /* Disconnected State: Direct Webhook Form + OAuth Option */
          <div className="space-y-4">
            <form onSubmit={handleSaveWebhook} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Slack Incoming Webhook URL:
                </label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://hooks.slack.com/services/T00/B00/XXXX"
                  required
                  className="w-full py-2 px-3 text-xs border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Target Channel (Optional):
                </label>
                <input
                  type="text"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  placeholder="#rate-limit-alerts"
                  className="w-full py-2 px-3 text-xs border border-gray-200 rounded-lg text-gray-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 rounded-xl bg-[#00A854] hover:bg-[#008f47] active:scale-[0.99] text-white text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>{loading ? 'Saving & Encrypting...' : 'Save & Activate Webhook'}</span>
              </button>
            </form>

            <div className="relative flex items-center justify-center my-3">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-100" />
              </div>
              <span className="relative px-2 bg-white text-[10px] text-gray-400 uppercase font-medium">
                or use Slack OAuth
              </span>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={handleConnectOAuth}
              className="w-full py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium transition flex items-center justify-center gap-1.5"
            >
              <span>Connect via Slack OAuth 2.0</span>
              <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-gray-500 hover:text-gray-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
