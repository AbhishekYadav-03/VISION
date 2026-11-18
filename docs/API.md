# API Reference

Base URL: `http://localhost:5000` (development) - all routes below are prefixed with `/api`.

- **Auth:** protected routes require `Authorization: Bearer <jwt>`.
- **Content type:** JSON unless marked multipart.
- **Errors:** `{ "message": string, "details"?: unknown, "error"?: string }`.
  `error` is only included for 5xx responses outside production.
- **Rate limits:** responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. Exceeding a limit returns `429` with `Retry-After`.

## Status codes

| Code | Meaning |
| --- | --- |
| 200 | OK |
| 201 | Created |
| 400 | Missing/invalid request (e.g. empty album) |
| 401 | Missing, invalid or expired token; wrong credentials |
| 404 | Resource not found or not owned by the caller |
| 413 | Upload exceeds `MAX_UPLOAD_MB` |
| 415 | Unsupported image MIME type |
| 422 | Zod validation error / undecodable image |
| 429 | Rate limit exceeded |
| 500 | Unexpected server error |
| 502 | Storage/FFmpeg failure |
| 503 | Face worker unavailable |
| 504 | Face/FFmpeg operation timed out |

---

## Health

### `GET /api/health`

Public.

```json
{
  "status": "ok",
  "service": "vision-api",
  "env": "development",
  "uptimeSeconds": 148,
  "timestamp": "2026-11-17T16:43:58.881Z",
  "faceWorker": {
    "ready": true,
    "pid": 13164,
    "pending": 0,
    "executable": "E:\\Projects\\VISION\\python\\venv\\Scripts\\python.exe",
    "model": "buffalo_l"
  }
}
```

`ready: false` means the worker is still loading the model or crashed; uploads and recognition will return `503`.

---

## Authentication

### `POST /api/auth/signup`

Creates an account. Rate limit: 30 requests / 15 min / IP.

```json
{
  "firstname": "Ada",
  "lastname": "Lovelace",
  "email": "ada@example.com",
  "password": "at-least-8-characters"
}
```

`201`:

```json
{
  "message": "Signup successful",
  "token": "<jwt>",
  "user": {
    "email": "ada@example.com",
    "firstname": "Ada",
    "lastname": "Lovelace",
    "created_at": "2026-11-17T16:00:00+00:00",
    "updated_at": "2026-11-17T16:00:00+00:00"
  }
}
```

Errors: `409` email already registered; `422` invalid email/password/name.

Passwords must be 8-72 characters (bcrypt's input limit).

### `POST /api/auth/login`

```json
{ "email": "ada@example.com", "password": "at-least-8-characters" }
```

`200` returns the same `{ message, token, user }` shape.

Errors: `401` for both unknown accounts and wrong passwords (no enumeration).

### `GET /api/auth/me`

Protected.

```json
{
  "data": {
    "email": "ada@example.com",
    "firstname": "Ada",
    "lastname": "Lovelace",
    "created_at": "...",
    "updated_at": "..."
  }
}
```

---

## Photos

### `POST /api/photo/upload`

Protected. Multipart with a single `photo` field (JPEG, PNG or WebP, max 15 MB). Rate limit: 30 / min.

```bash
curl -X POST http://localhost:5000/api/photo/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "photo=@python/test.png"
```

`201`:

```json
{
  "message": "Upload successful",
  "photoId": "b4b0…",
  "url": "https://<project>.supabase.co/storage/v1/object/public/vision/<uuid>.png",
  "facesDetected": 6
}
```

Errors: `400` no file; `413` too large; `415` unsupported type; `422` image cannot be decoded; `503` face worker unavailable.

### `GET /api/photo/feed?limit=100&offset=0`

Protected. `limit` 1-200 (default 100), `offset` >= 0.

```json
[
  { "id": "…", "email": "ada@example.com", "url": "…", "created_at": "…", "updated_at": "…" }
]
```

---

## Albums

### `POST /api/photo/albums`

Protected.

```json
{
  "name": "Summer 2026",
  "photoIds": ["<uuid>", "<uuid>"],
  "musicUrl": "https://…/track.mp3"
}
```

- `photoIds`: 1-200 ids; all must belong to the caller.
- `musicUrl`: optional valid URL. Omit or send `""` for no music.

`201`:

```json
{
  "message": "Album created successfully",
  "album": {
    "id": "…",
    "name": "Summer 2026",
    "email": "ada@example.com",
    "music_url": "https://…/track.mp3",
    "created_at": "…",
    "photoCount": 2,
    "coverUrl": "https://…"
  }
}
```

### `GET /api/photo/albums`

Protected. Two queries regardless of album count.

```json
[
  { "id": "…", "name": "Summer 2026", "music_url": "…", "created_at": "…", "photoCount": 2, "coverUrl": "…" }
]
```

### `GET /api/photo/albums/:albumId`

Protected. Returns `404` when the album does not exist **or belongs to another account**.

```json
{
  "album": { "id": "…", "name": "Summer 2026", "music_url": "…", "created_at": "…" },
  "photos": [{ "id": "…", "url": "…", "created_at": "…" }]
}
```

### `GET /api/photo/albums/:albumId/video`

Protected. Rate limit: 5 renders / min.

Renders the album as H.264 MP4 at 1280x720, 4 s per slide, with looping audio if `music_url` is set. Responds with `Content-Type: video/mp4` and `Content-Disposition: attachment`.

- `400` album is empty
- `404` not found / not owned
- `502` FFmpeg failure
- `504` render exceeded the 15 min guard
- Client abort kills FFmpeg and cleans up.

```bash
curl -L http://localhost:5000/api/photo/albums/<id>/video \
  -H "Authorization: Bearer $TOKEN" \
  -o album.mp4
```

---

## People

### `GET /api/avatars/people`

Protected.

```json
[{ "id": "…", "name": "Ada", "avatar_url": "https://…/avatars/….jpg", "created_at": "…" }]
```

`avatar_url` can be `null` when cropping failed; the client renders an initial instead.

### `PUT /api/avatars/people/:personId`

Protected. Rate limit: 60 / min.

```json
{ "name": "Ada Lovelace" }
```

Returns the updated person. `404` if the person does not belong to the caller.

### `GET /api/segregate/people/:personId/photos`

Protected. Returns photos containing that person, newest first, deduplicated.

```json
[{ "id": "…", "url": "…", "created_at": "…" }]
```

---

## Recognition

### `POST /api/recognize`

Protected. Multipart with a single `photo` field. Rate limit: 120 / min.

```json
{
  "faces": [
    {
      "bbox": [1120.89, 292.94, 1222.84, 418.09],
      "person": {
        "id": "…",
        "name": "Ada",
        "avatar_url": "https://…",
        "confidence": 0.91,
        "distance": 0.09
      }
    },
    {
      "bbox": [50, 60, 140, 170],
      "person": null
    }
  ]
}
```

`person` is `null` when the nearest cluster is beyond `FACE_MATCH_THRESHOLD`, or when no people exist yet. Nothing is stored.

---

## Validation details

- Emails are trimmed and lowercased.
- Names are 1-80 characters after trimming.
- IDs must be UUIDs (invalid ids return `422`, not a database error).
- Unknown query parameters are ignored; unknown body fields are stripped by Zod.
- Request bodies are limited to 1 MB (JSON) and `MAX_UPLOAD_MB` (images).

Example validation error:

```json
{
  "message": "Request validation failed",
  "details": [
    { "path": "password", "message": "Password must be at least 8 characters" }
  ]
}
```
