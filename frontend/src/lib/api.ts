import {
  UserProfile,
  SenderIdentity,
  EmailRecord,
  PaginatedResponse,
  ScheduleEmailPayload,
} from './types';

const API_BASE = '/api';

async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}: Failed request`);
  }

  return data as T;
}

export const api = {
  // Auth
  async getMe(): Promise<{ user: UserProfile }> {
    return fetchJson<{ user: UserProfile }>(`${API_BASE}/auth/me`);
  },

  async devLogin(email: string, name: string): Promise<{ success: boolean; token: string; user: UserProfile }> {
    return fetchJson<{ success: boolean; token: string; user: UserProfile }>(`${API_BASE}/auth/dev-login`, {
      method: 'POST',
      body: JSON.stringify({ email, name }),
    });
  },

  async logout(): Promise<{ success: boolean }> {
    return fetchJson<{ success: boolean }>(`${API_BASE}/auth/logout`, {
      method: 'POST',
    });
  },

  async getGoogleAuthUrl(): Promise<{ authUrl: string }> {
    return fetchJson<{ authUrl: string }>(`${API_BASE}/auth/google/url`);
  },

  // Senders
  async getSenders(): Promise<{ senders: SenderIdentity[] }> {
    return fetchJson<{ senders: SenderIdentity[] }>(`${API_BASE}/senders`);
  },

  // Emails
  async getScheduledEmails(params?: { page?: number; limit?: number; search?: string }): Promise<PaginatedResponse<EmailRecord>> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.search) query.set('search', params.search);

    const qs = query.toString() ? `?${query.toString()}` : '';
    return fetchJson<PaginatedResponse<EmailRecord>>(`${API_BASE}/emails/scheduled${qs}`);
  },

  async getSentEmails(params?: { page?: number; limit?: number; search?: string }): Promise<PaginatedResponse<EmailRecord>> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.search) query.set('search', params.search);

    const qs = query.toString() ? `?${query.toString()}` : '';
    return fetchJson<PaginatedResponse<EmailRecord>>(`${API_BASE}/emails/sent${qs}`);
  },

  async searchEmails(params: { query: string; status?: string; page?: number; limit?: number }): Promise<PaginatedResponse<EmailRecord>> {
    const query = new URLSearchParams();
    if (params.query) query.set('q', params.query);
    if (params.status) query.set('status', params.status);
    if (params.page) query.set('page', params.page.toString());
    if (params.limit) query.set('limit', params.limit.toString());

    return fetchJson<PaginatedResponse<EmailRecord>>(`${API_BASE}/emails/search?${query.toString()}`);
  },

  async getEmailById(id: string): Promise<EmailRecord> {
    return fetchJson<EmailRecord>(`${API_BASE}/emails/${id}`);
  },

  async deleteEmail(id: string): Promise<{ success: boolean; message: string }> {
    return fetchJson<{ success: boolean; message: string }>(`${API_BASE}/emails/${id}`, {
      method: 'DELETE',
    });
  },

  async scheduleBatch(payload: ScheduleEmailPayload): Promise<{
    campaignId: string;
    totalScheduled: number;
    scheduledAt: string;
  }> {
    return fetchJson(`${API_BASE}/emails/schedule`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Slack
  async getSlackInstallUrl(): Promise<{ authUrl: string }> {
    return fetchJson<{ authUrl: string }>(`${API_BASE}/slack/install`);
  },

  async saveSlackWebhook(webhookUrl: string, channelName?: string): Promise<{ success: boolean; message: string }> {
    return fetchJson<{ success: boolean; message: string }>(`${API_BASE}/slack/webhook`, {
      method: 'POST',
      body: JSON.stringify({ webhookUrl, channelName }),
    });
  },

  async testSlackAlert(): Promise<{ success: boolean; message: string }> {
    return fetchJson<{ success: boolean; message: string }>(`${API_BASE}/slack/test-alert`, {
      method: 'POST',
    });
  },

  async disconnectSlack(): Promise<{ success: boolean; message: string }> {
    return fetchJson<{ success: boolean; message: string }>(`${API_BASE}/slack/disconnect`, {
      method: 'DELETE',
    });
  },
};
