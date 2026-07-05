/**
 * Loading and pixel access for the packed 1bpp frame format produced by
 * scripts/generate.ts (see that file for the header layout).
 */

import { Result } from "@praha/byethrow";

/** Decoded frame pack: geometry plus the raw 1bpp frame bytes. */
export interface Movie {
	/** Source video width in pixels */
	width: number;
	/** Source video height in pixels */
	height: number;
	/** Source frame rate */
	fps: number;
	/** Number of frames in the pack */
	frameCount: number;
	/** Bytes per packed row (width / 8, rounded up) */
	rowBytes: number;
	/** Bytes per packed frame */
	frameSize: number;
	/** All frames, concatenated */
	data: Uint8Array;
	/** Playback length in seconds */
	duration: number;
}

/**
 * Parses an already-decompressed frame pack.
 *
 * @param raw - The gunzipped pack (header + frame data)
 * @returns The decoded movie, or a failure describing the corruption
 */
function parseMovie(raw: Uint8Array): Result.Result<Movie, Error> {
	const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
	if (raw[0] !== 0x42 || raw[1] !== 0x41 || raw[2] !== 0x50 || raw[3] !== 0x56) {
		return Result.fail(new Error("invalid frame pack: bad magic"));
	}
	const width = view.getUint16(6, true);
	const height = view.getUint16(8, true);
	const fps = view.getUint16(10, true);
	const frameCount = view.getUint32(12, true);
	const rowBytes = Math.ceil(width / 8);
	const frameSize = rowBytes * height;
	const data = raw.subarray(16);
	if (data.length < frameSize * frameCount) {
		return Result.fail(new Error("invalid frame pack: truncated frame data"));
	}
	return Result.succeed({ width, height, fps, frameCount, rowBytes, frameSize, data, duration: frameCount / fps });
}

/**
 * Loads and validates a gzip-compressed frame pack.
 *
 * @param path - Path to frames.bin.gz
 * @returns The decoded movie, or a failure if the file is unreadable or corrupt
 */
export function loadMovie(path: string): Result.ResultAsync<Movie, Error> {
	return Result.pipe(
		Result.try({
			try: async () => Bun.gunzipSync(await Bun.file(path).bytes()),
			catch: (cause) => new Error(`failed to read frame pack ${path}`, { cause }),
		}),
		Result.andThen(parseMovie),
	);
}

/**
 * Reads one source pixel from a packed 1bpp frame.
 *
 * @param movie - The loaded movie
 * @param frameIndex - Frame to sample
 * @param x - Pixel column
 * @param y - Pixel row
 * @returns 1 if the pixel is lit, 0 otherwise
 */
export function pixelAt(movie: Movie, frameIndex: number, x: number, y: number): number {
	const byte = movie.data[frameIndex * movie.frameSize + y * movie.rowBytes + (x >> 3)] ?? 0;
	// MSB-first within each byte, matching the packer
	return (byte >> (7 - (x & 7))) & 1;
}
