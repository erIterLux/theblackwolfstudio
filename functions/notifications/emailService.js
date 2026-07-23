const nodemailer = require('nodemailer');
const { logger } = require('firebase-functions');

let gmailEmailSecret;
let gmailAppPasswordSecret;
let configuredAppOrigin = 'http://localhost:5173';
let configuredStudioEmail = '';

function configureEmail({ gmailEmail, gmailAppPassword, appOrigin, studioNotificationEmail } = {}) {
  gmailEmailSecret = gmailEmail || gmailEmailSecret;
  gmailAppPasswordSecret = gmailAppPassword || gmailAppPasswordSecret;
  configuredAppOrigin = String(appOrigin || configuredAppOrigin).replace(/\/+$/, '');
  configuredStudioEmail = String(studioNotificationEmail || configuredStudioEmail).trim();
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getTransport() {
  const user = gmailEmailSecret?.value();
  const pass = gmailAppPasswordSecret?.value();
  if (!user || !pass) throw new Error('Gmail credentials are not configured.');

  return {
    user,
    transporter: nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    }),
  };
}

function emailShell({ eyebrow = 'The Black Wolf Studio', title, bodyHtml, buttonLabel, buttonUrl }) {
  const safeTitle = escapeHtml(title);
  const button = buttonLabel && buttonUrl
    ? `<p style="margin:28px 0 8px"><a href="${escapeHtml(buttonUrl)}" style="display:inline-block;padding:13px 19px;background:#35495d;color:#fff;text-decoration:none;font-weight:700;border-radius:2px">${escapeHtml(buttonLabel)}</a></p>`
    : '';

  return `
    <div style="margin:0;padding:28px 14px;background:#f2eee6;font-family:Arial,sans-serif;color:#14171b">
      <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #d8d2c8">
        <div style="padding:24px 28px;background:#101215;color:#f2eee6">
          <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;opacity:.72">${escapeHtml(eyebrow)}</div>
          <h1 style="margin:10px 0 0;font-size:27px;line-height:1.15">${safeTitle}</h1>
        </div>
        <div style="padding:28px;line-height:1.65;font-size:15px">
          ${bodyHtml}
          ${button}
        </div>
        <div style="padding:18px 28px;border-top:1px solid #e5e0d7;color:#6b7280;font-size:12px">
          Train with awareness. Practice with purpose. Build durable confidence.
        </div>
      </div>
    </div>`;
}

async function sendEmail({
  to,
  bcc,
  subject,
  text,
  html,
  replyTo,
  attachments = [],
}) {
  if (!to && (!Array.isArray(bcc) || !bcc.length)) {
    throw new Error('Email recipient is required.');
  }
  const { user, transporter } = getTransport();
  return transporter.sendMail({
    from: `The Black Wolf Studio <${user}>`,
    to: to || undefined,
    bcc: bcc?.length ? bcc : undefined,
    replyTo: replyTo || undefined,
    subject,
    text,
    html,
    attachments,
  });
}

function studioNotificationEmail() {
  const fallback = gmailEmailSecret?.value() || '';
  return configuredStudioEmail || fallback;
}

function appUrl(path = '/') {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${configuredAppOrigin}${suffix}`;
}

async function sendMembershipLifecycleEmail({ type, to, displayName, planName, periodEnd }) {
  if (!to) {
    logger.warn('Skipping membership email because no member email was available.', { type });
    return;
  }

  const firstName = String(displayName || '').trim().split(/\s+/)[0] || 'there';
  const plan = planName || 'membership';
  const dateText = periodEnd instanceof Date && !Number.isNaN(periodEnd.valueOf())
    ? periodEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  const templates = {
    activated: {
      subject: `Welcome to The Black Wolf Studio — ${plan}`,
      title: 'Your membership is active',
      text: `Hi ${firstName}, your ${plan} membership is active. Review and sign the current membership waiver before participating: ${appUrl('/member/waiver')}`,
      body: `<p>Hi ${escapeHtml(firstName)},</p><p>Your <strong>${escapeHtml(plan)}</strong> membership is active. Before participating, review and sign the current membership waiver. Once complete, eligible events and private training can use that verified coverage.</p>`,
      buttonLabel: 'Review membership waiver',
      buttonUrl: appUrl('/member/waiver'),
    },
    paymentFailed: {
      subject: 'Action needed: membership payment issue',
      title: 'We could not process your membership payment',
      text: `Hi ${firstName}, we could not process your membership payment. Update billing: ${appUrl('/member')}`,
      body: `<p>Hi ${escapeHtml(firstName)},</p><p>We could not process the latest payment for your <strong>${escapeHtml(plan)}</strong> membership. Please update your payment method to prevent an interruption in access.</p>`,
      buttonLabel: 'Manage billing',
      buttonUrl: appUrl('/member'),
    },
    cancellationScheduled: {
      subject: 'Your membership cancellation is scheduled',
      title: 'Your membership will not renew',
      text: `Hi ${firstName}, your membership is scheduled to end${dateText ? ` on ${dateText}` : ' at the end of the billing period'}.`,
      body: `<p>Hi ${escapeHtml(firstName)},</p><p>Your <strong>${escapeHtml(plan)}</strong> membership will remain available${dateText ? ` through <strong>${escapeHtml(dateText)}</strong>` : ' through the end of your current billing period'}, then it will not renew.</p>`,
      buttonLabel: 'Review membership',
      buttonUrl: appUrl('/member'),
    },
    canceled: {
      subject: 'Your Black Wolf Studio membership has ended',
      title: 'Your membership has ended',
      text: `Hi ${firstName}, your ${plan} membership has ended. You can restart from ${appUrl('/membership')}`,
      body: `<p>Hi ${escapeHtml(firstName)},</p><p>Your <strong>${escapeHtml(plan)}</strong> membership has ended. Your account remains available, and you can restart when the time is right.</p>`,
      buttonLabel: 'View memberships',
      buttonUrl: appUrl('/membership'),
    },
  };

  const template = templates[type];
  if (!template) throw new Error(`Unsupported membership email type: ${type}`);

  return sendEmail({
    to,
    subject: template.subject,
    text: template.text,
    html: emailShell({
      title: template.title,
      bodyHtml: template.body,
      buttonLabel: template.buttonLabel,
      buttonUrl: template.buttonUrl,
    }),
  });
}

module.exports = {
  configureEmail,
  escapeHtml,
  emailShell,
  sendEmail,
  sendMembershipLifecycleEmail,
  studioNotificationEmail,
  appUrl,
};
