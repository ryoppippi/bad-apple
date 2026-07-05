# opentui-bad-apple

[Bad Apple!!](https://www.nicovideo.jp/watch/sm8628149) player for the terminal, built with [OpenTUI](https://opentui.com/) (`@opentui/core`).

- Renders the video as Unicode braille art, scaled to your terminal size (2×4 dots per cell — a 200×50 terminal gives you a 400×200 pixel picture)
- Plays the music through OpenTUI's built-in audio engine
- Video timing is driven by the audio mixer clock, so picture and sound stay in sync

## Requirements

- [Bun](https://bun.com)
- `ffmpeg` / `ffprobe` (only used on the first run to generate assets), e.g. via Nix:

  ```bash
  nix shell nixpkgs#ffmpeg-headless
  ```

## Usage

With Nix (no setup required — the media assets are downloaded and converted as part of the build, so playback starts immediately):

```bash
nix run github:ryoppippi/bad-apple#opentui
# or target this subflake directly
nix run 'github:ryoppippi/bad-apple?dir=opentui'
```

Or directly with Bun from this directory:

```bash
bun install
bun start
```

When run with Bun, the first start downloads the PV from the Internet Archive and generates the packed 1bpp frames plus the WAV audio track into `$XDG_CACHE_HOME/opentui-bad-apple` (default `~/.cache/opentui-bad-apple`). Subsequent runs use the cached assets and start instantly. `bun run generate` runs the same generation step on its own if you want to pre-warm or rebuild the cache, and deleting the cache directory is always safe. (The Nix package instead builds these assets as a derivation and points the player at them via `OPENTUI_BAD_APPLE_ASSETS`.)

| Key   | Action        |
| ----- | ------------- |
| `q` / `esc` | quit    |
| `r`   | restart       |
| `m`   | mute toggle   |

Pass `--muted` to start with the volume at zero: `bun start --muted`.

## How it works

1. `scripts/generate.ts` downloads the original 480×360 shadow-art PV, extracts the audio track as WAV, and thresholds every frame to a 1-bit-per-pixel bitmap (6573 frames compress to ~6 MiB gzipped).
2. `src/index.ts` converts the current frame to braille characters at render time, fitted to the terminal's dot grid with area-average downscaling, and draws it with a custom OpenTUI `Renderable`.

## Licence

The code is MIT licensed (see the repository [LICENSE](../LICENSE)). The video and music are **not** distributed with this repository — they are downloaded and converted locally on first run. See [NOTICE.md](../NOTICE.md) for attribution and terms covering the Bad Apple!! content.
