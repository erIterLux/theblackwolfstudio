import {
    ArrowLeft,
    Download,
    ExternalLink,
    QrCode,
    RefreshCw,
} from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

function validWebUrl(value) {
    try {
        const url = new URL(String(value || '').trim());
        return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
    } catch {
        return '';
    }
}

function safeFilename(value) {
    const filename = String(value || '')
        .trim()
        .replace(/\.png$/i, '')
        .replace(/[^a-z0-9-_]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return `${filename || 'black-wolf-qr-code'}.png`;
}

export default function InstructorQrCodePage() {
    const [searchParams] = useSearchParams();
    const initialUrl = validWebUrl(searchParams.get('url'))
        || `${window.location.origin}/`;
    const initialLabel = searchParams.get('label') || 'event-registration';
    const [urlInput, setUrlInput] = useState(initialUrl);
    const [filename, setFilename] = useState(initialLabel);
    const [background, setBackground] = useState('white');
    const [size, setSize] = useState('1024');
    const [request, setRequest] = useState({
        url: initialUrl,
        background: 'white',
        size: 1024,
    });
    const [pngUrl, setPngUrl] = useState('');
    const [error, setError] = useState('');
    const [generating, setGenerating] = useState(true);

    const downloadName = useMemo(() => safeFilename(filename), [filename]);

    useEffect(() => {
        let cancelled = false;
        QRCode.toDataURL(request.url, {
            errorCorrectionLevel: 'M',
            margin: 4,
            width: request.size,
            color: {
                dark: '#000000',
                light: request.background === 'transparent' ? '#00000000' : '#ffffff',
            },
        })
            .then((nextPngUrl) => {
                if (cancelled) return;
                setPngUrl(nextPngUrl);
                setError('');
                setGenerating(false);
            })
            .catch((nextError) => {
                if (cancelled) return;
                console.error(nextError);
                setPngUrl('');
                setError('The QR code could not be generated. Check the URL and try again.');
                setGenerating(false);
            });

        return () => {
            cancelled = true;
        };
    }, [request]);

    const generate = (event) => {
        event.preventDefault();
        const normalizedUrl = validWebUrl(urlInput);
        if (!normalizedUrl) {
            setError('Enter a complete web address beginning with https:// or http://.');
            return;
        }
        setUrlInput(normalizedUrl);
        setGenerating(true);
        setError('');
        setRequest({
            url: normalizedUrl,
            background,
            size: Number(size),
        });
    };

    return (
        <section className="instructor-admin-page qr-tools-page">
            <div className="container">
                <header className="admin-page-heading qr-tools-heading">
                    <div>
                        <Link className="text-link" to="/instructor">
                            <ArrowLeft size={17} /> Instructor overview
                        </Link>
                        <p className="eyebrow">Instructor tools</p>
                        <h1>QR code generator</h1>
                        <p>Create a downloadable QR code for an event registration page or any other web address.</p>
                    </div>
                </header>

                <div className="qr-tools-layout">
                    <form className="ui-panel qr-tools-form" onSubmit={generate}>
                        <div className="qr-tools-panel-heading">
                            <QrCode aria-hidden="true" />
                            <div>
                                <h2>Link and file settings</h2>
                                <p>The URL stays editable when this tool is opened from an event.</p>
                            </div>
                        </div>

                        <label>
                            Destination URL
                            <input
                                type="url"
                                inputMode="url"
                                value={urlInput}
                                onChange={(event) => setUrlInput(event.target.value)}
                                placeholder="https://theblackwolf.studio/..."
                                required
                            />
                        </label>

                        <label>
                            PNG filename
                            <div className="qr-tools-filename">
                                <input
                                    value={filename}
                                    onChange={(event) => setFilename(event.target.value)}
                                    placeholder="event-registration"
                                />
                                <span>.png</span>
                            </div>
                        </label>

                        <fieldset className="qr-tools-options">
                            <legend>Background</legend>
                            <label>
                                <input
                                    type="radio"
                                    name="qr-background"
                                    value="white"
                                    checked={background === 'white'}
                                    onChange={(event) => setBackground(event.target.value)}
                                />
                                White
                            </label>
                            <label>
                                <input
                                    type="radio"
                                    name="qr-background"
                                    value="transparent"
                                    checked={background === 'transparent'}
                                    onChange={(event) => setBackground(event.target.value)}
                                />
                                Transparent
                            </label>
                        </fieldset>

                        <label>
                            Download resolution
                            <select value={size} onChange={(event) => setSize(event.target.value)}>
                                <option value="512">512 × 512 px</option>
                                <option value="1024">1024 × 1024 px</option>
                                <option value="2048">2048 × 2048 px</option>
                            </select>
                        </label>

                        {error && <p className="form-status form-status--error" role="alert">{error}</p>}

                        <button className="button" type="submit" disabled={generating}>
                            <RefreshCw size={17} /> {generating ? 'Generating…' : 'Generate QR code'}
                        </button>
                    </form>

                    <section className="ui-panel qr-tools-preview" aria-busy={generating}>
                        <div className="qr-tools-panel-heading">
                            <QrCode aria-hidden="true" />
                            <div>
                                <h2>PNG preview</h2>
                                <p>Scan-test the preview before sharing or printing it.</p>
                            </div>
                        </div>

                        <div className={`qr-tools-image${request.background === 'transparent' ? ' is-transparent' : ''}`}>
                            {pngUrl
                                ? <img src={pngUrl} alt={`QR code for ${request.url}`} />
                                : <span>{generating ? 'Generating preview…' : 'Preview unavailable'}</span>}
                        </div>

                        <p className="qr-tools-destination">
                            <span>Current destination</span>
                            <strong>{request.url}</strong>
                        </p>

                        <div className="qr-tools-actions">
                            <a
                                className="button"
                                href={pngUrl || undefined}
                                download={downloadName}
                                aria-disabled={!pngUrl || generating}
                                onClick={(event) => {
                                    if (!pngUrl || generating) event.preventDefault();
                                }}
                            >
                                <Download size={17} /> Download PNG
                            </a>
                            <a
                                className="button button--dark-ghost"
                                href={request.url}
                                target="_blank"
                                rel="noreferrer"
                            >
                                <ExternalLink size={17} /> Test destination
                            </a>
                        </div>
                    </section>
                </div>
            </div>
        </section>
    );
}
