# Voice: setup, testing, and troubleshooting

Main-race voice now produces [v4 safety drills](safety-drills.md): the request chooses appearance and supported behavior. The v3 `/api/voice/events` endpoint remains compatible.

Use this guide to try the microphone in the game or Generation lab. For the code's overall structure, start with [how the game works](architecture.md). Voice is implemented in the main race; the older creation demo remains simulated regression code.

## Choose how you want to play

| Mode | What happens | What you need |
| --- | --- | --- |
| Play without voice | A normal race with ordinary items; the yellow voice star is removed. | A supported desktop browser and keyboard. |
| Mock | The microphone records, but a selected prepared transcript determines the creation. Your spoken words are not recognized. | Microphone permission and the local mock API. No key or paid calls. |
| Live AI | The recording is transcribed, then its words drive the design and geometry stages. | A configured live server, microphone permission, and explicit paid consent. |

Desktop Chrome and Edge are the initial target. Use localhost or HTTPS for microphone access. Spoken prompts are English-first and must contain one to ten whitespace-separated words, at most 200 characters.

## Try the game without spending credits

Run `bun install` and `bun run dev` from the repository root, then open [the local game](http://localhost:5173).

1. Select a character and choose **Begin as [name]**.
2. Keep **Mock** selected in the pre-flight setup and choose a prepared prompt.
3. Click **Enable microphone** and allow access. This permission check immediately releases the device and does not call a provider.
4. Choose **Start with voice**. Staying at the starting horizontal position lets you reach the yellow star at 180 m depth.
5. After collecting it, hold Space, speak, and release. The HUD shows the simulated transcript and creation progress.
6. Keep racing and follow the radar to the generated object. It appears later in the course, not immediately beside you. Fly through its glowing halo; the first racer to reach it activates the effect.

You have 10 gameplay seconds after collection to start speaking. Recording auto-submits after 8 seconds. Each run offers up to two stars, with one fresh attempt per star; failure, cancellation, or missing a star consumes that opportunity. After the first creation activates/expires or the first attempt ends, a second star can appear after four gameplay seconds, 120 m ahead, provided enough race remains. Restart returns to setup and clears consent. **Play without voice** lets you skip all microphone setup.

Main-race objects have a 10 m collection radius and a fitted 12 m model diameter. Normal v3 placement is roughly eight seconds ahead of the player (240 m at normal fall speed), with room left for collection and the effect before the finish. A completed result waits two gameplay seconds before appearing, and longer if the current shared event is still active; it is not announced as spawned until placed. Contact size comes from the game, independently of the generated mesh. See [placement details](race-events-handoff.md#placement-and-lifecycle).

## Try the Generation lab

Open [the local lab](http://localhost:5173/#/dev/generation). It is available during `bun run dev` and excluded from production builds.

- **Race events** tests the same v3 creations used by the main race, with simplified racers for inspecting effects. Select a prepared event prompt and mock profile to try recorded input without spending credits. Fixture selection, simulation, and replay work without microphone capture.
- **Asset generation** is the v2 text/voice-to-3D comparison tool. Select **Voice**, keep **Mock two-stage pipeline**, choose a comparison prompt, enable the microphone, then hold and release the record button. **Speak and create** makes a preview; **Transcribe only** returns the simulated text without generation.

In Asset generation, **Use transcript as typed input** copies the recognized or simulated text into the text form without submitting it. The lab shows words, timings, stages, errors, and the last valid visual. Comparison exports can include transcripts and generated specs, but never audio. History lasts only while the page is mounted.

New requests need time for the existing 8/10/30-second budgets, the two-second reveal buffer, approach, and the effect. The host checks before offering the second star, before recording, and again before submitting audio. Braking does not inflate the time estimate; later boosts can still make a completed creation too late to place. Such results are discarded with a message, not retried or carried into another run. There is no encore or in-run reuse.

## Enable live AI locally

Skip this section for normal development or mock testing. One server-side key serves transcription, design, and geometry.

1. If `apps/server/.env` does not exist, copy the root `.env.example` there. Leave an existing file intact. In WSL, you can use:

   ```sh
   cp -n .env.example apps/server/.env
   chmod 600 apps/server/.env
   ```

2. Open `apps/server/.env` in your editor and set `OPENAI_API_KEY`. The file is ignored by Git. Do not put the key in frontend code, `VITE_` variables, chat, or terminal commands/history.
3. Stop the default development process with Ctrl+C, then run:

   ```sh
   bun run dev:live
   ```

4. In race setup, enable the microphone, select **Live AI**, and allow up to two paid voice attempts for the run (up to six API calls total) before choosing **Start with voice**. In the lab, choose a live profile and confirm that specific paid attempt before recording or generating.

`bun run dev`, builds, tests, and the ordinary server start keep paid mode disabled even if a key is present. Starting `dev:live` exposes the paid option; it does not itself make a provider call. Refreshing profiles reports local configuration, not whether the provider accepts your key or model.

Live development binds to localhost and does not restart the backend on file changes. Restart it deliberately after editing server code. For a hosted game, use [the Vercel guide](deployment.md) instead of these local enablement steps.

### Calls and allowance

| Action | Maximum provider calls |
| --- | --- |
| Typed creation | 2: design and geometry |
| Transcription only | 1: speech |
| Spoken creation | 3: speech, design, and geometry |

Local live mode defaults to **3 dispatched attempts per server start**, shared across the race, lab, profiles, and browser tabs. `LIVE_MAX_ATTEMPTS` accepts 1-100. Only one paid attempt runs at a time per server instance, and repeat attempt IDs are rejected. Restarting resets the count. Failed or cancelled dispatched work consumes the allowance and may still incur charges; there are no automatic retries.

In the main race, consent authorizes up to two fresh attempts. Each started attempt consumes one authorization and uses its own UUID; collecting a star never dispatches automatically. Reset and relevant configuration changes clear consent. The lab still confirms each attempt separately. Server allowance is checked independently and may run out before the second race attempt. Invalid metadata and missing consent are rejected before dispatch. If a paid transcription returns empty or overlong text, the attempt is consumed and generation does not start.

The configured transcription model comes from `TRANSCRIPTION_MODEL` in the server environment; its default is `gpt-transcribe`. Generation profiles and output limits are documented in [the lab guide](prompt-to-mesh-pipeline.md#models-and-budgets).

## Understand timing and cancellation

The budgets run in sequence:

```text
Record: up to 8 s
  -> upload and transcribe: up to 10 s
  -> design and geometry together: up to 30 s
```

Design has an 8-second cap inside the generation window. If design takes 6 seconds, geometry has about 24 seconds left. A total voice attempt longer than 30 seconds can therefore be expected even when generation stays within its own budget.

In the race, pausing, losing focus, restarting, finishing, or leaving cancels pending work (including a ready result awaiting placement), releases the microphone, and rejects late results. An already spawned shared object remains available to racers still falling. Pausing freezes its effect time; resetting clears it.

In the lab, losing focus cancels microphone capture. After submission, requests can continue in the background. Explicit cancellation or leaving the page aborts pending requests. Audio stays in memory only for capture and the request; it is never written to files, logs, or comparison history.

## Troubleshooting

| What you see | What to check |
| --- | --- |
| It always creates the same thing | Check **Mock** versus **Live AI**. Mock mode uses the selected prepared transcript, regardless of what you say. |
| Space does nothing | Collect the yellow star first, start within the speaking window, and check that voice is enabled and the race is unpaused. |
| Microphone unavailable | Check browser permission and input device. Use desktop Chrome/Edge on localhost or HTTPS. You can still play without voice. |
| Live AI unavailable locally | Check the server is running through `bun run dev:live` and a key is configured in the server environment, then refresh availability. |
| Live AI unavailable on Vercel | Follow [hosted diagnostics](deployment.md#troubleshooting); an API startup failure can look like disabled AI. |
| `TRANSCRIPTION_TIMEOUT` | Upload/transcription exceeded its separate budget. Generation may not have started. |
| `TIMEOUT` in design or geometry | The design cap or shared 30-second generation deadline was reached. See [latency testing](prompt-to-mesh-pipeline.md#testing-against-the-30-second-limit). |
| Object generated, but no effect yet | The object is waiting for a racer to collect it. Follow the radar and glowing halo. |
| Attempt consumed after a failure | Each star grants one attempt. Watch for the second star if enough race remains; paid dispatched failures still count. |

Reusing a recognized transcript in the typed lab avoids another transcription call, but a new live generation still requires a separate paid attempt.

## HTTP and adapter reference

`GET /api/lab/profiles` returns generation profiles, transcription availability/model, and shared usage counters. It contains no credentials and makes no provider call.

All three voice POST routes accept multipart form data with exactly two parts:

1. `audio`: one nonempty file, at most 1 MiB, with MIME `audio/webm`, `audio/mp4`, or `audio/wav`. The server checks the container signature; the provider decodes audio.
2. `options`: JSON matching the strict shared `VoiceRequestSchema`. For an event mock:

   ```json
   {"profileId":"mock","geometryMode":"primitives","captureMs":1200,"mockText":"hungry purple planet"}
   ```

`captureMs` is finite in [0, 8000] and reports browser capture time; it is not server-verified duration. `geometryMode` is `primitives` or `mesh`; omission retains the raw-mesh default. `mockText` is ignored by live transcription. The low-level mock speech provider defaults to `giant rubber duck` when omitted; event clients must supply a supported event prompt, as the game's UI does.

Live options also require `paidAttempt: {id: <new UUID>, confirmed: true}`. No keys or model overrides belong in request metadata. Text is validated rather than silently shortened.

| Route | Result |
| --- | --- |
| `POST /api/voice/drills` | Main-race v4 drill workflow, streamed as `SafetyDrillVoiceEventSchema`. |
| `POST /api/voice/events` | Retained v3 event workflow, streamed as `RaceEventVoiceEventSchema`. |
| `POST /api/voice/creations` | Asset lab's v2 workflow, streamed as `VoiceEventSchema`. |
| `POST /api/voice/transcriptions` | JSON `{text, metric}` only; no design or geometry. |

Both generation streams report `transcribing`, `transcript`, nested `generation` progress, then an outer `complete` or `failed`. The outer terminal event decides success; HTTP 200 alone does not. A completed result includes the validated spec, transcript metric, and elapsed time. The browser validates every event and final spec.

Pre-stream failures return `{error:{code,message,provider?}}` with safe allowlisted diagnostics. Statuses are 400 for invalid input/consent, 403 for disabled mode or foreign origin, 409 for busy/repeated attempts, 429 for exhausted allowance, 503 for missing configuration, and 502 for other provider/deadline failures. Raw provider errors are never forwarded.

The upload deadline starts on handler entry. A stalled upload closes without dispatching transcription. Client deadlines are 15 seconds for transcription-only and 45 seconds for the combined workflow, including delivery grace; capture precedes these request budgets.

| Responsibility | Location |
| --- | --- |
| Recording, permission, meter, cleanup | `apps/web/src/voice/recorder.ts`, `RecorderControls.tsx` |
| Race setup and consent | `apps/web/src/voice/RaceVoiceControls.tsx` |
| Main-race audio adapter | `apps/web/src/voice/race-event-voice-client.ts` |
| v3 text/audio streaming client | `apps/web/src/race-events/client.ts` |
| v2 and transcription-only client | `apps/web/src/voice/voice-client.ts` |
| Shared audio and event contracts | `packages/shared/src/voice.ts`, `race-event-pipeline.ts` |
| Uploads and transcription providers | `apps/server/src/voice/routes.ts`, `transcription.ts` |
| Paid admission and generation | `apps/server/src/generation/pipeline.ts` |
| Current race attempt and spawn lifecycle | `apps/web/src/game/creation-attempt.ts`, `race-event-host.ts` |

The recorder captures audio; transcription returns words; generation returns validated data. `RaceEventHost` connects that work to pickups without moving the player. Legacy `CreationLoop` and `RaceCreationHost` retain the older v2 adapter behavior; they do not define current shared race effects.

## Verify a change

Run [the contributor checks](../CONTRIBUTING.md#check-your-work), then try the mock game flow above in Chrome or Edge. Tests use fake media devices, canned uploads, and intercepted provider responses. They cover recording cleanup, consent, deadlines, invalid input, and stale results without real credentials.

A real microphone/live quality test is a separate deliberate action. Record the browser, selected profile, recognized text, timings, and outcome; never include audio or keys in a report.
