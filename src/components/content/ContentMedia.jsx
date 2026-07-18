import { FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getProgressionMediaUrl } from '../../services/progressionMedia';

export default function ContentMedia({ asset, heading = '', caption = '' }) {
  const [resolved, setResolved] = useState({ path: '', url: '', error: '' });

  useEffect(() => {
    let active = true;
    if (!asset?.storagePath) return undefined;
    getProgressionMediaUrl(asset.storagePath)
      .then((nextUrl) => {
        if (active) setResolved({ path: asset.storagePath, url: nextUrl, error: '' });
      })
      .catch((nextError) => {
        console.error('Content media URL failed:', nextError);
        if (active) setResolved({ path: asset.storagePath, url: '', error: 'This media could not be opened.' });
      });

    return () => {
      active = false;
    };
  }, [asset?.storagePath]);

  const url = resolved.path === asset?.storagePath ? resolved.url : '';
  const error = resolved.path === asset?.storagePath ? resolved.error : '';

  if (!asset?.storagePath) return null;
  if (error) return <p className="form-error">{error}</p>;
  if (!url) return <p className="content-media-loading">Loading media…</p>;

  const type = String(asset.contentType || '');

  return (
    <figure className="content-media">
      {heading && <h4>{heading}</h4>}
      {type.startsWith('image/') && <img src={url} alt={caption || heading || 'Training reference'} />}
      {type.startsWith('video/') && (
        <video controls preload="metadata" src={url}>
          <track kind="captions" />
        </video>
      )}
      {type.startsWith('audio/') && <audio controls src={url} />}
      {!type.startsWith('image/') && !type.startsWith('video/') && !type.startsWith('audio/') && (
        <a className="text-link" href={url} target="_blank" rel="noreferrer">
          <FileText size={17} /> Open reference file
        </a>
      )}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
