'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { EmailList } from '@/components/emails/EmailList';
import { ComposeModal } from '@/components/emails/ComposeModal';
import { EmailDetailModal } from '@/components/emails/EmailDetailModal';
import { SlackModal } from '@/components/slack/SlackModal';
import { api } from '@/lib/api';
import { EmailRecord, SenderIdentity, UserProfile } from '@/lib/types';

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [senders, setSenders] = useState<SenderIdentity[]>([]);

  // Navigation tab state
  const [currentTab, setCurrentTab] = useState<'scheduled' | 'sent'>('scheduled');

  // Email data states
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Counts for sidebar badges
  const [scheduledCount, setScheduledCount] = useState(0);
  const [sentCount, setSentCount] = useState(0);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchEngine, setSearchEngine] = useState<string | undefined>(undefined);
  const [searchTookMs, setSearchTookMs] = useState<number | undefined>(undefined);

  // Modals state
  const [showCompose, setShowCompose] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailRecord | null>(null);
  const [showSlackModal, setShowSlackModal] = useState(false);

  // Hydrate user and senders
  const loadUserAndSenders = useCallback(async () => {
    try {
      const meRes = await api.getMe();
      setUser(meRes.user);

      const sendersRes = await api.getSenders();
      setSenders(sendersRes.senders);
    } catch {
      // If unauthenticated, auto-login to default demo user Oliver Brown
      try {
        const devLoginRes = await api.devLogin('oliver.brown@domain.io', 'Oliver Brown');
        setUser(devLoginRes.user);
        const sendersRes = await api.getSenders();
        setSenders(sendersRes.senders);
      } catch (e) {
        console.error('Failed to initialize session:', e);
        router.push('/login');
      }
    }
  }, [router]);

  // Fetch emails based on tab and search
  const loadEmails = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        if (searchQuery.trim().length > 0) {
          // Use Elasticsearch/OpenSearch Full-Text Search with PG fallback
          const statusFilter = currentTab === 'scheduled' ? 'SCHEDULED' : 'SENT';
          const searchRes = await api.searchEmails({
            query: searchQuery,
            status: statusFilter,
            page: 1,
            limit: 50,
          });

          setEmails(searchRes.items);
          setSearchEngine(searchRes.engine);
          setSearchTookMs(searchRes.tookMs);
        } else {
          setSearchEngine(undefined);
          setSearchTookMs(undefined);

          if (currentTab === 'scheduled') {
            const scheduledRes = await api.getScheduledEmails({ page: 1, limit: 50 });
            setEmails(scheduledRes.items);
            setScheduledCount(scheduledRes.total);

            // Also silently update sent count
            api.getSentEmails({ page: 1, limit: 1 }).then((r) => setSentCount(r.total));
          } else {
            const sentRes = await api.getSentEmails({ page: 1, limit: 50 });
            setEmails(sentRes.items);
            setSentCount(sentRes.total);

            // Also silently update scheduled count
            api.getScheduledEmails({ page: 1, limit: 1 }).then((r) => setScheduledCount(r.total));
          }
        }
      } catch (err) {
        console.error('Failed to load emails:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [currentTab, searchQuery]
  );

  // Initial load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');
      if (urlToken) {
        localStorage.setItem('reachinbox_token', urlToken);
        const cleanUrl = window.location.pathname + (window.location.hash || '');
        window.history.replaceState({}, document.title, cleanUrl);
      }
    }
    loadUserAndSenders();
  }, [loadUserAndSenders]);

  // Load emails when tab or search changes
  useEffect(() => {
    const timer = setTimeout(() => {
      loadEmails();
    }, 250); // 250ms debounce for search

    return () => clearTimeout(timer);
  }, [loadEmails]);

  // Handle URL tab sync
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'sent') setCurrentTab('sent');
    else if (tabParam === 'scheduled') setCurrentTab('scheduled');
  }, [searchParams]);

  const handleTabChange = (tab: 'scheduled' | 'sent') => {
    setCurrentTab(tab);
    setSearchQuery('');
  };

  const handleLogout = async () => {
    await api.logout();
    router.push('/login');
  };

  return (
    <div className="flex h-screen bg-white text-gray-900 overflow-hidden font-sans">
      {/* Left Sidebar (Figma Screen 2 & 3) */}
      <Sidebar
        user={user}
        currentTab={currentTab}
        scheduledCount={scheduledCount}
        sentCount={sentCount}
        onTabChange={handleTabChange}
        onOpenCompose={() => setShowCompose(true)}
        onOpenSlackModal={() => setShowSlackModal(true)}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Header Bar */}
        <Header
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onRefresh={() => loadEmails(true)}
          isRefreshing={refreshing}
          searchEngine={searchEngine}
          searchTookMs={searchTookMs}
        />

        {/* Email Table Content */}
        <main className="flex-1 overflow-y-auto">
          <EmailList
            emails={emails}
            type={currentTab}
            loading={loading}
            onSelectEmail={(email) => setSelectedEmail(email)}
          />
        </main>
      </div>

      {/* Compose Modal (Figma Screens 4, 5, 6) */}
      {showCompose && (
        <ComposeModal
          senders={senders}
          onClose={() => setShowCompose(false)}
          onSuccess={() => {
            setShowCompose(false);
            loadEmails();
          }}
        />
      )}

      {/* Email Detail / Thread Modal (Figma Screen 7) */}
      {selectedEmail && (
        <EmailDetailModal
          email={selectedEmail}
          user={user}
          onClose={() => setSelectedEmail(null)}
          onDeleted={() => {
            setSelectedEmail(null);
            loadEmails();
          }}
        />
      )}

      {/* Slack Rate Limit Alerts Modal */}
      {showSlackModal && (
        <SlackModal
          user={user}
          onClose={() => setShowSlackModal(false)}
          onUpdated={loadUserAndSenders}
        />
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-gray-400">Loading ReachInbox...</div>}>
      <HomePageContent />
    </Suspense>
  );
}
