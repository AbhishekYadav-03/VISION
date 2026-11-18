# Troubleshooting

## API will not start

### `SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured`

Create `server/.env` from `server/.env.example` and fill both values. Restart the API (env is read once at boot).

### `JWT_SECRET must be set in production`

Export a long random value:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

In development a missing secret produces a warning and an ephemeral secret; tokens become invalid after every restart.

### `EADDRINUSE: address already in use :::5000`

Something is already listening on the API port.

```bash
# Windows (PowerShell)
Get-NetTCPConnection -LocalPort 5000 -State Listen | Select-Object OwningProcess
taskkill /PID <pid> /F

# macOS / Linux
lsof -i :5000
kill <pid>
```

`npm run dev` now detects an API already running on port 5000 and stops with instructions instead of silently reusing it. Run `npm run stop` first (terminates API, web, nodemon and the Python worker), or `npm run dev -- --reuse` to start only the web client.

Or change `PORT` and update `web/vite.config.ts` (`server.proxy`) to match.

### `.env` values look truncated or corrupted

A missing trailing newline can cause an appended line to merge into the last value. Ensure the file ends with a newline and keep one `KEY=value` per line. Verify without printing secrets:

```bash
node -e "require('dotenv').config({path:'server/.env'}); console.log(Object.keys(process.env).filter(k=>k.startsWith('SUPABASE')))"
```

---

## Supabase errors

### `Invalid API key`

- Confirm the key belongs to the same project as `SUPABASE_URL`.
- The service key is a long JWT; copying it with a line break or an appended line corrupts it.
- If the key was rotated, update `.env` and restart.
- The anon key cannot replace the service key; it is subject to RLS and cannot write.

### `relation "public.users" does not exist`

Run [`docs/database/schema.sql`](database/schema.sql) in the SQL editor.

### `function match_people(vector, text) does not exist`

The original project used a different signature. Re-run the schema file; it replaces the function with the current `vector(512), text` version.

### Storage upload fails / `Bucket not found`

Create the `vision` and `avatars` buckets (public read). Bucket names are configurable with `PHOTOS_BUCKET`/`AVATARS_BUCKET`.

### Photos upload but the feed is empty

Check the JWT's `email` claim matches the `email` column on the rows. The API filters by the authenticated email, not by URL or id.

---

## Face worker / Python

### `faceWorker.ready: false` in `/api/health`

Read the API logs. Common causes:

| Log | Fix |
| --- | --- |
| `Could not spawn face worker (...)` | Wrong interpreter path; set `PYTHON_EXECUTABLE` in `server/.env` |
| `OpenCV could not be imported` | Activate the venv and `pip install -r python/requirements.txt` |
| `InsightFace could not be initialised` | Missing ONNX models or incompatible `insightface`/`numpy`; reinstall the venv |
| `Face worker stopped (code=...)` | Inspect the stderr tail in debug logs; restart the API |

Test the worker directly:

```bash
python python/services/face_worker.py
# type: {"id":1,"cmd":"ping"} then Enter
# expect: {"id":1,"ok":true,"ready":true}
```

### First upload takes a long time

The first run downloads the `buffalo_l` model pack (~280 MB) to `~/.insightface/models`. It happens once per machine. With `FACE_WARMUP=true` it happens at boot instead of during the first upload.

### `Specified provider 'CUDAExecutionProvider' is not in available provider names`

You have `FACE_CTX_ID>=0` without `onnxruntime-gpu`. Set `FACE_CTX_ID=-1` for CPU, or install the GPU runtime:

```bash
pip uninstall onnxruntime
pip install onnxruntime-gpu
```

### Face clustering is too aggressive or splits one person

Tune `FACE_MATCH_THRESHOLD`:

- two different people merged -> lower it (try `0.5`)
- one person split into duplicates -> raise it (try `0.65`)

Re-cluster only future uploads; existing relationships are not recomputed automatically.

### `Could not read image` / `422`

HEIC, CMYK JPEG and some 16-bit PNGs are not decoded by OpenCV. Convert to standard sRGB JPEG or PNG.

---

## Video rendering

### `502 Video encoding failed`

The API bundles FFmpeg, so the binary path should not be the issue. Common causes are an unreachable image URL, a corrupt download, or unsupported audio. Check the API logs for the FFmpeg stderr message.

Verify the bundled binary:

```bash
node -e "console.log(require('@ffmpeg-installer/ffmpeg').path)"
```

### Video has no audio

- The album's `music_url` may be empty (`No Music` option stores an empty string).
- The audio URL must be directly downloadable (a public MP3, not a streaming page).
- Rendering is limited to 5 requests/minute; `429` means wait.

### Render never finishes

The endpoint has a 15-minute guard and the client can cancel. If the process is killed hard, check the OS temp directory for `vision-album-*` folders and remove stale ones.

---

## Web client

### CORS errors in development

The API accepts any `http://localhost:<port>` / `http://127.0.0.1:<port>` origin when `NODE_ENV` is not `production`, so Vite falling back from 5173 to 5174 (or 5175) still works.

In production, `CORS_ORIGIN` must list every allowed origin (comma-separated). A rejected origin now returns `403 Origin ... is not allowed. Add it to CORS_ORIGIN in server/.env.` instead of an opaque `500`.

### `401` immediately after login

- The token may be from an earlier secret; sign in again.
- Server and client clocks must be reasonably synchronised for JWT expiry checks.
- In production, `JWT_SECRET` must be stable across restarts and instances.

### Blank page after a deploy

Set `VITE_API_URL` **before** `npm run build`; Vite inlines `VITE_*` variables at build time. Also configure the static host to serve `index.html` for unknown paths (SPA fallback).

### TypeScript errors after changing UI code

```bash
npm --prefix web run build
```

`tsc -b` runs before Vite, so type errors block the build intentionally.

---

## Tests

### `Cannot find module '...\server\test'`

The test script targets explicit files:

```bash
node --test test/helpers.test.js
```

Add new files to the script if you create more test suites.

### Smoke test fails at signup with `Invalid API key`

See [Supabase errors](#invalid-api-key). The smoke test uses the same `server/.env` as the API.

### Smoke test leaves data behind

It creates `vision.smoke.<timestamp>@example.com` and deletes it in `finally`. Use `--keep` to intentionally inspect the account. If a run was killed, remove rows and storage objects for that email manually.

---

## Still stuck?

1. `GET /api/health` - is the API and worker up?
2. API logs at `LOG_LEVEL=debug` - the failing step is logged with a request id-free but descriptive message.
3. Reproduce with curl from [docs/API.md](API.md).
4. `npm test` and `npm run smoke` to distinguish environment problems from application problems.
