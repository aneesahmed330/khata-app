"use client";

// MediaRecorder wrapper for the Gemini audio path. This replaces the Web Speech
// API as the primary voice input: no browser ASR engine outputs Roman Urdu, so
// its transcript never matched the Roman-Urdu parser or the $text corpus.
// Sending the audio itself lets Gemini transcribe and parse in one call.
import { useCallback, useEffect, useRef, useState } from "react";

// Ordered by preference — opus in webm is what Chrome/Edge/Firefox produce and
// Gemini accepts it directly. Safari only offers mp4/aac.
const CANDIDATE_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

/** Hard stop so a forgotten recording can't grow unbounded (and can't burn the
 *  day's Gemini quota in one request). */
const MAX_MS = 20_000;

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return CANDIDATE_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined" &&
    pickMimeType() !== null
  );
}

export interface Recording {
  base64: string;
  mimeType: string;
}

export interface UseRecorderResult {
  supported: boolean;
  recording: boolean;
  /** Seconds elapsed, for the live timer. */
  elapsed: number;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Recording read nahi hui."));
    reader.onload = () => {
      // strip the "data:<mime>;base64," prefix — the API wants raw base64
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

export function useRecorder(onComplete: (rec: Recording) => void): UseRecorderResult {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onComplete);

  // Kept in a ref so start() doesn't need onComplete as a dependency — a new
  // callback identity each render would otherwise churn the recorder.
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Detect in an effect, not during render: MediaRecorder doesn't exist on the
  // server, and checking it during render would break hydration.
  useEffect(() => setSupported(isRecordingSupported()), []);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (capRef.current) clearTimeout(capRef.current);
    timerRef.current = null;
    capRef.current = null;
  }, []);

  const stop = useCallback(() => {
    recorderRef.current?.state === "recording" && recorderRef.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    stop();
  }, [stop]);

  const start = useCallback(async () => {
    const mimeType = pickMimeType();
    if (!mimeType) {
      setError("Is browser mein recording support nahi. Likh kar entry karo.");
      return;
    }

    setError(null);
    cancelledRef.current = false;
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Mic ki permission nahi mili. Browser settings mein allow karo.");
      return;
    }

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;

    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunksRef.current.push(ev.data);
    };

    recorder.onstop = async () => {
      clearTimers();
      setRecording(false);
      setElapsed(0);
      // Release the mic — without this the browser keeps showing a recording
      // indicator and holds the device open.
      stream.getTracks().forEach((t) => t.stop());

      if (cancelledRef.current) return;

      const blob = new Blob(chunksRef.current, { type: mimeType });
      if (blob.size < 1200) {
        setError("Kuch sunai nahi diya. Dobara bolo.");
        return;
      }

      try {
        onCompleteRef.current({ base64: await blobToBase64(blob), mimeType });
      } catch {
        setError("Recording process nahi hui. Dobara try karo.");
      }
    };

    recorder.start();
    setRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    capRef.current = setTimeout(() => stop(), MAX_MS);
  }, [clearTimers, stop]);

  // Never leave the mic open if the component unmounts mid-recording.
  useEffect(() => {
    return () => {
      clearTimers();
      if (recorderRef.current?.state === "recording") {
        cancelledRef.current = true;
        recorderRef.current.stop();
      }
    };
  }, [clearTimers]);

  return { supported, recording, elapsed, error, start, stop, cancel };
}
