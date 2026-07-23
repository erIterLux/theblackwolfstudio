const { logger } = require('firebase-functions');
const {
  appUrl,
  configureEmail,
  emailShell,
  escapeHtml,
  sendEmail,
} = require('./emailService');

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function uniqueEmails(values) {
  return [...new Set(
    values
      .map((value) => clean(value, 320).toLowerCase())
      .filter((value) => value && value.includes('@')),
  )];
}

function recipientsFor(waiver) {
  const participant = waiver.participantSnapshot || {};
  const signer = waiver.signer || {};
  return uniqueEmails([
    participant.email,
    participant.isMinor ? participant.guardianEmail : null,
    signer.email,
  ]);
}

function paragraphHtml(value) {
  return clean(value, 50000)
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function formatSignedAt(value) {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  if (!date || Number.isNaN(date.valueOf())) return 'Recorded electronically';
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function newlySigned(before, after) {
  return after?.status === 'signed' && (
    before?.status !== 'signed'
    || (
      after.signedCopyEmailStatus === 'pending'
      && before?.signedCopyEmailStatus !== 'pending'
    )
  );
}

function signatureAttachment(waiver, referenceId) {
  const dataUrl = clean(waiver.signatureDataUrl, 350000);
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return { html: '', attachments: [] };
  const cid = `waiver-signature-${referenceId}@theblackwolf.studio`;
  return {
    html: `
      <p style="margin:24px 0 8px"><strong>Electronic signature</strong></p>
      <div style="border:1px solid #d8d2c8;padding:12px;background:#fff">
        <img src="cid:${escapeHtml(cid)}" alt="Electronic signature" style="display:block;max-width:100%;height:auto">
      </div>`,
    attachments: [{
      filename: 'electronic-signature.png',
      content: Buffer.from(match[1], 'base64'),
      contentType: 'image/png',
      cid,
    }],
  };
}

function signedDocumentHtml(waiver, referenceId) {
  const terms = waiver.waiverSnapshot || {};
  const participant = waiver.participantSnapshot || {};
  const signer = waiver.signer || {};
  const signatureDataUrl = clean(waiver.signatureDataUrl, 350000);
  const mediaConsent = waiver.mediaConsentSnapshot?.enabled
    ? `<p><strong>Separate optional photo/video consent:</strong> ${waiver.mediaConsentAccepted === true ? 'Accepted' : 'Not accepted'}</p>`
    : '';
  const signatureHtml = signatureDataUrl.startsWith('data:image/png;base64,')
    ? `<h2>Electronic signature</h2><img src="${signatureDataUrl}" alt="Electronic signature" style="display:block;max-width:100%;height:auto;border:1px solid #d8d2c8">`
    : '';
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(terms.title || 'Signed waiver')}</title></head>
<body style="font-family:Arial,sans-serif;line-height:1.55;color:#14171b;max-width:820px;margin:32px auto;padding:0 20px">
  <h1>${escapeHtml(terms.title || 'Signed waiver')}</h1>
  <p><strong>Scope:</strong> ${escapeHtml(terms.scopeStatement || terms.scope || '')}</p>
  <p><strong>Participant:</strong> ${escapeHtml(participant.fullName || '')}</p>
  <p><strong>Waiver version:</strong> ${escapeHtml(terms.version || '')}</p>
  <p><strong>Signed by:</strong> ${escapeHtml(signer.name || '')} (${escapeHtml(signer.relationship || signer.capacity || '')})</p>
  <p><strong>Signed:</strong> ${escapeHtml(formatSignedAt(waiver.signedAt))}</p>
  <p><strong>Record reference:</strong> ${escapeHtml(referenceId)}</p>
  ${mediaConsent}
  ${signatureHtml}
  <hr>
  ${paragraphHtml(terms.body)}
  <hr>
  <p><strong>Acknowledgement:</strong> ${escapeHtml(
    participant.isMinor ? terms.minorAcknowledgement : terms.acknowledgement,
  )}</p>
</body>
</html>`;
}

async function claimEmail(ref, field) {
  return ref.firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return false;
    const data = snapshot.data() || {};
    if (data[field] === 'sent' || data[field] === 'sending') return false;
    transaction.set(ref, {
      [field]: 'sending',
      [`${field}UpdatedAt`]: new Date(),
    }, { merge: true });
    return true;
  });
}

async function markEmail(ref, field, status, error = '') {
  await ref.set({
    [field]: status,
    [`${field}UpdatedAt`]: new Date(),
    [`${field}Error`]: error ? clean(error, 800) : null,
  }, { merge: true });
}

async function sendSignedCopy({ waiver, referenceId, ref }) {
  const recipients = recipientsFor(waiver);
  if (!recipients.length) {
    await markEmail(ref, 'signedCopyEmailStatus', 'skipped', 'No recipient email.');
    return;
  }
  const claimed = await claimEmail(ref, 'signedCopyEmailStatus');
  if (!claimed) return;

  const terms = waiver.waiverSnapshot || {};
  const participant = waiver.participantSnapshot || {};
  const signer = waiver.signer || {};
  const signature = signatureAttachment(waiver, referenceId);
  const attachmentHtml = signedDocumentHtml(waiver, referenceId);
  try {
    await sendEmail({
      to: recipients,
      subject: `Signed waiver copy — ${participant.fullName || 'Black Wolf Studio participant'}`,
      text: [
        `Attached is the completed ${terms.title || 'Black Wolf Studio waiver'}.`,
        terms.scopeStatement || '',
        `Participant: ${participant.fullName || ''}`,
        `Signed by: ${signer.name || ''}`,
        `Signed: ${formatSignedAt(waiver.signedAt)}`,
        `Reference: ${referenceId}`,
      ].filter(Boolean).join('\n'),
      html: emailShell({
        eyebrow: 'Signed waiver copy',
        title: `Waiver completed for ${participant.fullName || 'participant'}`,
        bodyHtml: `
          <p>This email is the participant or guardian copy of the completed electronic waiver.</p>
          <p><strong>Scope</strong><br>${escapeHtml(terms.scopeStatement || '')}</p>
          <p><strong>Participant</strong><br>${escapeHtml(participant.fullName || '')}</p>
          <p><strong>Signed by</strong><br>${escapeHtml(signer.name || '')} · ${escapeHtml(signer.relationship || signer.capacity || '')}</p>
          <p><strong>Signed</strong><br>${escapeHtml(formatSignedAt(waiver.signedAt))}</p>
          <p><strong>Record reference</strong><br>${escapeHtml(referenceId)}</p>
          ${signature.html}
          <p>The complete waiver terms and signature record are included in the attached printable HTML copy.</p>`,
      }),
      attachments: [
        ...signature.attachments,
        {
          filename: `signed-waiver-${referenceId}.html`,
          content: Buffer.from(attachmentHtml, 'utf8'),
          contentType: 'text/html; charset=utf-8',
        },
      ],
    });
    await markEmail(ref, 'signedCopyEmailStatus', 'sent');
  } catch (error) {
    await markEmail(ref, 'signedCopyEmailStatus', 'failed', error?.message);
    throw error;
  }
}

async function sendInvitation({ waiver, ref, path, label, contextTitle }) {
  const participant = waiver.participantSnapshot || {};
  const recipients = recipientsFor(waiver);
  if (!recipients.length) {
    await markEmail(ref, 'invitationEmailStatus', 'skipped', 'No recipient email.');
    return;
  }
  const claimed = await claimEmail(ref, 'invitationEmailStatus');
  if (!claimed) return;
  try {
    await sendEmail({
      to: recipients,
      subject: `${label} for ${participant.fullName || 'participant'}`,
      text: [
        `${participant.fullName || 'The participant'} must complete a waiver before participation.`,
        contextTitle,
        `Open the secure waiver: ${appUrl(path)}`,
      ].filter(Boolean).join('\n'),
      html: emailShell({
        eyebrow: 'Participant waiver',
        title: label,
        bodyHtml: `
          <p><strong>${escapeHtml(participant.fullName || 'The registered participant')}</strong> must complete this waiver before participation.</p>
          <p>${escapeHtml(contextTitle || '')}</p>
          <p>Membership is not required. Adult participants must sign for themselves; a parent or legal guardian signs for a minor.</p>`,
        buttonLabel: 'Review and sign waiver',
        buttonUrl: appUrl(path),
      }),
    });
    await markEmail(ref, 'invitationEmailStatus', 'sent');
  } catch (error) {
    await markEmail(ref, 'invitationEmailStatus', 'failed', error?.message);
    throw error;
  }
}

async function sendCoverageConfirmation({ waiver, ref, contextTitle }) {
  const participant = waiver.participantSnapshot || {};
  const recipients = recipientsFor(waiver);
  if (!recipients.length) {
    await markEmail(ref, 'coverageEmailStatus', 'skipped', 'No recipient email.');
    return;
  }
  const claimed = await claimEmail(ref, 'coverageEmailStatus');
  if (!claimed) return;
  try {
    await sendEmail({
      to: recipients,
      subject: `Waiver coverage confirmed — ${contextTitle}`,
      text: [
        `Waiver coverage is confirmed for ${participant.fullName || 'the participant'}.`,
        contextTitle,
        waiver.waiverSnapshot?.scopeStatement || '',
      ].filter(Boolean).join('\n'),
      html: emailShell({
        eyebrow: 'Waiver coverage confirmed',
        title: `${participant.fullName || 'Participant'} is covered`,
        bodyHtml: `
          <p>Verified waiver coverage is complete for <strong>${escapeHtml(participant.fullName || '')}</strong>.</p>
          <p><strong>${escapeHtml(contextTitle)}</strong></p>
          <p>${escapeHtml(waiver.waiverSnapshot?.scopeStatement || '')}</p>
          <p>No additional signature is required unless the studio identifies a separate event waiver or addendum.</p>`,
      }),
    });
    await markEmail(ref, 'coverageEmailStatus', 'sent');
  } catch (error) {
    await markEmail(ref, 'coverageEmailStatus', 'failed', error?.message);
    throw error;
  }
}

async function handleEventWaiverWritten(event, dependencies = {}) {
  configureEmail(dependencies);
  const before = event.data?.before?.data() || null;
  const after = event.data?.after?.data() || null;
  if (!after) return;
  const ref = event.data.after.ref;
  const referenceId = event.params.waiverId;

  if (!before && after.status === 'pending') {
    const accessSnapshot = await ref.firestore.collection('eventWaiverAccess')
      .doc(referenceId)
      .get();
    const token = accessSnapshot.data()?.token;
    if (!token) throw new Error('The event waiver access link is not ready.');
    await sendInvitation({
      waiver: after,
      referenceId,
      ref,
      path: `/events/waiver/${encodeURIComponent(referenceId)}?token=${encodeURIComponent(token)}`,
      label: 'Event waiver ready to sign',
      contextTitle: after.eventSnapshot?.title || 'Black Wolf Studio event',
    });
  }
  if (
    ['covered', 'not_required'].includes(after.status)
    && before?.status !== after.status
  ) {
    await sendCoverageConfirmation({
      waiver: after,
      ref,
      contextTitle: after.eventSnapshot?.title || 'Black Wolf Studio event',
    });
  }
  if (newlySigned(before, after)) {
    await sendSignedCopy({ waiver: after, referenceId, ref });
  }
}

async function handlePrivateTrainingWaiverWritten(event, dependencies = {}) {
  configureEmail(dependencies);
  const before = event.data?.before?.data() || null;
  const after = event.data?.after?.data() || null;
  if (!after) return;
  const ref = event.data.after.ref;
  const referenceId = event.params.waiverId;

  if (!before && after.status === 'pending') {
    const accessSnapshot = await ref.firestore.collection('privateTrainingWaiverAccess')
      .doc(referenceId)
      .get();
    const token = accessSnapshot.data()?.token;
    if (!token) throw new Error('The private-training waiver access link is not ready.');
    await sendInvitation({
      waiver: after,
      referenceId,
      ref,
      path: `/private-training/waiver/${encodeURIComponent(referenceId)}?token=${encodeURIComponent(token)}`,
      label: 'Private-training waiver ready to sign',
      contextTitle: after.privateTrainingSnapshot?.title || 'Private training',
    });
  }
  if (
    ['covered', 'not_required'].includes(after.status)
    && before?.status !== after.status
  ) {
    await sendCoverageConfirmation({
      waiver: after,
      ref,
      contextTitle: after.privateTrainingSnapshot?.title || 'Private training',
    });
  }
  if (newlySigned(before, after)) {
    await sendSignedCopy({ waiver: after, referenceId, ref });
  }
}

async function handleStudioWaiverWritten(event, dependencies = {}) {
  configureEmail(dependencies);
  const before = event.data?.before?.data() || null;
  const after = event.data?.after?.data() || null;
  if (!after) return;
  if (newlySigned(before, after)) {
    await sendSignedCopy({
      waiver: after,
      referenceId: event.params.userId,
      ref: event.data.after.ref,
    });
  }
}

async function safeWaiverEmail(handler, event, dependencies) {
  try {
    await handler(event, dependencies);
  } catch (error) {
    logger.error('Waiver email delivery failed.', {
      error: error?.message,
      eventId: event.id,
    });
    throw error;
  }
}

module.exports = {
  handleEventWaiverWritten: (event, dependencies) => (
    safeWaiverEmail(handleEventWaiverWritten, event, dependencies)
  ),
  handlePrivateTrainingWaiverWritten: (event, dependencies) => (
    safeWaiverEmail(handlePrivateTrainingWaiverWritten, event, dependencies)
  ),
  handleStudioWaiverWritten: (event, dependencies) => (
    safeWaiverEmail(handleStudioWaiverWritten, event, dependencies)
  ),
};
