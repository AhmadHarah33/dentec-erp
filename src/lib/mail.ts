/**
 * Outgoing email — invitations and password resets. Server only.
 *
 * The ERP sends its own mail rather than using Supabase's mailer: the
 * Supabase instance is shared with another project whose auth settings
 * (site URL, templates, sender) must not change, and its mailer is not
 * configured. Mail sent from here can be Arabic, carry the Dentec name, and
 * link to the ERP's own pages.
 *
 * Configured by environment; with no SMTP_HOST the app simply reports that
 * mail is off and the owner shares links by hand.
 *
 *   SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASSWORD,
 *   MAIL_FROM ("Dentec <no-reply@dentec.cloud>")
 */

import nodemailer from "nodemailer";

export function mailEnabled(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM);
}

export async function sendMail(message: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  if (!mailEnabled()) throw new Error("mail is not configured");
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  await transport.sendMail({ from: process.env.MAIL_FROM, ...message });
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * One plain, right-to-left message with a single button. Inline styles only:
 * most mail clients strip <style> blocks.
 */
export function actionEmail(opts: {
  dir: "rtl" | "ltr";
  heading: string;
  body: string;
  button: string;
  url: string;
  footer: string;
}): { html: string; text: string } {
  const align = opts.dir === "rtl" ? "right" : "left";
  const html = `<!doctype html><html dir="${opts.dir}"><body style="margin:0;background:#f7f8fb;font-family:Tahoma,Arial,sans-serif;color:#131829">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e6e9f0;border-radius:12px">
<tr><td style="padding:28px 28px 8px;text-align:${align}"><div style="font-size:20px;font-weight:bold;color:#1b2350;letter-spacing:1px">DENTEC</div></td></tr>
<tr><td style="padding:8px 28px;text-align:${align}"><h1 style="margin:0 0 12px;font-size:18px">${escape(opts.heading)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#5d6577">${escape(opts.body)}</p>
<a href="${escape(opts.url)}" style="display:inline-block;background:#1a224d;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:bold">${escape(opts.button)}</a>
<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#767f99;word-break:break-all">${escape(opts.url)}</p></td></tr>
<tr><td style="padding:16px 28px 28px;text-align:${align};font-size:12px;color:#767f99">${escape(opts.footer)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${opts.heading}\n\n${opts.body}\n\n${opts.url}\n\n${opts.footer}`;
  return { html, text };
}
