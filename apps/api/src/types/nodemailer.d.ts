/** Minimal ambient types — nodemailer@9 ships no .d.ts and @types/nodemailer lags. */
declare module 'nodemailer' {
  export interface Transporter {
    sendMail(mailOptions: {
      from?: string;
      to?: string;
      subject?: string;
      text?: string;
      html?: string;
    }): Promise<{ messageId?: string }>;
  }

  export interface TransportOptions {
    host?: string;
    port?: number;
    secure?: boolean;
    auth?: { user: string; pass: string };
  }

  export function createTransport(options: TransportOptions): Transporter;
}
