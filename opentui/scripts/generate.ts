#!/usr/bin/env bun
/**
 * Generates playback assets for the Bad Apple TUI player.
 *
 * Pipeline:
 *   1. Download the original shadow-art PV (480x360, 30 fps) from the
 *      Internet Archive if it is not present locally.
 *   2. Extract the audio track to a WAV file (played via opentui's audio engine).
 *   3. Decode every video frame to grayscale with ffmpeg, threshold it to
 *      black & white, and pack it as a 1-bit-per-pixel bitmap.
 *
 * The packed frames are written to `assets/frames.bin.gz`:
 *
 *   | offset | size | field                         |
 *   |--------|------|-------------------------------|
 *   | 0      | 4    | magic "BAPV"                  |
 *   | 4      | 1    | format version (1)            |
 *   | 5      | 1    | reserved (0)                  |
 *   | 6      | 2    | width in pixels (LE)          |
 *   | 8      | 2    | height in pixels (LE)         |
 *   | 10     | 2    | frames per second (LE)        |
 *   | 12     | 4    | frame count (LE)              |
 *   | 16     | ...  | frames, 1bpp, rows padded to a byte boundary |
 *
 * All generated assets stay out of git (see .gitignore): the video and music
 * belong to their respective rights holders, so this repository only ships
 * code and every user generates the data locally.
 */

import { $ } from "bun";
import { AUDIO_PATH, CACHE_DIR, FRAMES_PATH, VIDEO_PATH } from "../src/paths.ts";

/** Internet Archive mirror of the original PV (nicovideo sm8628149, 480x360). */
const VIDEO_URL =
	"https://archive.org/download/nicovideo-sm8628149/nicovideo-sm8628149_4c8a655c13612a596d6b97c58797d3c622adebddc6436264e47e615fdccb9d21.mp4";

/** Luminance (0-255) at or above which a pixel becomes a lit braille dot. */
const THRESHOLD = 128;

/**
 * Resolves an executable from PATH.
 *
 * @param name - Executable name, e.g. "ffmpeg"
 * @returns Absolute path to the executable
 * @throws If the executable is not on PATH, with a hint on how to get it
 */
function requireTool(name: string): string {
	const path = Bun.which(name);
	if (path === null) {
		throw new Error(
			`${name} not found in PATH.\n` +
				`hint: run inside a nix shell, e.g.\n` +
				`  nix shell nixpkgs#ffmpeg-headless --command bun start`,
		);
	}
	return path;
}

/** Downloads the source video unless it already exists. */
async function ensureVideo(): Promise<void> {
	if (await Bun.file(VIDEO_PATH).exists()) {
		console.log(`video: ${VIDEO_PATH} (cached)`);
		return;
	}
	console.log(`video: downloading ${VIDEO_URL}`);
	const res = await fetch(VIDEO_URL);
	if (!res.ok) {
		throw new Error(`download failed: HTTP ${res.status}`);
	}
	await Bun.write(VIDEO_PATH, res);
	console.log(`video: saved to ${VIDEO_PATH}`);
}

/** Extracts the audio track as 48 kHz 16-bit PCM WAV unless it already exists. */
async function ensureAudio(ffmpeg: string): Promise<void> {
	if (await Bun.file(AUDIO_PATH).exists()) {
		console.log(`audio: ${AUDIO_PATH} (cached)`);
		return;
	}
	console.log("audio: extracting WAV track");
	const proc = Bun.spawn(
		[ffmpeg, "-v", "error", "-y", "-i", VIDEO_PATH, "-vn", "-acodec", "pcm_s16le", "-ar", "48000", AUDIO_PATH],
		{ stdout: "inherit", stderr: "inherit" },
	);
	if ((await proc.exited) !== 0) {
		throw new Error("ffmpeg audio extraction failed");
	}
	console.log(`audio: saved to ${AUDIO_PATH}`);
}

/**
 * Probes the video stream geometry.
 *
 * @returns Width, height, and frames per second of the first video stream
 */
async function probeVideo(ffprobe: string): Promise<{ width: number; height: number; fps: number }> {
	const proc = Bun.spawn(
		[
			ffprobe,
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-show_entries",
			"stream=width,height,r_frame_rate",
			"-of",
			"json",
			VIDEO_PATH,
		],
		{ stdout: "pipe", stderr: "inherit" },
	);
	const out = (await new Response(proc.stdout).json()) as {
		streams?: { width: number; height: number; r_frame_rate: string }[];
	};
	if ((await proc.exited) !== 0) {
		throw new Error("ffprobe failed");
	}
	const stream = out.streams?.[0];
	if (stream === undefined) {
		throw new Error("ffprobe: no video stream found");
	}
	// r_frame_rate is a rational like "30/1"
	const [num = 0, den = 1] = stream.r_frame_rate.split("/").map(Number);
	return { width: stream.width, height: stream.height, fps: num / den };
}

/**
 * Decodes all frames as raw grayscale, thresholds them to 1bpp bitmaps, and
 * writes the gzip-compressed frame pack.
 */
async function packFrames(ffmpeg: string, width: number, height: number, fps: number): Promise<void> {
	if (await Bun.file(FRAMES_PATH).exists()) {
		console.log(`frames: ${FRAMES_PATH} (cached)`);
		return;
	}
	console.log(`frames: decoding ${width}x${height}@${fps} to 1bpp`);

	const graySize = width * height;
	const rowBytes = Math.ceil(width / 8);
	const packedSize = rowBytes * height;

	const proc = Bun.spawn([ffmpeg, "-v", "error", "-i", VIDEO_PATH, "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"], {
		stdout: "pipe",
		stderr: "inherit",
	});

	const packedFrames: Uint8Array[] = [];
	// Rolling buffer that accumulates stdout chunks until a full frame is available
	let pending = new Uint8Array(0);

	for await (const chunk of proc.stdout) {
		// Append the new chunk to whatever partial frame data is left over
		const merged = new Uint8Array(pending.length + chunk.length);
		merged.set(pending);
		merged.set(chunk, pending.length);
		pending = merged;

		// Slice off as many complete frames as the buffer now holds
		let offset = 0;
		while (pending.length - offset >= graySize) {
			const gray = pending.subarray(offset, offset + graySize);
			const packed = new Uint8Array(packedSize);
			// Pack 8 horizontal pixels into one byte, MSB = leftmost pixel
			for (let y = 0; y < height; y++) {
				const rowIn = y * width;
				const rowOut = y * rowBytes;
				for (let xByte = 0; xByte < rowBytes; xByte++) {
					const xBase = xByte << 3;
					let bits = 0;
					// Stop at the frame edge when the width is not a multiple of 8
					const xEnd = Math.min(8, width - xBase);
					for (let i = 0; i < xEnd; i++) {
						if ((gray[rowIn + xBase + i] ?? 0) >= THRESHOLD) {
							bits |= 0x80 >> i;
						}
					}
					packed[rowOut + xByte] = bits;
				}
			}
			packedFrames.push(packed);
			offset += graySize;
			if (packedFrames.length % 1000 === 0) {
				console.log(`frames: packed ${packedFrames.length}`);
			}
		}
		pending = pending.slice(offset);
	}
	if ((await proc.exited) !== 0) {
		throw new Error("ffmpeg frame decoding failed");
	}

	const frameCount = packedFrames.length;
	console.log(`frames: packed ${frameCount} total, compressing`);

	// Assemble header + all frames into one buffer, then gzip it
	const total = new Uint8Array(16 + packedSize * frameCount);
	const view = new DataView(total.buffer);
	total.set([0x42, 0x41, 0x50, 0x56]); // "BAPV"
	view.setUint8(4, 1);
	view.setUint16(6, width, true);
	view.setUint16(8, height, true);
	view.setUint16(10, Math.round(fps), true);
	view.setUint32(12, frameCount, true);
	for (const [i, frame] of packedFrames.entries()) {
		total.set(frame, 16 + i * packedSize);
	}
	const gzipped = Bun.gzipSync(total, { level: 6 });
	await Bun.write(FRAMES_PATH, gzipped);
	console.log(`frames: wrote ${FRAMES_PATH} (${(gzipped.length / 1024 / 1024).toFixed(1)} MiB)`);
}

/**
 * Ensures all playback assets exist, generating whatever is missing.
 * Existing assets are kept as-is, so repeated calls are cheap no-ops.
 *
 * @throws If ffmpeg/ffprobe are unavailable or any pipeline step fails
 */
export async function generate(): Promise<void> {
	await $`mkdir -p ${CACHE_DIR}`;
	const ffmpeg = requireTool("ffmpeg");
	const ffprobe = requireTool("ffprobe");
	await ensureVideo();
	await ensureAudio(ffmpeg);
	const { width, height, fps } = await probeVideo(ffprobe);
	await packFrames(ffmpeg, width, height, fps);
}

if (import.meta.main) {
	try {
		await generate();
		console.log("done. run `bun start` to play.");
	} catch (error) {
		console.error(`error: ${error instanceof Error ? error.message : error}`);
		process.exit(1);
	}
}
