import {
  FileAudio,
  FileVideo,
  MessageSquareText,
  RefreshCw,
  UploadCloud,
} from 'lucide-react';
import { useRef, useState } from 'react';
import DeviceRecorder from '../media/DeviceRecorder';
import {
  makeClientId,
  uploadProgressionFeedbackMedia,
} from '../../services/progressionMedia';
import ProgressionMediaPlayer from './ProgressionMediaPlayer';

function lines(value) {
  return String(value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function FeedbackComposer({
  memberUid,
  levelKey,
  categoryKey,
  evidenceId,
  disabled = false,
  onSave,
}) {
  const inputRef = useRef(null);
  const [feedbackType, setFeedbackType] = useState('text');
  const [text, setText] = useState('');
  const [strengths, setStrengths] = useState('');
  const [focusAreas, setFocusAreas] = useState('');
  const [media, setMedia] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const uploadFile = async (file, source = 'upload', recorderMeta = {}) => {
    if (!file || disabled || busy) return;
    const feedbackId = makeClientId('feedback');
    setBusy(true);
    setProgress(0);
    setError('');
    try {
      const uploaded = await uploadProgressionFeedbackMedia({
        memberUid,
        feedbackId,
        levelKey,
        categoryKey,
        file,
        source,
        onProgress: setProgress,
      });
      setMedia({
        ...uploaded,
        feedbackId,
        source,
        durationSeconds: Number(recorderMeta.durationSeconds || 0),
      });
    } catch (nextError) {
      console.error('Feedback media upload failed:', nextError);
      setError(nextError?.message || 'The feedback media could not be uploaded.');
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) uploadFile(file, 'upload');
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await onSave({
        feedbackId: media?.feedbackId || makeClientId('feedback'),
        feedbackType: media?.contentType?.startsWith('audio/')
          ? 'audio'
          : media?.contentType?.startsWith('video/')
            ? 'video'
            : 'text',
        evidenceId: evidenceId || '',
        text,
        strengths: lines(strengths),
        focusAreas: lines(focusAreas),
        media,
      });
      setText('');
      setStrengths('');
      setFocusAreas('');
      setMedia(null);
      setFeedbackType('text');
    } catch (nextError) {
      console.error('Feedback save failed:', nextError);
      setError(nextError?.message || 'The feedback could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const canSave = Boolean(text.trim() || strengths.trim() || focusAreas.trim() || media?.storagePath);

  return (
    <div className="feedback-composer">
      <div className="feedback-composer__tabs" role="tablist" aria-label="Feedback format">
        <button type="button" className={feedbackType === 'text' ? 'is-active' : ''} onClick={() => setFeedbackType('text')}>
          <MessageSquareText size={16} /> Text
        </button>
        <button type="button" className={feedbackType === 'audio' ? 'is-active' : ''} onClick={() => setFeedbackType('audio')}>
          <FileAudio size={16} /> Audio
        </button>
        <button type="button" className={feedbackType === 'video' ? 'is-active' : ''} onClick={() => setFeedbackType('video')}>
          <FileVideo size={16} /> Video
        </button>
      </div>

      <label>
        Written feedback
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Describe what was demonstrated and give one clear next correction."
          disabled={disabled || busy}
        />
      </label>

      <div className="feedback-composer__columns">
        <label>
          What is working
          <textarea
            value={strengths}
            onChange={(event) => setStrengths(event.target.value)}
            placeholder="One point per line"
            disabled={disabled || busy}
          />
        </label>
        <label>
          Next focus
          <textarea
            value={focusAreas}
            onChange={(event) => setFocusAreas(event.target.value)}
            placeholder="One point per line"
            disabled={disabled || busy}
          />
        </label>
      </div>

      {feedbackType !== 'text' && (
        <div className="feedback-composer__media">
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept={feedbackType === 'audio' ? 'audio/*' : 'video/*'}
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
            {busy ? `Uploading ${progress}%` : `Upload ${feedbackType}`}
          </button>
          <span>or record on this device</span>
          <DeviceRecorder
            kind={feedbackType}
            disabled={disabled || busy}
            maxSeconds={feedbackType === 'audio' ? 300 : 600}
            onUseRecording={(file, meta) => uploadFile(file, 'device_recording', meta)}
          />
        </div>
      )}

      {media?.storagePath && (
        <div className="feedback-composer__preview">
          <strong>Attached feedback media</strong>
          <ProgressionMediaPlayer media={media} className="feedback-timeline__media" />
          <button className="text-link" type="button" onClick={() => setMedia(null)}>Remove attachment</button>
        </div>
      )}

      <button
        className="button button--small button--dark-ghost"
        type="button"
        onClick={save}
        disabled={disabled || busy || !canSave}
      >
        {busy ? 'Saving feedback…' : 'Save feedback'}
      </button>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
