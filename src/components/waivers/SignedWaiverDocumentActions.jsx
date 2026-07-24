import {
  Download,
  ExternalLink,
  FileText,
  LoaderCircle,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { getSignedWaiverPdf } from '../../services/waivers';

function pdfBlob(contentBase64, contentType = 'application/pdf') {
  const binary = window.atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: contentType });
}

export default function SignedWaiverDocumentActions({
  scope,
  waiverId,
  participantName = 'participant',
  coverageSource = '',
}) {
  const [pdf, setPdf] = useState(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [error, setError] = useState('');

  const loadPdf = useCallback(async () => {
    if (pdf) return pdf;
    const result = await getSignedWaiverPdf({ scope, waiverId });
    if (!result?.contentBase64) {
      throw new Error('The signed waiver PDF could not be prepared.');
    }
    const nextPdf = {
      filename: result.filename || `signed-waiver-${waiverId}.pdf`,
      url: URL.createObjectURL(pdfBlob(result.contentBase64, result.contentType)),
    };
    setPdf(nextPdf);
    return nextPdf;
  }, [pdf, scope, waiverId]);

  useEffect(() => () => {
    if (pdf?.url) URL.revokeObjectURL(pdf.url);
  }, [pdf]);

  useEffect(() => {
    if (!viewerOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setViewerOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [viewerOpen]);

  const viewPdf = async () => {
    setBusyAction('view');
    setError('');
    try {
      await loadPdf();
      setViewerOpen(true);
    } catch (nextError) {
      setError(nextError?.message || 'The signed waiver PDF could not be opened.');
    } finally {
      setBusyAction('');
    }
  };

  const downloadPdf = async () => {
    setBusyAction('download');
    setError('');
    try {
      const nextPdf = await loadPdf();
      const anchor = window.document.createElement('a');
      anchor.href = nextPdf.url;
      anchor.download = nextPdf.filename;
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (nextError) {
      setError(nextError?.message || 'The signed waiver PDF could not be downloaded.');
    } finally {
      setBusyAction('');
    }
  };

  const label = coverageSource === 'membership'
    ? 'membership waiver'
    : 'signed waiver';

  return (
    <div className="signed-waiver-document-actions">
      <button
        className="waiver-document-button"
        type="button"
        onClick={viewPdf}
        disabled={Boolean(busyAction)}
      >
        {busyAction === 'view'
          ? <LoaderCircle className="is-spinning" size={15} aria-hidden="true" />
          : <FileText size={15} aria-hidden="true" />}
        View {label} PDF
      </button>
      <button
        className="waiver-document-button waiver-document-button--icon"
        type="button"
        onClick={downloadPdf}
        disabled={Boolean(busyAction)}
        aria-label={`Download ${label} PDF for ${participantName}`}
        title={`Download ${label} PDF`}
      >
        {busyAction === 'download'
          ? <LoaderCircle className="is-spinning" size={15} aria-hidden="true" />
          : <Download size={15} aria-hidden="true" />}
      </button>
      {error && <small className="waiver-document-error" role="alert">{error}</small>}

      {viewerOpen && pdf && (
        <div
          className="waiver-document-modal"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setViewerOpen(false);
          }}
        >
          <section
            className="waiver-document-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`waiver-pdf-title-${waiverId}`}
          >
            <header>
              <div>
                <p className="eyebrow">Studio record</p>
                <h2 id={`waiver-pdf-title-${waiverId}`}>
                  {participantName}&apos;s {label}
                </h2>
              </div>
              <div className="waiver-document-modal__actions">
                <a href={pdf.url} download={pdf.filename} className="button button--small">
                  <Download size={16} aria-hidden="true" /> Download
                </a>
                <a
                  href={pdf.url}
                  target="_blank"
                  rel="noreferrer"
                  className="waiver-document-modal__icon-button"
                  aria-label="Open PDF in a new tab"
                  title="Open PDF in a new tab"
                >
                  <ExternalLink size={18} aria-hidden="true" />
                </a>
                <button
                  className="waiver-document-modal__icon-button"
                  type="button"
                  onClick={() => setViewerOpen(false)}
                  aria-label="Close signed waiver PDF"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
            </header>
            <iframe src={pdf.url} title={`Signed waiver PDF for ${participantName}`} />
          </section>
        </div>
      )}
    </div>
  );
}
