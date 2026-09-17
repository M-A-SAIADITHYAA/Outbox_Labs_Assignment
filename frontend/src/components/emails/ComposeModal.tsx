'use client';

import React, { useState, useRef } from 'react';
import {
  ArrowLeft,
  Paperclip,
  Clock,
  Calendar as CalendarIcon,
  Upload,
  X,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  List,
  ListOrdered,
  Indent,
  Outdent,
  Quote,
  Link as LinkIcon,
  Strikethrough,
  Undo,
  Redo,
  ChevronDown,
} from 'lucide-react';
import { SenderIdentity } from '@/lib/types';
import { api } from '@/lib/api';
import { format, addDays, setHours, setMinutes, setSeconds } from 'date-fns';

interface ComposeModalProps {
  senders: SenderIdentity[];
  onClose: () => void;
  onSuccess: () => void;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({
  senders,
  onClose,
  onSuccess,
}) => {
  const [selectedSenderId, setSelectedSenderId] = useState(
    senders.find((s) => s.isDefault)?.id || senders[0]?.id || ''
  );
  const [senderDropdownOpen, setSenderDropdownOpen] = useState(false);

  React.useEffect(() => {
    if (!selectedSenderId && senders.length > 0) {
      setSelectedSenderId(senders.find((s) => s.isDefault)?.id || senders[0]?.id || '');
    }
  }, [senders, selectedSenderId]);

  // Recipients
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState('');

  // Form fields
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [delaySeconds, setDelaySeconds] = useState(2);
  const [hourlyLimit, setHourlyLimit] = useState(200);

  // Send Later Popover state
  const [showSendLater, setShowSendLater] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [customDateTime, setCustomDateTime] = useState('');

  // Attachments
  const [hasAttachment, setHasAttachment] = useState(true); // default demo asset matching Figma
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add recipient chip
  const addRecipient = (emailVal: string) => {
    const clean = emailVal.trim().toLowerCase().replace(/[,;]/g, '');
    if (clean && !recipients.includes(clean)) {
      setRecipients([...recipients, clean]);
    }
  };

  const handleRecipientKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      e.preventDefault();
      if (recipientInput) {
        addRecipient(recipientInput);
        setRecipientInput('');
      }
    }
  };

  const removeRecipient = (indexToRemove: number) => {
    setRecipients(recipients.filter((_, idx) => idx !== indexToRemove));
  };

  // Upload List (CSV parser)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      // Extract all valid emails from file content
      const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
      const matches = content.match(emailRegex) || [];
      const newRecipients = Array.from(new Set([...recipients, ...matches.map((m) => m.toLowerCase())]));

      setRecipients(newRecipients);
    };
    reader.readAsText(file);
  };

  // Preset Date Handlers
  const handlePresetSelect = (preset: 'tomorrow' | 'tomorrow10' | 'tomorrow11' | 'tomorrow15') => {
    const tomorrow = addDays(new Date(), 1);
    let target = tomorrow;

    switch (preset) {
      case 'tomorrow':
        target = setHours(setMinutes(setSeconds(tomorrow, 0), 0), 9);
        break;
      case 'tomorrow10':
        target = setHours(setMinutes(setSeconds(tomorrow, 0), 0), 10);
        break;
      case 'tomorrow11':
        target = setHours(setMinutes(setSeconds(tomorrow, 0), 0), 11);
        break;
      case 'tomorrow15':
        target = setHours(setMinutes(setSeconds(tomorrow, 0), 0), 15);
        break;
    }

    setScheduledAt(target);
    setShowSendLater(false);
  };

  // Submit Handler
  const handleSubmit = async () => {
    // If user typed an email in input without hitting Enter, add it
    const allRecipients = [...recipients];
    if (recipientInput.trim()) {
      allRecipients.push(recipientInput.trim().toLowerCase());
    }

    if (allRecipients.length === 0) {
      setErrorMsg('Please specify at least one recipient email.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmail = allRecipients.find((e) => !emailRegex.test(e));
    if (invalidEmail) {
      setErrorMsg(`Invalid recipient email format: "${invalidEmail}". Check for missing dots or typos (e.g. .com).`);
      return;
    }

    if (!subject.trim()) {
      setErrorMsg('Please enter a subject.');
      return;
    }

    if (!bodyText.trim()) {
      setErrorMsg('Please enter an email body.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const sendTime = scheduledAt || new Date(Date.now() + 1000); // Now or scheduled

      await api.scheduleBatch({
        senderId: selectedSenderId || undefined,
        subject,
        bodyText,
        recipients: allRecipients.map((email) => ({ email })),
        scheduledAt: sendTime.toISOString(),
        delaySeconds: Number(delaySeconds),
        hourlyLimit: Number(hourlyLimit),
      });

      onSuccess();
    } catch (err: any) {
      console.error('Schedule batch failed:', err);
      setErrorMsg(err.message || 'Failed to schedule emails');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedSender = senders.find((s) => s.id === selectedSenderId) || senders[0];

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Top Header Bar */}
        <div className="h-16 px-6 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-base font-semibold text-gray-900">Compose New Email</h2>
          </div>

          <div className="flex items-center gap-3 relative">
            {/* Attachment paperclip with count badge */}
            <button
              onClick={() => setHasAttachment(!hasAttachment)}
              title="Toggle attachment"
              className="relative p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full transition flex items-center"
            >
              <Paperclip className="w-4 h-4 text-emerald-600" />
              {hasAttachment && (
                <span className="text-[10px] font-bold text-emerald-600 ml-0.5">1</span>
              )}
            </button>

            {/* Clock button for Send Later popover */}
            <button
              onClick={() => setShowSendLater(!showSendLater)}
              title="Schedule Send Later"
              className={`p-2 rounded-full transition ${
                scheduledAt
                  ? 'text-emerald-600 bg-emerald-50'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              <Clock className="w-4 h-4" />
            </button>

            {/* Send / Send Later Action Button */}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-5 py-2 rounded-full border border-[#00A854] text-[#00A854] hover:bg-[#E6F7EF] font-medium text-sm transition active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            >
              {submitting ? 'Scheduling...' : scheduledAt ? 'Send Later' : 'Send'}
            </button>

            {/* Send Later Popover (Figma Screen 4) */}
            {showSendLater && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 z-50 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Send Later</h3>
                  {scheduledAt && (
                    <button
                      onClick={() => setScheduledAt(null)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Date Time Input */}
                <div className="relative">
                  <input
                    type="datetime-local"
                    value={customDateTime}
                    onChange={(e) => {
                      setCustomDateTime(e.target.value);
                      if (e.target.value) {
                        setScheduledAt(new Date(e.target.value));
                      }
                    }}
                    className="w-full text-xs py-2 px-3 border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Presets */}
                <div className="space-y-1 pt-1">
                  <button
                    onClick={() => handlePresetSelect('tomorrow')}
                    className="w-full text-left px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 rounded-md transition"
                  >
                    Tomorrow
                  </button>
                  <button
                    onClick={() => handlePresetSelect('tomorrow10')}
                    className="w-full text-left px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 rounded-md transition"
                  >
                    Tomorrow, 10:00 AM
                  </button>
                  <button
                    onClick={() => handlePresetSelect('tomorrow11')}
                    className="w-full text-left px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 rounded-md transition"
                  >
                    Tomorrow, 11:00 AM
                  </button>
                  <button
                    onClick={() => handlePresetSelect('tomorrow15')}
                    className="w-full text-left px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 rounded-md transition"
                  >
                    Tomorrow, 3:00 PM
                  </button>
                </div>

                {/* Popover Buttons */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                  <button
                    onClick={() => setShowSendLater(false)}
                    className="px-3 py-1 text-xs text-gray-500 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setShowSendLater(false)}
                    className="px-4 py-1.5 text-xs rounded-full border border-[#00A854] text-[#00A854] hover:bg-[#E6F7EF] font-medium"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Error Alert if any */}
        {errorMsg && (
          <div className="px-6 py-2 bg-red-50 text-red-700 text-xs flex items-center justify-between">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg('')}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Form Body Fields */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* From Field with Identity Picker */}
          <div className="flex items-center gap-4 text-sm">
            <span className="w-12 text-gray-500 text-right shrink-0">From</span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setSenderDropdownOpen(!senderDropdownOpen)}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-medium transition"
              >
                <span>{selectedSender?.email || 'oliver.brown@domain.io'}</span>
                <ChevronDown className="w-3 h-3 text-gray-500" />
              </button>

              {senderDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-1 z-20 w-64">
                  {senders.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSelectedSenderId(s.id);
                        setSenderDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 rounded"
                    >
                      <div className="font-medium">{s.name}</div>
                      <div className="text-gray-400">{s.email}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* To Field with Lead Chips & Upload List Action (Figma Screen 5 & 6) */}
          <div className="flex items-start gap-4 text-sm pt-1">
            <span className="w-12 text-gray-500 text-right pt-2 shrink-0">To</span>
            <div className="flex-1 border-b border-gray-100 pb-2">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex flex-wrap items-center gap-1.5 flex-1">
                  {/* Recipient Chips */}
                  {recipients.slice(0, 3).map((email, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border border-emerald-500 text-emerald-700 bg-white shadow-xs"
                    >
                      <span>{email}</span>
                      <button
                        type="button"
                        onClick={() => removeRecipient(idx)}
                        className="hover:text-red-500 ml-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}

                  {/* Overflow Chip (+N) */}
                  {recipients.length > 3 && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium border border-emerald-500 text-emerald-700 bg-white">
                      +{recipients.length - 3}
                    </span>
                  )}

                  {/* Input to type new email */}
                  <input
                    type="email"
                    value={recipientInput}
                    onChange={(e) => setRecipientInput(e.target.value)}
                    onKeyDown={handleRecipientKeyDown}
                    placeholder={recipients.length === 0 ? 'recipient@example.com' : 'Add another...'}
                    className="flex-1 min-w-[160px] py-1 text-sm focus:outline-none text-gray-800 placeholder-gray-400"
                  />
                </div>

                {/* Upload List Action */}
                <div className="shrink-0 ml-3">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".csv,.txt"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium hover:underline"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload List</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Subject Field */}
          <div className="flex items-center gap-4 text-sm">
            <span className="w-12 text-gray-500 text-right shrink-0">Subject</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="w-full border-b border-gray-100 pb-2 text-sm focus:outline-none text-gray-800 placeholder-gray-400"
            />
          </div>

          {/* Atomic Rate Limiting Config Controls */}
          <div className="flex items-center gap-6 text-xs text-gray-600 pl-16 py-1">
            <div className="flex items-center gap-2">
              <span>Delay between 2 emails</span>
              <input
                type="number"
                min="0"
                max="3600"
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(Number(e.target.value))}
                className="w-14 px-2 py-1 border border-gray-200 rounded-md text-center font-mono text-gray-800 focus:outline-none focus:border-emerald-500"
              />
              <span className="text-gray-400">sec</span>
            </div>

            <div className="flex items-center gap-2">
              <span>Hourly Limit</span>
              <input
                type="number"
                min="1"
                max="10000"
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(Number(e.target.value))}
                className="w-16 px-2 py-1 border border-gray-200 rounded-md text-center font-mono text-gray-800 focus:outline-none focus:border-emerald-500"
              />
              <span className="text-gray-400">/ hr</span>
            </div>
          </div>

          {/* Rich Text Editor Toolbar (Figma Screen 4) */}
          <div className="pt-2">
            <div className="border border-gray-200 rounded-xl overflow-hidden focus-within:border-emerald-500 transition">
              {/* Toolbar */}
              <div className="flex items-center gap-1 px-3 py-2 bg-gray-50/70 border-b border-gray-200 text-gray-600 text-xs overflow-x-auto">
                <button type="button" className="p-1 hover:text-gray-900 rounded">
                  <Undo className="w-3.5 h-3.5" />
                </button>
                <button type="button" className="p-1 hover:text-gray-900 rounded">
                  <Redo className="w-3.5 h-3.5" />
                </button>
                <div className="w-px h-3.5 bg-gray-200 mx-1" />
                <button type="button" className="p-1 hover:text-gray-900 rounded font-bold">
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button type="button" className="p-1 hover:text-gray-900 rounded italic">
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button type="button" className="p-1 hover:text-gray-900 rounded underline">
                  <Underline className="w-3.5 h-3.5" />
                </button>
                <button type="button" className="p-1 hover:text-gray-900 rounded line-through">
                  <Strikethrough className="w-3.5 h-3.5" />
                </button>
                <div className="w-px h-3.5 bg-gray-200 mx-1" />
                <button type="button" className="p-1 hover:text-gray-900 rounded">
                  <AlignCenter className="w-3.5 h-3.5" />
                </button>
                <button type="button" className="p-1 hover:text-gray-900 rounded">
                  <ListOrdered className="w-3.5 h-3.5" />
                </button>
                <button type="button" className="p-1 hover:text-gray-900 rounded">
                  <List className="w-3.5 h-3.5" />
                </button>
                <button type="button" className="p-1 hover:text-gray-900 rounded">
                  <Outdent className="w-3.5 h-3.5" />
                </button>
                <button type="button" className="p-1 hover:text-gray-900 rounded">
                  <Indent className="w-3.5 h-3.5" />
                </button>
                <button type="button" className="p-1 hover:text-gray-900 rounded">
                  <Quote className="w-3.5 h-3.5" />
                </button>
                <button type="button" className="p-1 hover:text-gray-900 rounded">
                  <LinkIcon className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Text Area */}
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="Type Your Reply..."
                rows={10}
                className="w-full p-4 text-sm text-gray-800 placeholder-gray-400 focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Attachment Preview (Figma Screen 5 & 6) */}
          {hasAttachment && (
            <div className="pt-2">
              <div className="relative inline-block w-36 h-24 rounded-lg overflow-hidden border border-gray-200 shadow-xs group">
                <img
                  src="https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=300&auto=format&fit=crop&q=80"
                  alt="Tennis Coach"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => setHasAttachment(false)}
                  className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-black/80 text-white rounded-full transition"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="text-[11px] text-gray-500 mt-1 font-medium">
                Tennis_Coach_Profile.png (1.2 MB)
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
