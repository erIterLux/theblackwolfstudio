import {
  Image as ImageIcon,
  Play,
  Volume2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getProgressionMediaUrl } from '../../services/progressionMedia';

function mediaType(block) {
  const contentType = String(block?.asset?.contentType || '');
  if (contentType.startsWith('image/') || block?.type === 'image') return 'image';
  if (contentType.startsWith('video/') || block?.type === 'video') return 'video';
  if (contentType.startsWith('audio/') || block?.type === 'audio') return 'audio';
  return '';
}

const mediaLabels = {
  video: { label: 'Video', Icon: Play },
  audio: { label: 'Audio', Icon: Volume2 },
  image: { label: 'Illustration', Icon: ImageIcon },
};

export default function ContentLibraryPreview({ item }) {
  const media = useMemo(() => (
    (item.blocks || [])
      .filter((block) => block?.asset?.storagePath && mediaType(block))
      .map((block) => ({ ...block, mediaType: mediaType(block) }))
  ), [item.blocks]);
  const types = useMemo(() => [...new Set(media.map((block) => block.mediaType))], [media]);
  const preview = media.find((block) => block.mediaType === 'image')
    || media.find((block) => block.mediaType === 'video')
    || media.find((block) => block.mediaType === 'audio')
    || null;
  const [resolved, setResolved] = useState({ path: '', url: '', failed: false });

  useEffect(() => {
    let active = true;
    const storagePath = preview?.asset?.storagePath || '';
    if (!storagePath || preview.mediaType === 'audio') return undefined;

    getProgressionMediaUrl(storagePath)
      .then((url) => {
        if (active) setResolved({ path: storagePath, url, failed: false });
      })
      .catch((error) => {
        console.error('Training library preview failed:', error);
        if (active) setResolved({ path: storagePath, url: '', failed: true });
      });

    return () => { active = false; };
  }, [preview?.asset?.storagePath, preview?.mediaType]);

  if (!preview) return null;

  const url = resolved.path === preview.asset.storagePath ? resolved.url : '';
  const failed = resolved.path === preview.asset.storagePath && resolved.failed;
  const showFallback = preview.mediaType === 'audio' || failed;
  const description = types.map((type) => mediaLabels[type].label).join(', ');

  return (
    <div className={`content-library-card__preview is-${preview.mediaType}`} aria-label={`Includes ${description}`}>
      {!showFallback && preview.mediaType === 'image' && url && (
        <img src={url} alt={`${item.title} training illustration`} loading="lazy" />
      )}
      {!showFallback && preview.mediaType === 'video' && url && (
        <video src={`${url}#t=0.1`} muted playsInline preload="metadata" aria-hidden="true" />
      )}
      {!showFallback && !url && <span className="content-library-card__preview-loading" />}
      {showFallback && (
        <span className="content-library-card__media-fallback" aria-hidden="true">
          {preview.mediaType === 'audio'
            ? <Volume2 size={38} />
            : <ImageIcon size={38} />}
          <i /><i /><i /><i /><i />
        </span>
      )}
      <span className="content-library-card__media-badges" aria-hidden="true">
        {types.map((type) => {
          const { Icon, label } = mediaLabels[type];
          return <b key={type}><Icon size={13} /> {label}</b>;
        })}
      </span>
    </div>
  );
}
