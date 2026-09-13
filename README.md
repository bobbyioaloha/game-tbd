# Mandatory Safety Exercise 🦖☁️👷

A 3D browser racing game about dinosaurs completing a compulsory workplace skydiving exercise. Dodge obstacles, race your coworkers, and use your voice to create objects that can change the race for everyone.

Built during the 100-hour TAI x OpenAI Hackathon in September 2026, with Codex assisting development. 

## Play the game

Choose Greg the Tyrannosaurus, Linda the Triceratops, or Steve the Stegosaurus, then race three computer-controlled opponents to the finish. Susan is on the roster but still uses a placeholder and cannot be selected. The game currently targets desktop Chrome and Edge with a keyboard.

Ordinary items help you compete. The yellow **Voice Power Up** gives you one chance to create something:

1. Fly into a yellow star (up to two per run, if time allows).
2. Hold **Space** and describe an object in ten words or fewer.
3. Release to submit. Keep racing while it generates.
4. Follow the radar to the object ahead and fly through its glowing halo.
5. The first racer to reach it activates its effect. That can help or hurt everyone, including you.

Creations can pull racers into a vortex, launch debris, send out a shockwave, or provide a protective slipstream. Their appearance comes from the prompt; their effect comes from a supported set of game mechanics.

### Controls

| Key | Action |
| --- | --- |
| W / A / S / D | Steer |
| Hold K | Air brake |
| U | Boost, when you have fuel |
| L | Dodge |
| J | Use an ordinary item |
| Hold I | Look up |
| Hold Space | Speak after collecting the star; release to submit |
| Esc | Pause / resume |

Letter controls can be rebound in **Settings**. Choose **Play without voice** during setup to race without a microphone. Pausing or switching away from the game cancels a pending voice attempt.

## Run locally

Clone this repository, install Node.js 22 (22.12 or newer) and Bun 1.4.2+, then run these commands from the repository root. If your checkout is in WSL, use a WSL terminal.

```sh
bun install
bun run dev
```

Open [the local game](http://localhost:5173). This starts the browser app and API together; Ctrl+C stops them.

**No API key is needed.** Everything starts in mock mode, which uses prepared transcripts and objects. Mock mode lets you test the microphone and game flow, but does not recognize what you say. For real speech and custom creations, follow [the optional live AI setup](docs/voice-input-plan.md#enable-live-ai-locally). Paid calls require explicit opt-in.

## Explore the project

The game has three TypeScript workspaces:

| Folder | What it does |
| --- | --- |
| [`apps/web`](apps/web) | The React interface, Three.js / React Three Fiber game, controls, and microphone recorder. Vite runs and builds the frontend. |
| [`apps/server`](apps/server) | The Fastify API that transcribes speech and requests AI-generated designs and geometry. API keys stay here. |
| [`packages/shared`](packages/shared) | The Zod schemas, TypeScript types, example creations, and effect presets both sides agree on. |

For a guided tour, read [how the game works](docs/architecture.md). To experiment without racing, open the local [Generation lab](http://localhost:5173/#/dev/generation). It includes a shared-effect sandbox and a text/voice-to-3D viewer. The lab is excluded from production builds.

## Contribute

[The contributor guide](CONTRIBUTING.md) explains where to make changes, how to test them, and what to include in a pull request or bug report.

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start local development with free mocks. |
| `bun run build` | Build all workspaces. |
| `bun run typecheck` | Check TypeScript across the repo. |
| `bun run test` | Run the automated test suite with mocks and intercepted providers. |
| `bun run build:deploy` | Build the backend and game-only frontend for hosting; does not upload or enable AI. |

## People and credits

- [elizabeth-oda](https://github.com/elizabeth-oda): AI pipeline, geometry generation principles, deployment, and a bit of codebase sanity.
- [bobbyioaloha](https://github.com/bobbyioaloha): gameplay, character and environment design, and overall silliness.

Codex assisted with planning, implementation, debugging, and documentation. The dinosaur assets are built with the repository's [procedural character script](scripts/build-greg.py); [the art guide](docs/dinosaur-art-direction.md) explains how to rebuild and change them.

The project uses React, Vite, Three.js, React Three Fiber, Fastify, Zod, and Bun. Live speech and generation use the OpenAI API.

## Status and further reading

The current prototype includes a complete race flow, three playable characters, ordinary items, voice-triggered shared effects, and a local generation lab. Races have one human player and simulated rivals. Mobile play, online multiplayer, and Susan's finished model are outside the current implementation. AI quality and response time vary; invalid or late results end the attempt.

- [Architecture and repository tour](docs/architecture.md)
- [Voice setup, testing, and troubleshooting](docs/voice-input-plan.md)
- [Generation lab and model configuration](docs/prompt-to-mesh-pipeline.md)
- [Shared effects and gameplay integration](docs/race-events-handoff.md)
- [Characters and art contributions](docs/dinosaur-art-direction.md)
- [Deploy to Vercel, update variables, and redeploy](docs/deployment.md)

Older v1/v2 contracts remain for compatibility and regression coverage. They are described separately in the [legacy power-up reference](docs/legacy-powerups.md) and [creation demo reference](docs/creation-skeleton.md). Agent-specific working rules live in [AGENTS.md](AGENTS.md).
