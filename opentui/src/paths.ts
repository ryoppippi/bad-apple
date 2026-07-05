/**
 * Locations of the playback assets.
 *
 * Two modes:
 *
 * - **Pre-supplied** (`OPENTUI_BAD_APPLE_ASSETS` set): the assets were built
 *   externally — e.g. by the Nix package, which downloads the video and runs
 *   the conversion at build time — and live in a read-only directory. The
 *   player must not try to (re)generate them.
 * - **Self-generated** (default): assets are generated on first run into the
 *   user's cache directory rather than the repository or /tmp: they survive
 *   reboots (regenerating means a ~22 MB download plus an ffmpeg pass), are
 *   shared no matter where the player is run from, and can always be deleted
 *   safely because the player regenerates them on demand.
 */

import { homedir } from "node:os";
import { join } from "node:path";

/** Cache root following the XDG Base Directory convention. */
const cacheRoot = process.env["XDG_CACHE_HOME"] ?? join(homedir(), ".cache");

/** Directory for self-generated Bad Apple assets. */
export const CACHE_DIR = join(cacheRoot, "opentui-bad-apple");

/** Source video downloaded from the Internet Archive. */
export const VIDEO_PATH = join(CACHE_DIR, "bad-apple.mp4");

/** Directory of externally built assets, if provided. */
const assetsOverride = process.env["OPENTUI_BAD_APPLE_ASSETS"];

/** True when assets come from a read-only external directory. */
export const ASSETS_PRESUPPLIED = assetsOverride !== undefined;

/** Audio track extracted from the video (48 kHz 16-bit PCM WAV). */
export const AUDIO_PATH = join(assetsOverride ?? CACHE_DIR, "bad-apple.wav");

/** Packed 1bpp frame data (see scripts/generate.ts for the format). */
export const FRAMES_PATH = join(assetsOverride ?? CACHE_DIR, "frames.bin.gz");
