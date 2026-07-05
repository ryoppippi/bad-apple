{
  description = "Bad Apple!! TUI player built with OpenTUI";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
  };

  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      perSystem =
        { pkgs, ... }:
        {
          # Runs the player from a writable copy of the project in the user's
          # cache directory: the nix store is read-only, but bun needs to
          # install node_modules next to package.json, and the player itself
          # caches generated media in the same cache root.
          packages.default = pkgs.writeShellApplication {
            name = "opentui-bad-apple";
            runtimeInputs = [
              pkgs.bun
              pkgs.ffmpeg-headless
              pkgs.coreutils
            ];
            text = ''
              src="${./.}"
              app="''${XDG_CACHE_HOME:-$HOME/.cache}/opentui-bad-apple/app"
              mkdir -p "$app"
              cp -r --no-preserve=mode,ownership "$src"/. "$app"/
              cd "$app"
              bun install --frozen-lockfile --silent
              exec bun run src/index.ts "$@"
            '';
          };

          devShells.default = pkgs.mkShell {
            packages = [
              pkgs.bun
              pkgs.ffmpeg-headless
            ];
          };
        };
    };
}
