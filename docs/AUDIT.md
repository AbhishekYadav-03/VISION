# Audit Report

Date: 2026-11-17
Scope: full repository (`server`, `web`, `python`, configuration, documentation)

The project was a working prototype with a strong feature set but several security, correctness and performance defects. This report records what was found, what was changed, and what still requires the owner's action.

---

## Summary

| Severity | Found | Fixed | Owner action |
| --- | --- | --- | --- |
| Critical | 5 | 5 | Rotate leaked credentials |
| High | 7 | 7 | Apply database migration |
| Medium | 11 | 10 | Review optional hardening |
| Low | 8 | 8 | - |

The API now builds, boots, warms the model, and passes an end-to-end test that uploads an image, clusters faces, renames a person, creates an album, renders an MP4, and cleans up after itself.

---

## Critical

### C1. Live secrets committed to git

`server/.env` was tracked, containing a Supabase URL, anon key, **service-role key**, and the JWT signing secret. The JWT secret is also weak and human-readable.

**Fixed:** `.env` is untracked (`git rm --cached`), ignored, and replaced by `server/.env.example` with placeholders. The README and this report call out rotation.

**Owner action:** rotate the Supabase service-role/anon keys and the JWT secret in the Supabase dashboard. Removing the file now does not erase it from git history; if the repository was ever public, treat the keys as compromised. Use `git filter-repo` or BFG if history must be rewritten.

### C2. Password hashes returned to the client

Signup/login returned the full `users` row, including `hashedpassword`. The profile page even rendered the hash in its "Security" tab.

**Fixed:** `publicUser()` serialises only `email`, names and timestamps. The profile UI no longer displays the hash and explains how credentials are protected.

### C3. Broken authentication middleware

`req.headers.authorization.split(" ")` threw on any request without a header; invalid tokens produced no response (the request hung until timeout); `JWT_SECRET` was read before `dotenv` loaded, so verification used `undefined`.

**Fixed:** a single `authMiddleware` validates the scheme, verifies with the loaded secret, and returns `401` for missing/malformed/expired/invalid tokens. Express 5 forwards async errors, but the middleware is synchronous and deterministic.

### C4. Horizontal privilege escalation (IDOR)

`GET /api/photo/albums/:albumId`, the video route, and album photo lookups filtered only by album id. Anyone with a token could read or render another account's album.

**Fixed:** every album query is scoped by `email`; a mismatch returns `404`. Person galleries already scoped faces by email and now also scope the photo fetch.

### C5. Unprotected production configuration

CORS was `*`, Helmet was installed but unused, there was no rate limiting, no upload MIME/size limit, and no body limit.

**Fixed:** Helmet, configurable CORS allow-list, 1 MB JSON limit, 15 MB image limit, MIME allow-list, and per-route rate limits (auth 30/15 min, upload 30/min, video 5/min, recognition 120/min, global 600/min).

---

## High

### H1. Login and signup shared one auto-creating handler

`POST /login` with an unknown email silently created an account; `POST /signup` with an existing email logged the user in if the password matched. Neither endpoint validated input, and error responses leaked database messages.

**Fixed:** separate signup/login services with Zod schemas, `409` on duplicate signup, generic `401` on bad login, and a dummy bcrypt comparison for unknown accounts to reduce timing-based user enumeration.

### H2. Recognition passed the wrong argument type

`recognizeService` sent a JavaScript array to a `vector(512)` RPC (the clustering service stringified it correctly) and read `person.similarity`, which the RPC never returned. Live recognition could not match reliably and confidence was always `undefined`.

**Fixed:** one `toVectorLiteral()` helper validates 512 finite dimensions and is used by both services. Confidence is derived from cosine distance (`1 - distance`) and the match threshold is applied.

### H3. Per-request model loading

Each upload spawned `python.exe`, imported InsightFace, loaded the ONNX models (seconds), and each new face spawned another process just to crop an avatar. Upload latency and CPU use were dominated by cold starts.

**Fixed:** `face_worker.py` is a long-lived JSON-lines worker. The model is loaded once and warmed at boot. Cropping reuses the running process. Measured warmup: ~5.7 s once; subsequent uploads no longer pay model initialisation.

### H4. Python stdout protocol could be corrupted

The old Node bridge searched for a `===JSON_START===` marker in stdout. InsightFace writes model diagnostics to stdout, so any change in logging could make parsing fail.

**Fixed:** the worker redirects Python logging to stderr and reserves real stdout for one JSON object per line. Node parses line-by-line, ignores non-protocol output, and has per-command timeouts and crash recovery.

### H5. Album listing was N+1

For each album, two additional queries fetched the photo count and cover. Listing 50 albums meant 101 round trips.

**Fixed:** one query for albums plus one query for all links (with embedded photo URLs), grouped in memory. Constant two queries.

### H6. Face matching scanned and returned everything

`match_people` returned every person for the user sorted by distance. The API took `[0]` but the database still transferred and sorted all rows, and no vector index existed.

**Fixed:** the function returns `LIMIT 1`, the schema adds an HNSW cosine index, and tenant filtering is in the query. The migration must be applied in Supabase (owner action).

### H7. No transactional cleanup on failed uploads

A failed upload could leave an orphan photo row, an orphan storage object, or person clusters with no faces.

**Fixed:** uploads track created resources and run a compensating rollback. Temp files are always removed. Album creation deletes the album if linking fails.

---

## Medium

| # | Finding | Fix |
| --- | --- | --- |
| M1 | All routes contained business logic (a single 600-line `upload.js`) | Controllers/services/config/schemas separation, one route file per domain |
| M2 | No request validation outside a few manual checks | Zod schemas for auth, albums, ids and feed pagination |
| M3 | Inconsistent error handling and leaked internals | Typed `HttpError`, central handler, stack traces only in development |
| M4 | Client duplicated URLs and token logic in 8 files | Shared Axios client, auth helpers, `RequireAuth` |
| M5 | Webcam sent ~10 recognition requests/second with no backpressure | 750 ms sampling + in-flight guard; the API also rate-limits |
| M6 | Server-side image downloads were sequential | Bounded concurrency (4) with explicit timeouts |
| M7 | Video temp files could survive client cancellation | Close/finish handlers kill FFmpeg and remove the temp dir; render has a 15 min guard |
| M8 | No health check, structured logs or graceful shutdown | `/api/health`, leveled logger, SIGINT/SIGTERM worker disposal |
| M9 | React bundle was a single 1.48 MB chunk, including Three.js | Route-level `React.lazy`; main entry now ~240 KB, visual effects lazy |
| M10 | TypeScript build failed (React 19 `useRef` signature, unused imports) | Fixed; `npm run build` is clean |
| M11 | No root `.gitignore`; venv, uploads and runtime artifacts were untracked noise | Added root ignore rules and removed dead root `index.html`/`package.json`/`node_modules` |

---

## Low

| # | Finding | Fix |
| --- | --- | --- |
| L1 | Profile page crashed on a missing `updated_at` | Guarded display |
| L2 | Empty albums showed "Loading album..." forever | Explicit empty/error states |
| L3 | Person with no avatar produced a broken image | Initial-letter fallback |
| L4 | Upload success detection was case-sensitive and alert-driven | Inline status, progress percentage, consistent casing |
| L5 | Recognition result labels could overflow the frame | Label Y position clamped |
| L6 | No way to stop the camera; stream leaked on navigation | Stop button, track cleanup, canvas reset |
| L7 | `album_photos` could receive duplicate links | Deduplicated ids + unique constraint in schema |
| L8 | README documented a structure and setup that no longer matched | Rewritten with accurate structure, env table, API links and security notes |

---

## Verification performed

| Check | Result |
| --- | --- |
| `node --check` on every server file | pass |
| `python -m py_compile face_worker.py` | pass |
| `npm test` (9 unit tests) | pass |
| `npm run build` (TypeScript + Vite) | pass, no errors |
| API boot + `/api/health` | `ok`, `faceWorker.ready: true` |
| Face worker warmup | ~6 s on CPU (`buffalo_l`) |
| `npm run smoke -- --video` | pass; exercises signup, auth guard, upload (6 faces), feed, clustering, rename, person gallery, recognition (6 matches), album CRUD, 404 ownership, MP4 render, cleanup |
| Vite dev server + `/api` proxy | `200` on `/`, `/login`, `/gallery`; proxy reaches the API |

---

## Remaining recommendations

1. **Rotate credentials** (C1) and, if needed, purge git history.
2. **Apply `docs/database/schema.sql`** so the HNSW index and single-row RPC take effect.
3. Enable the optional RLS statements once direct browser access is ruled out.
4. Move the curated music tracks to your own bucket (the defaults reference the original project's Supabase project).
5. Consider signed URLs for photos if "public bucket" is too permissive for your threat model.
6. Add a shared store (Redis) for rate limits before running more than one API instance.
7. Add browser-level e2e tests (Playwright) for the upload and slideshow flows.
