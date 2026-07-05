{
  bun,
  fetchurl,
  ffmpeg-headless,
  lib,
  stdenvNoCC,
  ...
}:
let
  packageJson = lib.importJSON ../package.json;

  # Original 480x360 shadow-art PV (niconico sm8628149), mirrored on the
  # Internet Archive. Fetched by Nix instead of by the player at runtime so
  # the download is hash-verified and shared via the store. The video and
  # music are NOT redistributed by this repository; this derivation is built
  # on the user's own machine (see NOTICE.md).
  video = fetchurl {
    url = "https://archive.org/download/nicovideo-sm8628149/nicovideo-sm8628149_4c8a655c13612a596d6b97c58797d3c622adebddc6436264e47e615fdccb9d21.mp4";
    hash = "sha256-+vUANKPwqb9fQYDnIOz2rqayHwtklysBBImGYt7HRC0=";
  };
in
stdenvNoCC.mkDerivation {
  pname = "opentui-bad-apple-assets";
  version = packageJson.version;

  src = ../.;

  nativeBuildInputs = [
    bun
    ffmpeg-headless
  ];

  # Run the same generator the player uses at runtime; it needs no
  # node_modules. The pre-fetched video is placed where the generator
  # expects it so only the ffmpeg conversion steps run.
  buildPhase = ''
    runHook preBuild
    export XDG_CACHE_HOME=$PWD/.cache
    mkdir -p .cache/opentui-bad-apple
    cp ${video} .cache/opentui-bad-apple/bad-apple.mp4
    bun run scripts/generate.ts
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out
    cp .cache/opentui-bad-apple/frames.bin.gz .cache/opentui-bad-apple/bad-apple.wav $out/
    runHook postInstall
  '';

  meta = with lib; {
    description = "Generated playback assets for opentui-bad-apple";
    platforms = platforms.all;
  };
}
