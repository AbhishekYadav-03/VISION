'use strict';

const fsp = require('fs/promises');
const path = require('path');

const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

const config = require('../config/env');
const { mapLimit } = require('../lib/async');
const { badGateway, gatewayTimeout } = require('../lib/errors');

ffmpeg.setFfmpegPath(ffmpegPath);

const DOWNLOAD_TIMEOUT_MS = 45_000;
const ENCODE_TIMEOUT_MS = 15 * 60_000;

function escapeConcatPath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/'/g, "'\\''");
}

async function downloadFile(url, destination) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw badGateway(`Could not download album media (HTTP ${response.status})`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await fsp.writeFile(destination, buffer);
  } finally {
    clearTimeout(timer);
  }
}

function safeFilename(name) {
  const cleaned = String(name || 'album')
    .replace(/[^a-z0-9 _-]/gi, '')
    .trim()
    .slice(0, 80);
  return `${cleaned || 'album'}.mp4`;
}

/**
 * Builds a cancellable slideshow video job. `start()` downloads the media,
 * encodes the MP4 and resolves when the file is ready to stream.
 */
async function createAlbumVideoJob({ album, photos }) {
  const tempDir = await fsp.mkdtemp(path.join(config.tempRoot, 'vision-album-'));
  const outputPath = path.join(tempDir, 'album.mp4');

  let command = null;
  let encodeTimer = null;
  let cleaned = false;

  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  };

  const kill = () => {
    clearTimeout(encodeTimer);
    try {
      command?.kill('SIGKILL');
    } catch {
      // FFmpeg already exited.
    }
  };

  async function start() {
    const imagePaths = await mapLimit(
      photos,
      config.video.downloadConcurrency,
      async (photo, index) => {
        const imagePath = path.join(tempDir, `image_${String(index).padStart(4, '0')}.jpg`);
        await downloadFile(photo.url, imagePath);
        return imagePath;
      },
    );

    let audioPath = null;
    if (album.music_url) {
      audioPath = path.join(tempDir, 'audio.mp3');
      await downloadFile(album.music_url, audioPath);
    }

    const seconds = config.video.secondsPerPhoto;
    const lines = imagePaths.flatMap((imagePath) => [
      `file '${escapeConcatPath(imagePath)}'`,
      `duration ${seconds}`,
    ]);
    lines.push(`file '${escapeConcatPath(imagePaths[imagePaths.length - 1])}'`);

    const concatPath = path.join(tempDir, 'input.txt');
    await fsp.writeFile(concatPath, `${lines.join('\n')}\n`, 'utf8');

    const { width, height } = config.video;
    const filter = [
      `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
      'setsar=1',
    ].join(',');

    command = ffmpeg();
    command.input(concatPath).inputOptions(['-f concat', '-safe 0']);

    if (audioPath) {
      command.input(audioPath).inputOptions(['-stream_loop', '-1']);
    }

    const outputOptions = [
      '-map', '0:v:0',
      audioPath ? '-map' : '-an',
      ...(audioPath ? ['1:a:0'] : []),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-r', '30',
      '-pix_fmt', 'yuv420p',
      '-vf', filter,
      '-movflags', '+faststart',
    ];

    if (audioPath) {
      outputOptions.push('-c:a', 'aac', '-b:a', '128k', '-shortest');
    }

    command.outputOptions(outputOptions);

    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(encodeTimer);
        kill();
        reject(error);
      };

      encodeTimer = setTimeout(() => fail(gatewayTimeout('Video encoding timed out')), ENCODE_TIMEOUT_MS);
      encodeTimer.unref?.();

      command
        .on('start', (commandLine) => {
          // eslint-disable-next-line no-console
          require('../lib/logger').debug(`FFmpeg started: ${commandLine}`);
        })
        .on('error', (error) => {
          fail(badGateway(`Video encoding failed: ${error.message}`));
        })
        .on('end', () => {
          if (settled) return;
          settled = true;
          clearTimeout(encodeTimer);
          resolve(outputPath);
        })
        .save(outputPath);
    });
  }

  return {
    start,
    cleanup,
    kill,
    outputPath,
    filename: safeFilename(album.name),
  };
}

module.exports = { createAlbumVideoJob };
