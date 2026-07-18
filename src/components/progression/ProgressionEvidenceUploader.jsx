import { Film, RefreshCw, UploadCloud, Video } from 'lucide-react';
import { useRef, useState } from 'react';
import DeviceRecorder from '../media/DeviceRecorder';
import {
  makeClientId,
  uploadProgressionEvidence,
} from '../../services/progressionMedia';

export default function ProgressionEvidenceUploader({
  memberUid,
  levelKey,
  categoryKey,
  disabled = false,
  onUpload,
}) {
  const inputRef = useRef(null);
  const [mode, setMode] = useState('upload');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const uploadFile = async (file, source = 'upload', recorderMeta = {}) => {
    if (!file || disabled || busy) return;
    const evidenceId = makeClientId('evidence');
    setBusy(true);
    setProgress(0);
    setError('');

    try {
      const media = await uploadProgressionEvidence({
        memberUid,
        levelKey,
        categoryKey,
        evidenceId,
        file,
        source,
        onProgress: setProgress,
      });
      await onUpload({
        evidenceId,
        source,
        durationSeconds: Number(recorderMeta.durationSeconds || 0),
        ...media,
      });
    } catch (nextError) {
      console.error('Progression evidence upload failed:', nextError);
      setError(nextError?.message || 'The evidence video could not be uploaded.');
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await uploadFile(file, 'upload');
  };

  return (
    <div className="progression-evidence-uploader">
      <div className="progression-evidence-uploader__tabs" role="tablist" aria-label="Add evidence">
        <button
          type="button"
          className={mode === 'upload' ? 'is-active' : ''}
          onClick={() => setMode('upload')}
          disabled={disabled || busy}
        >
          <UploadCloud size={16} /> Upload
        </button>
        <button
          type="button"
          className={mode === 'record' ? 'is-active' : ''}
          onClick={() => setMode('record')}
          disabled={disabled || busy}
        >
          <Video size={16} /> Record
        </button>
      </div>

      {mode === 'upload' ? (
        <div className="progression-evidence-uploader__upload">
          <Film size={26} />
          <p>Upload a current video for instructor review.</p>
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
            {busy ? `Uploading ${progress}%` : 'Choose video'}
          </button>
        </div>
      ) : (
        <DeviceRecorder
          kind="video"
          disabled={disabled || busy}
          maxSeconds={600}
          onUseRecording={(file, meta) => uploadFile(file, 'device_recording', meta)}
        />
      )}

      <p className="progression-video__hint">MP4, MOV, or WebM. Maximum 250 MB.</p>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
