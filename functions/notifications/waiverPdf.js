const PDFDocument = require('pdfkit');

const COLORS = {
  ink: '#14171b',
  muted: '#5f666d',
  paper: '#f7f3eb',
  line: '#d8d2c8',
  accent: '#35495d',
  black: '#101215',
  white: '#ffffff',
};

function clean(value, max = 50000) {
  return String(value ?? '')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .trim()
    .slice(0, max);
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

function scopeStatementForWaiver(waiver = {}) {
  const terms = waiver.waiverSnapshot || {};
  const participant = waiver.participantSnapshot || {};
  const stored = clean(terms.scopeStatement || terms.scope);
  if (stored) return stored;

  if (waiver.scope === 'membership') {
    return `Membership scope: This signed record is the current Black Wolf Studio membership waiver for ${clean(participant.fullName) || 'the named participant'}. It applies while this waiver version and membership remain current, unless a separate event waiver or addendum is required.`;
  }
  if (waiver.scope === 'private_training') {
    const training = waiver.privateTrainingSnapshot || {};
    return `Private-training scope: This signed record applies to ${clean(participant.fullName) || 'the named participant'} for ${clean(training.title) || 'the identified private-training package'}${training.purchaseId ? ` (package ${clean(training.purchaseId)})` : ''}.`;
  }
  const event = waiver.eventSnapshot || {};
  return `Event scope: This signed record applies only to ${clean(participant.fullName) || 'the named participant'} for ${clean(event.title) || 'the identified Studio event'}${event.startsAt ? ` on ${formatSignedAt(event.startsAt)}` : ''}.`;
}

function signatureBuffer(waiver = {}) {
  const dataUrl = clean(waiver.signatureDataUrl, 350000);
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  return match ? Buffer.from(match[1], 'base64') : null;
}

function addLabelValue(doc, label, value, options = {}) {
  const text = clean(value);
  if (!text) return;
  const left = options.left ?? doc.page.margins.left;
  const width = options.width ?? (
    doc.page.width - doc.page.margins.left - doc.page.margins.right
  );
  doc
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .fillColor(COLORS.muted)
    .text(clean(label).toUpperCase(), left, doc.y, { width, characterSpacing: 0.7 });
  doc
    .moveDown(0.18)
    .font('Helvetica')
    .fontSize(10.5)
    .fillColor(COLORS.ink)
    .text(text, left, doc.y, { width, lineGap: 1.5 });
  doc.moveDown(0.62);
}

function addLegalBody(doc, body) {
  const paragraphs = clean(body)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  paragraphs.forEach((paragraph) => {
    const numberedHeading = /^\d+\.\s+/.test(paragraph);
    const isEmphasis = paragraph === paragraph.toUpperCase() && paragraph.length > 45;
    doc
      .font(numberedHeading || isEmphasis ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(numberedHeading ? 11 : 9.4)
      .fillColor(COLORS.ink)
      .text(paragraph, {
        align: 'left',
        lineGap: numberedHeading ? 2.5 : 3,
        paragraphGap: numberedHeading ? 4 : 8,
      });
  });
}

function addFooter(doc, referenceId) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const y = doc.page.height - 37;
    const previousBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .moveTo(doc.page.margins.left, y - 8)
      .lineTo(doc.page.width - doc.page.margins.right, y - 8)
      .lineWidth(0.5)
      .strokeColor(COLORS.line)
      .stroke();
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(COLORS.muted)
      .text(
        `Electronic waiver record ${clean(referenceId, 220)} - Page ${index + 1} of ${range.count}`,
        doc.page.margins.left,
        y,
        {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
          align: 'center',
          lineBreak: false,
        },
      );
    doc.page.margins.bottom = previousBottomMargin;
  }
}

function createSignedWaiverPdf(waiver = {}, referenceId = '') {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const terms = waiver.waiverSnapshot || {};
    const participant = waiver.participantSnapshot || {};
    const signer = waiver.signer || {};
    const emergencyName = clean(
      participant.emergencyContactName || participant.emergencyContact?.name,
    );
    const emergencyPhone = clean(
      participant.emergencyContactPhone || participant.emergencyContact?.phone,
    );
    const signature = signatureBuffer(waiver);

    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 54, right: 54, bottom: 58, left: 54 },
      bufferPages: true,
      autoFirstPage: true,
      info: {
        Title: clean(terms.title || 'Signed participant waiver'),
        Author: 'The Black Wolf Studio',
        Subject: scopeStatementForWaiver(waiver),
        Keywords: 'signed waiver, electronic signature, participant record',
        CreationDate: new Date(),
      },
    });

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    doc
      .rect(0, 0, doc.page.width, 112)
      .fill(COLORS.black);
    doc
      .fillColor(COLORS.white)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('THE BLACK WOLF STUDIO', 54, 34, { characterSpacing: 1.8 });
    doc
      .font('Helvetica-Bold')
      .fontSize(22)
      .text(clean(terms.title || 'Signed Participant Waiver'), 54, 56, {
        width: doc.page.width - 108,
        lineGap: 2,
      });

    doc.y = 136;
    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor(COLORS.ink)
      .text('Electronic signature record');
    doc
      .moveDown(0.35)
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(COLORS.muted)
      .text('A completed copy retained for the participant, guardian, and Studio records.');
    doc.moveDown(1);

    const summaryTop = doc.y;
    doc
      .roundedRect(
        doc.page.margins.left,
        summaryTop,
        doc.page.width - doc.page.margins.left - doc.page.margins.right,
        1,
        8,
      )
      .fill(COLORS.paper);
    doc.y = summaryTop + 16;
    addLabelValue(doc, 'Scope', scopeStatementForWaiver(waiver));
    addLabelValue(doc, 'Participant', participant.fullName);
    if (emergencyName || emergencyPhone) {
      addLabelValue(
        doc,
        'Emergency contact',
        [emergencyName, emergencyPhone].filter(Boolean).join(' - '),
      );
    }
    addLabelValue(
      doc,
      'Signed by',
      `${clean(signer.name)}${signer.relationship || signer.capacity ? ` (${clean(signer.relationship || signer.capacity)})` : ''}`,
    );
    addLabelValue(doc, 'Signed', formatSignedAt(waiver.signedAt));
    addLabelValue(doc, 'Waiver version', terms.version);
    addLabelValue(doc, 'Record reference', referenceId);
    const summaryBottom = doc.y + 5;
    doc
      .roundedRect(
        doc.page.margins.left,
        summaryTop,
        doc.page.width - doc.page.margins.left - doc.page.margins.right,
        summaryBottom - summaryTop,
        8,
      )
      .lineWidth(0.75)
      .strokeColor(COLORS.line)
      .stroke();
    doc.y = summaryBottom + 18;

    if (waiver.mediaConsentSnapshot?.enabled) {
      addLabelValue(
        doc,
        'Separate optional photo/video consent',
        waiver.mediaConsentAccepted === true ? 'Accepted' : 'Not accepted',
      );
      doc.moveDown(0.5);
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor(COLORS.ink)
      .text('Approved release terms');
    doc
      .moveDown(0.25)
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(COLORS.muted)
      .text(`Version ${clean(terms.version)}`);
    doc.moveDown(0.9);
    addLegalBody(doc, terms.body);

    doc.moveDown(0.8);
    doc
      .roundedRect(
        doc.page.margins.left,
        doc.y,
        doc.page.width - doc.page.margins.left - doc.page.margins.right,
        1,
        7,
      )
      .fill(COLORS.paper);
    const acknowledgementTop = doc.y + 15;
    doc.y = acknowledgementTop;
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(COLORS.ink)
      .text('Acknowledgement');
    doc
      .moveDown(0.35)
      .font('Helvetica')
      .fontSize(9.2)
      .text(clean(
        participant.isMinor ? terms.minorAcknowledgement : terms.acknowledgement,
      ), { lineGap: 3 });
    const acknowledgementBottom = doc.y + 13;
    doc
      .roundedRect(
        doc.page.margins.left,
        acknowledgementTop - 15,
        doc.page.width - doc.page.margins.left - doc.page.margins.right,
        acknowledgementBottom - acknowledgementTop + 15,
        7,
      )
      .lineWidth(0.75)
      .strokeColor(COLORS.line)
      .stroke();
    doc.y = acknowledgementBottom + 18;

    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(COLORS.ink)
      .text('Electronic signature');
    doc
      .moveDown(0.35)
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(COLORS.muted)
      .text('The image below is the signature submitted with this electronic record.');
    doc.moveDown(0.75);
    if (signature) {
      const signatureTop = doc.y;
      doc
        .roundedRect(
          doc.page.margins.left,
          signatureTop,
          doc.page.width - doc.page.margins.left - doc.page.margins.right,
          112,
          6,
        )
        .fillAndStroke(COLORS.white, COLORS.line);
      doc.image(signature, doc.page.margins.left + 14, signatureTop + 12, {
        fit: [
          doc.page.width - doc.page.margins.left - doc.page.margins.right - 28,
          88,
        ],
        align: 'left',
        valign: 'center',
      });
      doc.y = signatureTop + 126;
    } else {
      doc
        .font('Helvetica-Oblique')
        .fontSize(9)
        .fillColor(COLORS.muted)
        .text('Signature image was not available in this record.');
    }

    doc
      .moveDown(0.6)
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(COLORS.muted)
      .text(
        'This PDF is a human-readable copy of the electronically stored waiver record. The Studio retains the signed timestamp, record reference, signature hash, and submission metadata.',
        { lineGap: 2.5 },
      );

    addFooter(doc, referenceId);
    doc.end();
  });
}

module.exports = {
  createSignedWaiverPdf,
  scopeStatementForWaiver,
};
