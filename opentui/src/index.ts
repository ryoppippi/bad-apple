/**
 * Bad Apple!! TUI player built on @opentui/core.
 *
 * Renders the pre-packed 1bpp frame data (see scripts/generate.ts) as braille
 * characters scaled to the current terminal size, and plays the music through
 * opentui's audio engine. Video timing is derived from the audio mixer clock
 * so picture and sound stay in sync.
 *
 * Keys: q / esc — quit, r — restart, m — mute toggle.
 * Flags: --muted — start with the master volume at zero.
 */

import {
	createCliRenderer,
	Renderable,
	RGBA,
	setupAudio,
	TextRenderable,
	type RenderContext,
	type RenderableOptions,
} from "@opentui/core";
import { Result } from "@praha/byethrow";
import { generate } from "../scripts/generate.ts";
import { frameToBrailleLines } from "./braille.ts";
import { loadMovie, type Movie } from "./movie.ts";
import { ASSETS_PRESUPPLIED, AUDIO_PATH, FRAMES_PATH } from "./paths.ts";

const SAMPLE_RATE = 48000;

/**
 * Renderable that draws one movie frame as braille art, letterboxed and
 * centred inside its own layout box.
 */
class BrailleVideoRenderable extends Renderable {
	private movie: Movie;
	private _frameIndex = 0;
	// Cache: rebuilding the braille strings is only needed when the frame or
	// the terminal size changes, not on every render pass
	private cachedLines: string[] = [];
	private cachedFrame = -1;
	private cachedW = -1;
	private cachedH = -1;
	private fg = RGBA.fromInts(255, 255, 255);

	constructor(ctx: RenderContext, options: RenderableOptions, movie: Movie) {
		super(ctx, { ...options, live: true });
		this.movie = movie;
	}

	/** Frame to display; set by the playback loop. */
	set frameIndex(value: number) {
		if (value !== this._frameIndex) {
			this._frameIndex = value;
			this.requestRender();
		}
	}

	protected override renderSelf(buffer: Parameters<Renderable["renderSelf"]>[0]): void {
		const cols = this.width;
		const rows = this.height;
		if (cols < 2 || rows < 1 || this.movie.frameCount === 0) return;

		if (this._frameIndex !== this.cachedFrame || cols !== this.cachedW || rows !== this.cachedH) {
			this.cachedLines = frameToBrailleLines(this.movie, this._frameIndex, cols, rows);
			this.cachedFrame = this._frameIndex;
			this.cachedW = cols;
			this.cachedH = rows;
		}

		// Centre the letterboxed video inside this renderable's box
		const offsetX = this.x + Math.floor((cols - (this.cachedLines[0]?.length ?? 0)) / 2);
		const offsetY = this.y + Math.floor((rows - this.cachedLines.length) / 2);
		for (const [i, line] of this.cachedLines.entries()) {
			buffer.drawText(line, offsetX, offsetY + i, this.fg);
		}
	}
}

/**
 * Formats seconds as m:ss for the status bar.
 *
 * @example formatTime(83) // "1:23"
 */
function formatTime(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${s.toString().padStart(2, "0")}`;
}

// First run: generate any missing assets (video download + ffmpeg conversion)
// before the TUI takes over the screen. Cached assets make this a no-op, and
// externally supplied assets (e.g. built by Nix) are used as-is.
if (!(await Bun.file(FRAMES_PATH).exists()) || !(await Bun.file(AUDIO_PATH).exists())) {
	if (ASSETS_PRESUPPLIED) {
		if (!(await Bun.file(FRAMES_PATH).exists())) {
			console.error(`error: OPENTUI_BAD_APPLE_ASSETS is set but ${FRAMES_PATH} does not exist.`);
			process.exit(1);
		}
	} else {
		console.log("generating missing assets (first run only)...");
		const generated = await generate();
		if (Result.isFailure(generated)) {
			if (!(await Bun.file(FRAMES_PATH).exists())) {
				console.error(`error: could not generate frame data: ${generated.error.message}`);
				process.exit(1);
			}
			// Frames are enough to play; missing audio just means a silent video
			console.warn(`warning: no audio track (${generated.error.message}); playing video only`);
		}
	}
}
const loaded = await loadMovie(FRAMES_PATH);
if (Result.isFailure(loaded)) {
	console.error(`error: ${loaded.error.message}\nhint: delete the file and rerun to regenerate it.`);
	process.exit(1);
}
const movie = loaded.value;

const renderer = await createCliRenderer({
	exitOnCtrlC: true,
	targetFps: 60,
	backgroundColor: "#000000",
});

const video = new BrailleVideoRenderable(renderer, { id: "video", flexGrow: 1, width: "100%" }, movie);
const status = new TextRenderable(renderer, {
	id: "status",
	height: 1,
	width: "100%",
	content: "",
	fg: "#888888",
});
renderer.root.add(video);
renderer.root.add(status);

// --- audio ---
// autoStart is required: without it the engine never runs, no sound plays,
// and the mixer clock used for video timing stays at zero
const audio = setupAudio({ sampleRate: SAMPLE_RATE, autoStart: true });
// Audio extends EventEmitter and emits "error"; without a listener an engine
// failure would crash the process instead of degrading to silent playback
let audioFailed = false;
audio.on("error", () => {
	audioFailed = true;
});
const sound = (await Bun.file(AUDIO_PATH).exists()) ? await audio.loadSoundFile(AUDIO_PATH) : null;
let muted = process.argv.includes("--muted");
if (muted) {
	audio.setMasterVolume(0);
}
let voice: number | null = null;
// Mixer frame counter value at the moment playback (re)started; the mixer
// keeps running between plays, so the clock is the delta divided by the rate
let mixerBase = 0n;
// Wall-clock fallback used when audio is unavailable
let wallBase = performance.now();

/** Current playback position in seconds, preferring the audio mixer clock. */
function playbackTime(): number {
	const stats = audioFailed ? null : audio.getStats();
	if (sound !== null && stats !== null && stats.framesMixed > mixerBase) {
		return Number(stats.framesMixed - mixerBase) / SAMPLE_RATE;
	}
	// Wall-clock fallback for when audio is unavailable or not yet mixing
	return (performance.now() - wallBase) / 1000;
}

/** Starts (or restarts) audio and video from the beginning. */
function restart(): void {
	if (voice !== null) audio.stopVoice(voice);
	mixerBase = audio.getStats()?.framesMixed ?? 0n;
	wallBase = performance.now();
	if (sound !== null) {
		voice = audio.play(sound);
	}
}

function shutdown(): void {
	audio.dispose();
	renderer.destroy();
	process.exit(0);
}

renderer.keyInput.on("keypress", (key) => {
	switch (key.name) {
		case "q":
		case "escape":
			shutdown();
			break;
		case "r":
			restart();
			break;
		case "m":
			muted = !muted;
			audio.setMasterVolume(muted ? 0 : 1);
			break;
	}
});

renderer.setFrameCallback(async () => {
	let t = playbackTime();
	// Loop: restart audio and clock together when the video ends
	if (t >= movie.duration) {
		restart();
		t = 0;
	}
	video.frameIndex = Math.min(Math.floor(t * movie.fps), movie.frameCount - 1);
	const speaker = sound === null || audioFailed ? "no audio" : muted ? "muted" : "playing";
	status.content = ` Bad Apple!! ${formatTime(t)} / ${formatTime(movie.duration)}  [${speaker}]  q:quit r:restart m:mute`;
});

restart();
renderer.start();
