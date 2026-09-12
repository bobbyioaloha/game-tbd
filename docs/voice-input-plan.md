# Voice input: implementation and testing

Implemented in the main race and the Generation lab. The separate Voice / creation demo keeps its deterministic simulated transcriber for regression testing.

## Behavior

- Desktop Chrome/Edge on localhost or HTTPS; English first.
- Enable the microphone explicitly before the race. This checks permission and immediately stops the device. It never contacts OpenAI.
- Collect the gold Voice Power Up, then hold Space or the hold button. Release automatically submits; no transcript confirmation. Start speaking within 10 gameplay seconds of collection.
- Recording stops and submits at 8 seconds. Upload plus transcription has a separate 10-second server budget. Accepted transcripts start the existing 30-second design/geometry budget, with an 8-second design cap.
- Falling continues during recording and requests. One pickup grants one attempt. Failure, cancellation, missed pickup, or an expired speaking window consumes it; no automatic retry or refund.
- The finished creation spawns at the player's latest X/Z, approximately three seconds ahead, with a minimum 18 m lead. Collecting it activates its one effect. The fixed 1 m pickup radius is independent of appearance.
- Pausing, focus loss, restart, finish, and navigation cancel active work, release the microphone, and reject late results. A spawn below the finish margin is rejected.

## Try it without credits

Run `bun install` then `bun run dev`. Open http://localhost:5173.

**Generation lab:** select Input source → Voice, keep Mock two-stage pipeline, choose a comparison prompt, and Enable microphone. Use Hold to test mock and release. The notice shows the exact simulated transcript. Mock mode captures audio but returns the selected simulated transcript; it does not recognize speech. Speak and create previews the corresponding fixture. Transcribe only returns text without generating; Use transcript as typed input copies it into the editable text form without submitting.

The lab shows the transcript, word count, capture/transcription/stage/total timing, the separate shared generation elapsed time, safe provider diagnostics, and the last valid visual. History/JSON export includes voice mode, selected models, transcript, timing, outcomes, and structured errors. Audio is never included. History lasts only while this page is mounted.

**Game → Movement test:** while paused before the first fall, select a simulated transcript and Enable microphone. Resume/start fall. Stay at the starting X/Z to collect the gold pickup at depth 180 m (roughly 7.5 seconds). Hold Space, speak, then release. The HUD shows progress and the recognized/simulated text. Stay in the path of the creation to collect it. Restart for another opportunity.

The original **Game → Voice / creation demo** still uses text-based simulated speech and no server calls.

## Deliberate paid tests

Reuse `OPENAI_API_KEY` in the ignored `apps/server/.env`. No new key is necessary. Do not expose it through `VITE_` or frontend code. The server defaults to `TRANSCRIPTION_MODEL=gpt-transcribe`; supported alternatives are `gpt-4o-mini-transcribe` and `gpt-4o-transcribe`.

Stop the default dev process and explicitly start `bun run dev:live`. This server runs without automatic watch/restart. Keeping a key in `.env` never enables paid mode by itself.

- **Lab:** select a live profile and Voice, choose Transcribe only or Speak and create, and check Allow this paid voice attempt before holding to speak.
- **Race:** before starting, select a live voice profile and arm Allow this run's one paid voice attempt. The arm clears on start of the attempt, restart, or configuration changes. The next run must be armed again.
- Typed creation can make at most 2 provider calls; transcription-only at most 1; spoken creation at most 3 (speech, design, geometry).
- All three entry points share one server allowance (default 3 dispatched attempts per start), unique attempt IDs, and a single live request slot. The voice workflow reserves that slot once for its full lifetime. Failed or cancelled calls may incur charges.
- Invalid metadata/audio and missing consent are rejected before dispatch. A dispatched transcription producing empty or overlong text consumes its attempt and never starts generation.

OpenAI transcription uses the file endpoint and an English language hint. The SDK has retries disabled and a fixed provider URL. The application never sends raw provider error messages or credentials to the browser. See the official [speech-to-text guide](https://developers.openai.com/api/docs/guides/speech-to-text).

## Generation timeouts

`TIMEOUT` after design and geometry total approximately 30 seconds is the generation ceiling; speech can already have succeeded. The timeout identifies the stage and includes design time when geometry ran out of remaining time. `TRANSCRIPTION_TIMEOUT` is the separate speech/upload budget.

For a deliberate latency comparison, choose Procedural parts and **Sol direct · no reasoning**. Both generation stages use Sol with reasoning disabled. This is an unbenchmarked alternative; it may change visual quality and does not guarantee completion in 30 seconds. Existing profiles and the default mock selection are preserved. You can reuse the recognized transcript in the typed lab to test generation without another speech call. See [generation timeout testing](prompt-to-mesh-pipeline.md#testing-against-the-30-second-limit).

## HTTP contract

`GET /api/lab/profiles` includes `transcription: {model, available}` alongside generation profiles and shared `liveUsage`. This is local configuration, not a paid connectivity check.

Both voice POST routes accept multipart form data with exactly two parts:

1. `audio`: one nonempty file, at most 1 MiB, with MIME `audio/webm`, `audio/mp4`, or `audio/wav`. The server checks the container signature; the provider decodes the audio. The filename has no authority.
2. `options`: JSON matching the shared strict `VoiceRequestSchema`:

```json
{
  "profileId": "mock",
  "geometryMode": "primitives",
  "captureMs": 1200,
  "mockText": "red rocket with fins"
}
```

`captureMs` is finite in [0, 8000]. It reports browser capture time; it is not server-verified audio duration. The browser enforces the recording cap independently of the server's byte limit. `geometryMode` may be `primitives` or `mesh`; omission retains the pipeline's raw-mesh default. `mockText` is optional, ignored by live transcription, and defaults to giant rubber duck in mock mode.

For live profiles, also send `paidAttempt: {id: <new UUID>, confirmed: true}`. Metadata does not contain provider keys or model overrides. Transcript validation trims text and requires 1–10 whitespace-separated words and at most 200 characters; invalid text is rejected, never shortened or rewritten.

### POST /api/voice/transcriptions

Returns JSON `{"text":"red rocket with fins","metric":{"model":"mock-transcription","durationMs":250}}`. Never starts design or geometry. A subsequent typed generation is a separate explicitly allowed attempt.

### POST /api/voice/creations

Streams newline-delimited JSON using `VoiceEventSchema`:

```text
{type: "transcribing"}
{type: "transcript", result: {text, metric}}
{type: "generation", event: <existing PipelineEvent>}
{type: "complete", result: {text, metric}, spec: <validated CreationSpec v2>, elapsedMs}
```

The generation event wraps existing design/geometry/validation progress, metrics, handoff, and completion/failure. Only the outer `complete` or `failed` is terminal for the voice workflow. On failure: `{type: "failed", error: {code, message, provider?}, elapsedMs}`. A nested generation failure is followed by the outer failure. The client validates the entire stream and final spec before spawning.

Pre-stream failures return `{"error":{"code":"...","message":"...","provider":{...}}}` with safe optional diagnostics. Codes include `INVALID_AUDIO`, `INVALID_REQUEST`, `INVALID_TRANSCRIPT`, `TRANSCRIPTION_TIMEOUT`, existing generation errors, and paid-mode errors. A streaming response may be HTTP 200 with a terminal failure event: inspect that event, not just status. Error HTTP statuses are 400 for invalid input/consent, 403 for disabled mode or foreign origin, 409 for busy/replayed attempts, 429 for exhausted allowance, 503 for missing configuration, and 502 for other provider/deadline failures.

The 10-second transcription budget includes upload from handler entry. A stalled upload closes the connection rather than starting a provider call. Client timeout is 15 seconds for transcription-only or 45 seconds for the combined workflow, including 5 seconds of delivery grace. Recording time precedes those request budgets.

Multipart parsing is scoped to voice routes; other JSON endpoints retain the 4 KiB limit. Recordings live only in memory during the request. No database, disk storage, audio logs, or audio history exports were added.

## Ownership and extension points

| Responsibility | Location |
| --- | --- |
| Bounded microphone capture, permission, meter, cleanup | `apps/web/src/voice/recorder.ts` |
| Shared capture controls | `apps/web/src/voice/RecorderControls.tsx` |
| Typed HTTP voice client and audio creation adapter | `apps/web/src/voice/voice-client.ts` |
| Lab recorder/testing UI | `apps/web/src/voice/VoiceLabPanel.tsx` |
| Race configuration and per-run consent | `apps/web/src/voice/RaceVoiceControls.tsx` |
| Audio/transcript/event contracts | `packages/shared/src/voice.ts` |
| Multipart endpoints and disconnect handling | `apps/server/src/voice/routes.ts` |
| Replaceable mock/OpenAI speech providers | `apps/server/src/voice/transcription.ts` |
| Shared paid admission and sequential generation | `apps/server/src/generation/pipeline.ts` |
| One-attempt state machine and stale-result guards | `apps/web/src/game/creation-loop.ts` |
| Race pickup collision, forward spawn, effect activation | `apps/web/src/game/race-creation-host.ts` |

`CreationLoop` accepts either the legacy text transcriber or an audio capture adapter plus `AudioCreationClient`. The recorder never generates assets; the speech provider never selects effects. `RaceScene` retains the sole fixed-step movement loop and passes its swept movement segment to `RaceCreationHost`. Space enters through the race's existing keyboard handler in `MovementTest`.

The race maps generated slow multipliers/durations and shield durations directly to bounded timers; overlapping authored/generated slows use the stronger multiplier without multiplication. Protection lasts until the later timer expires. Clear-nearby removes obstacle centers within the supplied radius at collection time. Generated effects do not occupy or overwrite inventory items.

## Verification

Run `bun run build`, `bun run typecheck`, and `bun run test`. Tests use fake media devices, canned uploads, and intercepted provider fetches. They cover release/cleanup, late permission, auto-stop, consent/replay/global-slot rules, invalid audio/transcripts, independent speech deadlines, exactly three SDK calls, continuous falling, collection-only effects, and stale-result rejection.

Browser smoke testing uses a temporary synthetic microphone and a mock-only server. It verifies lab speech-to-preview, transcription-only, text fallback, and the actual race's pickup-to-activation flow without accessing a physical microphone or spending credits. A developer still needs to deliberately test a real microphone and live speech recognition in Chrome/Edge.
