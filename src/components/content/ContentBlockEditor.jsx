import {
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  GripVertical,
  RefreshCw,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { useRef, useState } from 'react';
import DeviceRecorder from '../media/DeviceRecorder';
import { uploadProgressionContentAsset } from '../../services/progressionMedia';
import ContentMedia from './ContentMedia';

const typeIcons = {
  text: FileText,
  image: FileImage,
  audio: FileAudio,
  video: FileVideo,
};

export default function ContentBlockEditor({
  contentId,
  block,
  disabled = false,
  onChange,
  onRemove,
}) {
  const fileInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const Icon = typeIcons[block.type] || FileText;

  const update = (patch) => onChange({ ...block, ...patch });

  const uploadFile = async (file, source = 'upload', recorderMeta = {}) => {
    if (!file || disabled || busy) return;
    setBusy(true);
    setProgress(0);
    setError('');
    try {
      const asset = await uploadProgressionContentAsset({
        contentId,
        blockId: block.id,
        file,
        source,
        onProgress: setProgress,
      });
      update({
        asset: {
          ...asset,
          source,
          durationSeconds: Number(recorderMeta.durationSeconds || 0),
        },
      });
    } catch (nextError) {
      console.error('Curriculum media upload failed:', nextError);
      setError(nextError?.message || 'The media could not be uploaded.');
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const accept = block.type === 'image'
    ? 'image/*'
    : block.type === 'audio'
      ? 'audio/*'
      : 'video/*';

  return (
    <article className={`content-block-editor is-${block.type}`}>
      <header>
        <span><GripVertical size={17} /><Icon size={18} /> {block.type}</span>
        <button className="icon-button" type="button" onClick={onRemove} disabled={disabled} aria-label="Remove content block">
          <Trash2 size={17} />
        </button>
      </header>

      <label>
        Section heading
        <input
          value={block.heading || ''}
          onChange={(event) => update({ heading: event.target.value })}
          placeholder="Optional heading"
          disabled={disabled}
        />
      </label>

      {block.type === 'text' ? (
        <label>
          Content
          <textarea
            value={block.body || ''}
            onChange={(event) => update({ body: event.target.value })}
            placeholder="Write the reference content for this section."
            disabled={disabled}
          />
        </label>
      ) : (
        <>
          <label>
            Caption or transcript summary
            <textarea
              value={block.caption || ''}
              onChange={(event) => update({ caption: event.target.value })}
              placeholder="Describe what the media teaches. This is also provided to Wolf Guide."
              disabled={disabled}
            />
          </label>

          {block.asset?.storagePath ? (
            <div className="content-block-editor__preview">
              <ContentMedia asset={block.asset} caption={block.caption} />
              <button className="text-link" type="button" onClick={() => update({ asset: null })}>Replace media</button>
            </div>
          ) : (
            <div className="content-block-editor__media-actions">
              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept={accept}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) uploadFile(file, 'upload');
                }}
                disabled={disabled || busy}
              />
              <button className="button button--small button--dark-ghost" type="button" onClick={() => fileInputRef.current?.click()} disabled={disabled || busy}>
                {busy ? <RefreshCw className="is-spinning" size={16} /> : <UploadCloud size={16} />}
                {busy ? `Uploading ${progress}%` : `Upload ${block.type}`}
              </button>

              {(block.type === 'audio' || block.type === 'video') && (
                <DeviceRecorder
                  kind={block.type}
                  disabled={disabled || busy}
                  maxSeconds={block.type === 'audio' ? 600 : 900}
                  onUseRecording={(file, meta) => uploadFile(file, 'device_recording', meta)}
                />
              )}
            </div>
          )}
        </>
      )}

      {error && <p className="form-error">{error}</p>}
    </article>
  );
}
