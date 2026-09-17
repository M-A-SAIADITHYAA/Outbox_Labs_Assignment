export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  slackConnected: boolean;
  slackDetails?: {
    channel: string;
    teamName: string;
  } | null;
}

export interface SenderIdentity {
  id: string;
  userId: string;
  name: string;
  email: string;
  provider: string;
  isDefault: boolean;
}

export interface EmailRecord {
  id: string;
  userId: string;
  senderId: string;
  campaignId?: string | null;
  recipientEmail: string;
  recipientName?: string | null;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  status: 'SCHEDULED' | 'QUEUED' | 'SENT' | 'FAILED' | 'CANCELLED';
  scheduledAt: string;
  sentAt?: string | null;
  etherealUrl?: string | null;
  smtpMessageId?: string | null;
  sender?: {
    id?: string;
    name: string;
    email: string;
  };
  campaign?: {
    id: string;
    title: string;
  } | null;
  createdAt?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  tookMs?: number;
  engine?: string;
}

export interface ScheduleEmailPayload {
  senderId?: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  recipients: {
    email: string;
    name?: string;
  }[];
  scheduledAt: string;
  hourlyLimit?: number;
  delaySeconds?: number;
}
