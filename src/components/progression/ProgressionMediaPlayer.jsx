import { FileVideo } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getProgressionMediaUrl } from '../../services/progressionMedia';

export default function ProgressionMediaPlayer({ media, className = '' }) {
  const [resolved, setResolved] = useState({ path: '', url: '', error: '' });

  useEffect(() => {
    let active = true;
    if (!media?.storagePath) return undefined;
    getProgressionMediaUrl(media.storagePath)
      .then((nextUrl) => {
        if (active) setResolved({ path: media.storagePath, url: nextUrl, error: '' });
      })
      .catch((nextError) => {
        console.error('Progression media URL failed:', nextError);
        if (active) setResolved({ path: media.storagePath, url: '', error: 'Media unavailable.' });
      });

    return () => {
      active = false;
    };
  }, [media?.storagePath]);

  const url = resolved.path === media?.storagePath ? resolved.url : '';
  const error = resolved.path === media?.storagePath ? resolved.error : '';

  if (!media?.storagePath) return null;
  if (error) return <p className="form-error">{error}</p>;
  if (!url) return <div className="progression-media-loading"><FileVideo size={20} /> Loading media…</div>;

  const contentType = String(media.contentType || '');
  if (contentType.startsWith('audio/')) {
    return <audio className={className} controls src={url} />;
  }

  return (
    <video className={className} controls preload="metadata" playsInline src={url}>
      <track kind="captions" />
    </video>
  );
}
