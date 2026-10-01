# Auvra Premium Video Engine V1

## Product contract

Auvra treats screenshots, images, copy, logos, reference video, and audio as source evidence. A screenshot is not a mandatory scene layout. Asset Intelligence extracts meaning and brand evidence, the Creative Director reimagines the presentation, and the Brand System keeps identity, exact claims, spelling, metrics, and logo geometry locked.

The V1 flow is:

`brief + assets → asset intelligence → brand lock → Creative Director → Shot Graph → deterministic/generative routing → quote approval → async jobs → Remotion finishing`

## Creative Director and Shot Graph

The Creative Director emits a validated `CreativePlan`: concept, hook, narrative arc, brand system, duration, aspect ratio, audio plan, quality risks, and ordered shots. Each shot carries its exact copy, visual concept, scene mode, source references, motion/transition direction, audio cue, constraints, and an explicit reason when generated video is justified.

The director is not a whole-video template selector. Its vocabulary is a reusable motion-design grammar: hero statements, kinetic words, exact metric counters, model nodes, connected flows, permission chips, quote/product cards, diagrams, timelines, UI frames, logo lockups, CTA end cards, gradient depth, line draws, masks, scale reveals, and staggered text.

Plan JSON is validated before persistence. Uploaded/extracted text is labeled untrusted evidence and is never treated as an agent instruction. The local deterministic director remains available if chat inference is unavailable; it produces a conservative, mostly deterministic plan rather than inventing asset analysis.

## Scene routing and Remotion

The Shot Router first decides whether generation is needed. Exact typography, numbers, prices, product names, diagrams, logo, branded geometry, and CTA remain deterministic. Generated video is reserved for cinematic motion, atmosphere, dimensional transformations, and camera movement that add enough value to justify cost.

`apps/video` contains a data-driven Remotion composition at 30fps with 1920×1080 and 1080×1920 registrations for 15 seconds, plus a 30-second landscape registration. It consumes `CreativePlan`, sequences the Shot Graph, supports generated clip sources as background layers, and renders exact deterministic overlays above them. The motion primitives are independently composable; the Auvra example registration is preview data, not a fixed production template.

Server-side Chromium/render orchestration is intentionally isolated from V1 API job safety and has not been claimed as rendered. A production render coordinator still needs to map protected stored assets into render-safe inputs, invoke a pinned Remotion renderer/Chromium environment, persist the MP4, and run visual/audio QC.

## Video model registry and quotes

The server registry is versioned with pricing `asOf: 2026-10-01`. It declares availability, durations, aspect ratios, resolutions, audio/image/presenter capabilities, conservative pricing metadata, and any reason a model is unavailable.

Initial trusted quote inputs are:

- Veo 3.1 Lite: reviewed 720p/1080p audio and silent rates.
- Veo 3.1 Fast: reviewed 720p rates only.
- Runway Gen 4.5: reviewed 720p silent rate.
- Kling 3.0 Pro: reviewed audio and silent rates.
- Wan 3.0 Prime: enabled for future routing, but its starting price is not a trusted upper bound, so approval is unavailable for an unmatched configuration.
- HeyGen: provider support is represented, but it is reserved for a future presenter policy and has no ordinary-product-video default.
- Seedance 2.5, 2.0 Mini, and 2.0 Fast: disabled because Orbio currently reports `pricing_unavailable`.

The router does not claim a universally best model. It considers whether generation is necessary, duration, aspect ratio, audio, quality mode, and a trusted quote. The quote shows deterministic provider cost ($0), each generated shot/model/seconds, face-value estimate, safety reserve, total estimate/reserve, timestamp, and registry date. `AUVRA_VIDEO_PRICE_SAFETY_MULTIPLIER` defaults to `1.15`.

Generic `GET /models` prompt/completion prices are deliberately ignored for video. A value of zero there is not proof that video generation is free. A configuration without a trusted upper bound yields `quoteUnavailable` and cannot be approved.

Every quote contains a server-generated ID and a SHA-256 fingerprint of the canonical Creative Plan. Editing the plan invalidates older quotes. Generation accepts only an explicitly approved current quote.

## Orbio async lifecycle and cost accounting

The video provider is separate from chat completion and supports submission, status, and content download. Orbio URLs are always reconstructed from `ORBIO_BASE_URL`:

- `POST /videos`
- `GET /videos/{validatedJobId}`
- `GET /videos/{validatedJobId}/content?index=N`

Provider-returned absolute polling/content URLs are ignored, redirects are rejected for content, and job IDs are allow-listed. `ORBIO_API_KEY` remains server-only.

On a successful submission, the upstream job ID is persisted before polling. Poll failures retain the same generation and retry only `GET`; they never submit a replacement. Startup recovery discovers persisted `pending`/`in_progress` generations with upstream IDs and resumes them with limited concurrency. Polling has a configured interval and bounded lifetime. Failed, cancelled, expired, or locally timed-out jobs become terminal and are never automatically regenerated. A new paid attempt requires another explicit action and remains in history.

Completed content is downloaded through the reconstructed gateway URL and stored under a generated asset ID. If `usage.cost` exists, it is the verified actual cost. If it is absent, actual cost stays absent, status becomes `unverified`, and the original estimate/reserve remains in audit data. Missing cost is never rewritten as zero.

## Assets and persistence

Creative state is separate from missions and uses its own atomic durable JSON repository. It retains projects, assets, brand locks, briefs, insights, plans, quotes, generation attempts, and events. Uploads use bounded multipart parsing with per-file, count, and aggregate project limits. V1 accepts PNG, JPEG, WEBP, MP4, WEBM, MP3, and WAV.

User filenames are metadata only. Storage filenames are generated UUIDs; MIME types are allow-listed; paths are resolved beneath `AUVRA_CREATIVE_ASSET_DIR`; remote URL ingestion is not supported; browser responses never receive local filesystem paths. Image analysis is bounded to one vision request per image—there is no OCR loop. Reference video and metadata are preserved, but local frame extraction is explicitly marked unavailable in V1 instead of fabricating an analysis.

Local storage is suitable for the MVP. Railway production must mount persistent storage or replace it with object storage before these files are relied on long-term.

## Safety defaults and production readiness

`AUVRA_VIDEO_GENERATION_ENABLED=false` is the safe default. Briefs, uploads, analysis, direction, plan editing, routing, quotes, approvals, UI, and mocked tests remain usable. Actual submission fails with `VIDEO_GENERATION_DISABLED` before provider spend. This implementation made no live paid generation call.

Before enabling production spend:

1. Review the registry against current provider documentation and run a minimal, explicitly approved benchmark.
2. Add the production Remotion render worker, pinned Chromium, protected asset resolver, audio mix, output endpoint/streaming, and render retry policy.
3. Add media probing/frame extraction in a sandboxed worker and content/malware scanning appropriate to the deployment.
4. Add durable background scheduling/leases for multi-instance deployment; the current in-process coordinator is restart-safe for persisted jobs but is not a distributed queue.
5. Mount persistent/object storage, define retention/deletion, and add storage integrity monitoring.
6. Run visual, brand, text-overflow, duration, codec, loudness, and final-artifact quality checks.
7. Validate Orbio request/response fields and completed-content behavior with a single low-cost benchmark; do not infer usability from `GET /models` alone.

## Configuration

- `AUVRA_VIDEO_GENERATION_ENABLED=false`
- `AUVRA_CREATIVE_DATA_FILE=./data/creative-projects.json`
- `AUVRA_CREATIVE_ASSET_DIR=./data/creative-assets`
- `AUVRA_CREATIVE_DIRECTOR_MODEL=...`
- `AUVRA_CREATIVE_VISION_MODEL=...`
- `AUVRA_VIDEO_PRICE_SAFETY_MULTIPLIER=1.15`

The existing production workspace authentication continues to protect `/api/creative`, uploads, and project state through the same `/api` gateway.
