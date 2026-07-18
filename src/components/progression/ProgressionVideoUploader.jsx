import { Film, RefreshCw, UploadCloud } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  getProgressionVideoUrl,
  uploadProgressionVideo,
} from '../../services/progressionVideos';

export default function ProgressionVideoUploader({
  memberUid,
  levelKey,
  categoryKey,
  video,
  disabled = false,
  onUpload,
}) {
  const inputRef = useRef(null);
  const [resolvedVideo, setResolvedVideo] = useState({ path: '', url: '' });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!video?.storagePath) return undefined;

    getProgressionVideoUrl(video.storagePath)
      .then((nextUrl) => {
        if (active) setResolvedVideo({ path: video.storagePath, url: nextUrl });
      })
      .catch((nextError) => {
        console.error('Progression video URL failed:', nextError);
        if (active) setError('The current video could not be opened.');
      });

    return () => {
      active = false;
    };
  }, [video?.storagePath]);

  const url = resolvedVideo.path === video?.storagePath ? resolvedVideo.url : '';

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || disabled || busy) return;

    setBusy(true);
    setProgress(0);
    setError('');
    try {
      const metadata = await uploadProgressionVideo({
        memberUid,
        levelKey,
        categoryKey,
        file,
        onProgress: setProgress,
      });
      await onUpload(metadata);
    } catch (nextError) {
      console.error('Progression upload failed:', nextError);
      setError(nextError?.message || 'The video could not be uploaded.');
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  return (
    <div className="progression-video">
      {url ? (
        <video className="progression-video__player" controls preload="metadata" src={url}>
          <track kind="captions" />
        </video>
      ) : (
        <div className="progression-video__empty">
          <Film size={28} />
          <span>{video?.storagePath ? 'Loading current video…' : 'No evidence video yet'}</span>
        </div>
      )}

      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/*"
        onChange={handleFile}
        disabled={disabled || busy}
      />

      <button
        className="button button--small button--dark-ghost"
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
      >
        {busy ? <RefreshCw className="is-spinning" size={16} /> : <UploadCloud size={16} />}
        {busy
          ? `Uploading ${progress}%`
          : video?.storagePath
            ? 'Replace video'
            : 'Upload video'}
      </button>

      <p className="progression-video__hint">MP4, MOV, or WebM. Maximum 250 MB.</p>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
