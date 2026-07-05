/**
 * Conversion of packed 1bpp movie frames into braille-art text lines.
 */

import { pixelAt, type Movie } from "./movie.ts";

/**
 * Bit masks for the 2x4 braille dot grid, indexed as [dy][dx].
 * Unicode braille encodes dots 1-8 in this bit order within U+2800..U+28FF.
 */
const BRAILLE_BITS = [
	[0x01, 0x08],
	[0x02, 0x10],
	[0x04, 0x20],
	[0x40, 0x80],
] as const;

/**
 * Converts one movie frame to braille lines sized for a `cols` x `rows`
 * terminal cell area.
 *
 * Each cell holds a 2x4 dot grid. With a typical 1:2 terminal cell font the
 * dots are square, so source pixels map onto dots without aspect correction.
 * The video is fitted into the dot grid preserving its aspect ratio; each dot
 * lights up when at least half of the source pixels it covers are lit
 * (area-average downscaling).
 *
 * @param movie - The loaded movie
 * @param frameIndex - Frame to convert
 * @param cols - Available width in terminal cells
 * @param rows - Available height in terminal cells
 * @returns Braille lines (at most `rows`, each at most `cols` characters)
 *
 * @example
 * const lines = frameToBrailleLines(movie, 0, 80, 24)
 * console.log(lines.join("\n"))
 */
export function frameToBrailleLines(movie: Movie, frameIndex: number, cols: number, rows: number): string[] {
	const { width, height } = movie;
	if (cols < 1 || rows < 1) return [];

	// Total dot grid offered by the terminal area
	const gridW = cols * 2;
	const gridH = rows * 4;
	// Fit the video into the dot grid preserving aspect ratio
	const scale = Math.min(gridW / width, gridH / height);
	const dotW = Math.max(2, Math.floor(width * scale));
	const dotH = Math.max(4, Math.floor(height * scale));
	const usedCols = Math.ceil(dotW / 2);
	const usedRows = Math.ceil(dotH / 4);

	const lines: string[] = [];
	for (let cy = 0; cy < usedRows; cy++) {
		const codes = new Uint16Array(usedCols);
		for (let cx = 0; cx < usedCols; cx++) {
			let mask = 0;
			for (let dy = 0; dy < 4; dy++) {
				const gy = cy * 4 + dy;
				if (gy >= dotH) break;
				// Source pixel span covered by this dot row
				const sy0 = Math.floor((gy * height) / dotH);
				const sy1 = Math.max(sy0 + 1, Math.floor(((gy + 1) * height) / dotH));
				for (let dx = 0; dx < 2; dx++) {
					const gx = cx * 2 + dx;
					if (gx >= dotW) break;
					const sx0 = Math.floor((gx * width) / dotW);
					const sx1 = Math.max(sx0 + 1, Math.floor(((gx + 1) * width) / dotW));
					// Average the covered pixel block; the dot lights up at >= 50%
					let lit = 0;
					for (let sy = sy0; sy < sy1; sy++) {
						for (let sx = sx0; sx < sx1; sx++) {
							lit += pixelAt(movie, frameIndex, sx, sy);
						}
					}
					if (lit * 2 >= (sy1 - sy0) * (sx1 - sx0)) {
						mask |= BRAILLE_BITS[dy]?.[dx] ?? 0;
					}
				}
			}
			codes[cx] = 0x2800 + mask;
		}
		lines.push(String.fromCharCode(...codes));
	}
	return lines;
}
