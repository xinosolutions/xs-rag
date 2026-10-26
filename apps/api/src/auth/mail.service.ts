import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { getEnv } from '../config/env.js';

export interface RecordedMail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  token?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  public readonly recordedMails: RecordedMail[] = [];

  constructor() {
    const env = getEnv();
    if (env.NODE_ENV !== 'test') {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: false,
        ignoreTLS: true,
      });
    }
  }

  async sendPasswordResetMail(email: string, token: string): Promise<void> {
    const env = getEnv();
    const resetUrl = `${env.WEB_ORIGIN}/reset-password/${token}`;
    const subject = 'Reset your password';
    const text = `Please reset your password by clicking the following link: ${resetUrl}`;
    const html = `<p>Please reset your password by clicking <a href="${resetUrl}">here</a>.</p>`;

    const mail: RecordedMail = {
      to: email,
      subject,
      text,
      html,
      token,
    };

    this.recordedMails.push(mail);

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: env.MAIL_FROM,
          to: email,
          subject,
          text,
          html,
        });
      } catch (err) {
        this.logger.error(`Failed to send password reset email to ${email}`, err);
      }
    }
  }

  async sendInvitationMail(email: string, token: string, workspaceName: string): Promise<void> {
    const env = getEnv();
    const inviteUrl = `${env.WEB_ORIGIN}/invite/${token}`;
    const subject = `You've been invited to ${workspaceName}`;
    const text = `You've been invited to join ${workspaceName}. Click here to accept: ${inviteUrl}`;
    const html = `<p>You've been invited to join <strong>${workspaceName}</strong>. Click <a href="${inviteUrl}">here</a> to accept.</p>`;

    const mail: RecordedMail = {
      to: email,
      subject,
      text,
      html,
      token,
    };

    this.recordedMails.push(mail);

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: env.MAIL_FROM,
          to: email,
          subject,
          text,
          html,
        });
      } catch (err) {
        this.logger.error(`Failed to send invitation email to ${email}`, err);
      }
    }
  }

  clearRecordedMails(): void {
    this.recordedMails.length = 0;
  }
}
