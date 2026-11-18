#!/usr/bin/env node

/**
 * End-to-end smoke test against a running API.
 *
 *   npm run test:smoke
 *   npm run test:smoke -- --video --keep
 *
 * Creates a disposable account, exercises the real face pipeline, then removes
 * all database rows and storage objects it created.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");

dotenv.config({ path: path.join(serverRoot, ".env"), quiet: true });

const baseUrl = (process.env.SMOKE_BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const imagePath = process.env.SMOKE_IMAGE || path.resolve(serverRoot, "../python/test.png");
const args = new Set(process.argv.slice(2));
const keepData = args.has("--keep");
const testVideo = args.has("--video");

const email = `vision.smoke.${Date.now()}@example.com`;
const password = "smoke-test-password-123";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let token = "";
const created = { photoIds: [], personIds: [], photoObjects: [], avatarObjects: [], albumIds: [] };

function log(step, detail = "") {
  console.log(`✓ ${step}${detail ? ` - ${detail}` : ""}`);
}

async function request(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const text = await response.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Binary or non-JSON response.
  }

  return { response, data };
}

async function uploadImage() {
  const buffer = await fs.readFile(imagePath);
  const form = new FormData();
  form.append("photo", new Blob([buffer], { type: "image/png" }), "smoke.png");

  const { response, data } = await request("/api/photo/upload", { method: "POST", body: form });
  if (!response.ok) throw new Error(`Upload failed (${response.status}): ${JSON.stringify(data)}`);
  return data;
}

function storagePath(url, bucket) {
  const marker = `/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(url.slice(index + marker.length));
}

async function cleanup() {
  if (keepData) {
    console.log(`\nKept smoke account for inspection: ${email}`);
    return;
  }

  for (const bucket of ["vision", "avatars"]) {
    const objects = (bucket === "vision" ? created.photoObjects : created.avatarObjects)
      .filter(Boolean);
    if (objects.length) {
      await supabase.storage.from(bucket).remove(objects).catch(() => {});
    }
  }

  await supabase.from("albums").delete().eq("email", email);
  await supabase.from("photos").delete().eq("email", email);
  await supabase.from("people").delete().eq("email", email);
  await supabase.from("users").delete().eq("email", email);

  console.log(`\nCleaned up smoke account ${email}`);
}

async function main() {
  console.log(`VISION smoke test against ${baseUrl}\n`);

  const health = await request("/api/health");
  if (!health.response.ok) throw new Error(`Health check failed: ${health.response.status}`);
  log("health", `face worker ready=${health.data.faceWorker.ready}`);

  const unauthorized = await request("/api/photo/feed");
  if (unauthorized.response.status !== 401) throw new Error("Protected route did not return 401");
  log("auth guard");

  const signup = await request("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ firstname: "Smoke", lastname: "Test", email, password }),
  });
  if (!signup.response.ok) throw new Error(`Signup failed (${signup.response.status}): ${JSON.stringify(signup.data)}`);
  token = signup.data.token;
  if (!token) throw new Error("Signup did not return a token");
  if (JSON.stringify(signup.data).includes("hashedpassword")) throw new Error("Signup response leaked a password hash");
  log("signup", email);

  const me = await request("/api/auth/me");
  if (!me.response.ok || me.data.data.email !== email) throw new Error("Profile endpoint failed");
  log("profile");

  const invalidLogin = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "wrong-password" }),
  });
  if (invalidLogin.response.status !== 401) throw new Error("Wrong password was not rejected");
  log("invalid password rejected");

  const upload = await uploadImage();
  created.photoIds.push(upload.photoId);
  created.photoObjects.push(storagePath(upload.url, "vision"));
  log("upload + face indexing", `${upload.facesDetected} faces`);

  const feed = await request("/api/photo/feed");
  if (!feed.response.ok || feed.data.length !== 1) throw new Error("Feed did not return the uploaded photo");
  log("feed");

  const people = await request("/api/avatars/people");
  if (!people.response.ok || people.data.length < 1) throw new Error("People clustering returned no person");
  for (const person of people.data) {
    created.personIds.push(person.id);
    if (person.avatar_url) created.avatarObjects.push(storagePath(person.avatar_url, "avatars"));
  }
  log("people clusters", `${people.data.length}`);

  const renamed = await request(`/api/avatars/people/${people.data[0].id}`, {
    method: "PUT",
    body: JSON.stringify({ name: "Smoke Person" }),
  });
  if (!renamed.response.ok || renamed.data.name !== "Smoke Person") throw new Error("Renaming a person failed");
  log("rename person");

  const personPhotos = await request(`/api/segregate/people/${people.data[0].id}/photos`);
  if (!personPhotos.response.ok || personPhotos.data.length < 1) throw new Error("Person gallery is empty");
  log("person gallery");

  const frameBuffer = await fs.readFile(imagePath);
  const frameForm = new FormData();
  frameForm.append("photo", new Blob([frameBuffer], { type: "image/png" }), "frame.png");
  const recognize = await request("/api/recognize", { method: "POST", body: frameForm });
  if (!recognize.response.ok) throw new Error(`Recognition failed (${recognize.response.status})`);
  if (!Array.isArray(recognize.data.faces)) throw new Error("Recognition returned an invalid payload");
  log("live recognition", `${recognize.data.faces.length} faces matched`);

  const album = await request("/api/photo/albums", {
    method: "POST",
    body: JSON.stringify({
      name: "Smoke Album",
      photoIds: created.photoIds,
      musicUrl: "",
    }),
  });
  if (!album.response.ok) throw new Error(`Album creation failed: ${JSON.stringify(album.data)}`);
  created.albumIds.push(album.data.album.id);
  log("create album");

  const albums = await request("/api/photo/albums");
  if (!albums.response.ok || albums.data.length !== 1) throw new Error("Album listing failed");
  if (albums.data[0].photoCount !== 1 || !albums.data[0].coverUrl) throw new Error("Album stats are wrong");
  log("album listing with cover");

  const albumDetail = await request(`/api/photo/albums/${album.data.album.id}`);
  if (!albumDetail.response.ok || albumDetail.data.photos.length !== 1) throw new Error("Album detail failed");
  log("album detail");

  const missing = await request("/api/photo/albums/00000000-0000-0000-0000-000000000000");
  if (missing.response.status !== 404) throw new Error("Unknown album did not return 404");
  log("ownership/404 guard");

  if (testVideo) {
    const video = await fetch(`${baseUrl}/api/photo/albums/${album.data.album.id}/video`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!video.ok) throw new Error(`Video render failed (${video.status})`);
    const buffer = Buffer.from(await video.arrayBuffer());
    if (buffer.length < 1000) throw new Error("Rendered video is unexpectedly small");
    log("video render", `${Math.round(buffer.length / 1024)} KB`);
  }

  console.log("\nAll smoke checks passed.");
}

try {
  await main();
} catch (error) {
  console.error(`\n✗ Smoke test failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
