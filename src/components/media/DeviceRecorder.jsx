import {
  Circle,
  Mic,
  RefreshCw,
  Square,
  Video,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

function chooseMimeType(kind) {
  const options = kind === 'audio'
    ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

  return options.find((type) => globalThis.MediaRecorder?.isTypeSupported?.(type)) || '';
}

function extensionFor(type, kind) {
  if (type.includes('mp4')) return 'mp4';
  if (type.includes('ogg')) return 'ogg';
  return kind === 'audio' ? 'webm' : 'webm';
}

export default function DeviceRecorder({
  kind = 'video',
  disabled = false,
  maxSeconds = 600,
  onUseRecording,
}) {
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const previewRef = useRef(null);
  const [status, setStatus] = useState('idle');
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState('');
  const [recordedFile, setRecordedFile] = useState(null);
  const [error, setError] = useState('');

  const label = kind === 'audio' ? 'audio' : 'video';
  const Icon = kind === 'audio' ? Mic : Video;

  const timeLabel = useMemo(() => {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}:${String(remainder).padStart(2, '0')}`;
  }, [seconds]);

  const stopTracks = () => {
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;
  };

  const clearTimer = () => {
    if (timerRef.current) globalThis.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const reset = () => {
    clearTimer();
    stopTracks();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setRecordedFile(null);
    setSeconds(0);
    setStatus('idle');
    setError('');
    chunksRef.current = [];
  };

  useEffect(() => () => {
    clearTimer();
    stopTracks();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const finishRecording = () => {
    clearTimer();
    stopTracks();
    setStatus('preview');
  };

  const stop = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
  };

  const start = async () => {
    if (disabled || status === 'recording') return;
    setError('');
    reset();

    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
      setError('Device recording is not supported in this browser. Use file upload instead.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === 'audio'
          ? { audio: true, video: false }
          : { audio: true, video: { facingMode: 'user' } },
      );
      streamRef.current = stream;
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        await previewRef.current.play().catch(() => undefined);
      }

      const mimeType = chooseMimeType(kind);
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError(`The ${label} recording could not be completed.`);
        reset();
      };
      recorder.onstop = () => {
        const resolvedType = recorder.mimeType || mimeType || `${kind}/webm`;
        const blob = new Blob(chunksRef.current, { type: resolvedType });
        const extension = extensionFor(resolvedType, kind);
        const file = new File(
          [blob],
          `${kind}-recording-${Date.now()}.${extension}`,
          { type: resolvedType },
        );
        const url = URL.createObjectURL(blob);
        setRecordedFile(file);
        setPreviewUrl(url);
        finishRecording();
      };

      recorder.start(1000);
      setStatus('recording');
      setSeconds(0);
      timerRef.current = globalThis.setInterval(() => {
        setSeconds((current) => {
          const next = current + 1;
          if (next >= maxSeconds) queueMicrotask(stop);
          return next;
        });
      }, 1000);
    } catch (nextError) {
      console.error('Device recording permission failed:', nextError);
      stopTracks();
      setStatus('idle');
      setError(
        nextError?.name === 'NotAllowedError'
          ? `Allow camera and microphone access to record ${label}.`
          : `The ${label} recorder could not start.`,
      );
    }
  };

  const useRecording = () => {
    if (!recordedFile) return;
    onUseRecording?.(recordedFile, { source: 'device_recording', durationSeconds: seconds });
  };

  return (
    <div className={`device-recorder is-${kind}`}>
      {kind === 'video' && (
        <div className="device-recorder__preview">
          {previewUrl ? (
            <video controls playsInline src={previewUrl}>
              <track kind="captions" />
            </video>
          ) : (
            <video ref={previewRef} muted playsInline />
          )}
        </div>
      )}

      {kind === 'audio' && previewUrl && (
        <audio className="device-recorder__audio" controls src={previewUrl} />
      )}

      <div className="device-recorder__actions">
        {status === 'idle' && (
          <button
            className="button button--small button--dark-ghost"
            type="button"
            disabled={disabled}
            onClick={start}
          >
            <Icon size={16} /> Record {label}
          </button>
        )}

        {status === 'recording' && (
          <>
            <span className="device-recorder__timer"><Circle size={10} fill="currentColor" /> {timeLabel}</span>
            <button className="button button--small" type="button" onClick={stop}>
              <Square size={15} /> Stop
            </button>
          </>
        )}

        {status === 'preview' && (
          <>
            <button className="button button--small" type="button" onClick={useRecording}>
              Use recording
            </button>
            <button className="button button--small button--dark-ghost" type="button" onClick={reset}>
              <RefreshCw size={15} /> Retake
            </button>
            <button className="icon-button" type="button" onClick={reset} aria-label="Discard recording">
              <X size={17} />
            </button>
          </>
        )}
      </div>

      <p className="device-recorder__hint">
        Maximum {Math.floor(maxSeconds / 60)} minutes. Preview before uploading.
      </p>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
