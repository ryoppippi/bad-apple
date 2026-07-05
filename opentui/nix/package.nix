{
  bun,
  bun2nix,
  ffmpeg-headless,
  lib,
  makeBinaryWrapper,
  ...
}:
let
  packageJson = lib.importJSON ../package.json;
in
bun2nix.mkDerivation {
  pname = "opentui-bad-apple";
  version = packageJson.version;

  src = ../.;

  bunDeps = bun2nix.fetchBunDeps {
    bunNix = ./bun.lock.nix;
  };

  nativeBuildInputs = [ makeBinaryWrapper ];

  buildPhase = ''
    runHook preBuild
    mkdir -p .bun-tmp .bun-install
    BUN_TMPDIR=$PWD/.bun-tmp \
    BUN_INSTALL=$PWD/.bun-install \
    ${bun}/bin/bun build --compile \
      --no-compile-autoload-bunfig \
      "./src/index.ts" \
      --outfile "opentui-bad-apple-bin"
    runHook postBuild
  '';

  # The player shells out to ffmpeg/ffprobe on first run to generate its
  # media cache, so put them on the wrapped binary's PATH.
  installPhase = ''
    runHook preInstall
    mkdir -p $out/bin
    cp -p ./opentui-bad-apple-bin $out/bin/opentui-bad-apple
    wrapProgram $out/bin/opentui-bad-apple \
      --prefix PATH : ${lib.makeBinPath [ ffmpeg-headless ]}
    runHook postInstall
  '';

  # See https://nix-community.github.io/bun2nix/building-packages/hook.html#arguments for options
  dontFixup = true;
  dontStrip = true;
  dontRunLifecycleScripts = true;

  meta = with lib; {
    description = "Bad Apple!! TUI player built with OpenTUI";
    homepage = "https://github.com/ryoppippi/bad-apple";
    license = licenses.mit;
    mainProgram = "opentui-bad-apple";
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}
