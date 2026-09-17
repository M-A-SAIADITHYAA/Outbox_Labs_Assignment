import nodemailer from 'nodemailer';
import { env } from './env';

let transporter: nodemailer.Transporter | null = null;
let etherealAccount: nodemailer.TestAccount | null = null;

export async function getSmtpTransporter(): Promise<nodemailer.Transporter> {
  if (transporter) {
    return transporter;
  }

  let user = env.ETHEREAL_USER || 'tl762wdpy64hb4uy@ethereal.email';
  let pass = env.ETHEREAL_PASS || 'au49CCZKh2DyP5Xycf';

  transporter = nodemailer.createTransport({
    host: env.ETHEREAL_HOST || 'smtp.ethereal.email',
    port: env.ETHEREAL_PORT || 587,
    secure: false,
    connectionTimeout: 10000,
    greetingTimeout: 5000,
    socketTimeout: 15000,
    auth: {
      user,
      pass,
    },
  });

  try {
    await transporter.verify();
    console.log('✅ Ethereal SMTP connection verified successfully');
  } catch (error) {
    console.error('❌ Ethereal SMTP verification failed:', error);
  }

  return transporter;
}

export interface SendEmailOptions {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  messageId?: string;
}

export interface SendEmailResult {
  messageId: string;
  response: string;
  previewUrl: string | false;
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const mailer = await getSmtpTransporter();

  const info = await mailer.sendMail({
    from: options.from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    messageId: options.messageId, // Deterministic RFC 5322 Message-ID
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);

  return {
    messageId: info.messageId,
    response: info.response,
    previewUrl,
  };
}
