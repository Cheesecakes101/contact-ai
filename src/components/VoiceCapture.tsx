"use client";

import { useEffect, useRef, useState } from "react";

// Minimal typings for the Web Speech API (not in lib.dom for all TS versions).
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type SpeechCtor = new () => SpeechRecognitionLike;

function getSpeech(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const NEW_PERSON_PROMPTS = [
  "Where and how did you meet?",
  "What do they do — work, company, projects?",
  "What are they into? Interests, hobbies, causes.",
  "How could you help each other, or collaborate?",
  "Anything to follow up on, and how close are you?",
];

export const UPDATE_PROMPTS = [
  "When did you last catch up, and how?",
  "What did you talk about?",
  "Anything new in their life or work?",
  "Any follow-ups or ways to help?",
];

/**
 * Guided voice note: shows one question at a time while transcribing live.
 * The transcript is always editable as plain text, so this degrades to a
 * text box in browsers without speech recognition.
 */
export function VoiceCapture({
  value,
  onChange,
  prompts,
  placeholder = "Or type here…",
}: {
  value: string;
  onChange: (v: string) => void;
  prompts: string[];
  placeholder?: string;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRef = useRef(false);
  const valueRef = useRef(value);
  const stepRef = useRef(step);
  const lastLabelledStep = useRef(-1);
  const [seconds, setSeconds] = useState(0);

  valueRef.current = value;
  stepRef.current = step;

  useEffect(() => setSupported(!!getSpeech()), []);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  useEffect(() => () => {
    wantRef.current = false;
    recRef.current?.stop();
  }, []);

  function append(text: string) {
    const clean = text.trim();
    if (!clean) return;
    let prefix = "";
    // Label each answer with the question it answers so the AI has context.
    if (lastLabelledStep.current !== stepRef.current) {
      lastLabelledStep.current = stepRef.current;
      prefix = `${valueRef.current ? "\n\n" : ""}[${prompts[stepRef.current]}] `;
    } else {
      prefix = valueRef.current && !valueRef.current.endsWith(" ") ? " " : "";
    }
    const next = valueRef.current + prefix + clean.charAt(0).toUpperCase() + clean.slice(1);
    valueRef.current = next;
    onChange(next);
  }

  function start() {
    const Ctor = getSpeech();
    if (!Ctor) return;
    setErr(null);
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-GB";
    rec.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) append(r[0].transcript);
        else interimText += r[0].transcript;
      }
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setErr("Microphone access was blocked. Allow it in your browser settings, or type instead.");
        wantRef.current = false;
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        setErr(`Voice error: ${e.error}`);
      }
    };
    // Browsers stop recognition after silence; restart while the user still wants to record.
    rec.onend = () => {
      setInterim("");
      if (wantRef.current) {
        try {
          rec.start();
          return;
        } catch {
          /* fall through */
        }
      }
      setRecording(false);
    };
    recRef.current = rec;
    wantRef.current = true;
    setSeconds(0);
    setRecording(true);
    rec.start();
  }

  function stop() {
    wantRef.current = false;
    recRef.current?.stop();
    setRecording(false);
  }

  const mm = String(Math.floor(seconds / 60)).padStart(1, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-line bg-paper p-4">
        <div className="mb-2 flex items-center justify-between text-xs text-muted">
          <span>
            Question {step + 1} of {prompts.length}
          </span>
          <div className="flex gap-1">
            {prompts.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i)}
                aria-label={`Question ${i + 1}`}
                className={`h-1.5 w-6 rounded-full ${i === step ? "bg-accent" : i < step ? "bg-accent/40" : "bg-line"}`}
              />
            ))}
          </div>
        </div>
        <p className="text-lg font-medium leading-snug">{prompts[step]}</p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="rounded-lg px-2 py-1 text-sm text-muted disabled:opacity-30"
          >
            ← Back
          </button>
          <button
            type="button"
            disabled={step === prompts.length - 1}
            onClick={() => setStep((s) => Math.min(prompts.length - 1, s + 1))}
            className="ml-auto rounded-lg bg-accent-soft px-3 py-1 text-sm font-medium text-accent disabled:opacity-30"
          >
            Next question →
          </button>
        </div>
      </div>

      {supported !== false && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={recording ? stop : start}
            disabled={supported === null}
            className={`flex h-14 w-14 items-center justify-center rounded-full text-white transition ${
              recording ? "recording bg-red-500" : "bg-accent hover:opacity-90"
            }`}
            aria-label={recording ? "Stop recording" : "Start voice note"}
          >
            {recording ? (
              <span className="h-4 w-4 rounded-sm bg-white" />
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" />
              </svg>
            )}
          </button>
          <div className="text-sm">
            {recording ? (
              <>
                <p className="font-medium text-red-600">
                  Listening… {mm}:{ss}
                </p>
                <p className="text-muted">Answer the question, then tap “Next question”.</p>
              </>
            ) : (
              <>
                <p className="font-medium">Record a voice note</p>
                <p className="text-muted">Talk naturally — AI will organise it.</p>
              </>
            )}
          </div>
        </div>
      )}
      {supported === false && (
        <p className="text-sm text-muted">
          Live voice isn’t supported in this browser. Tip: use your keyboard’s 🎤 dictation button in the box below.
        </p>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}

      <textarea
        className="field min-h-36"
        value={value + (interim ? (value ? " " : "") + interim : "")}
        onChange={(e) => {
          if (!recording) onChange(e.target.value);
        }}
        readOnly={recording}
        placeholder={placeholder}
      />
    </div>
  );
}
