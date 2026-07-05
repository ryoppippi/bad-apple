{
  description = "Bad Apple!! TUI player built with OpenTUI";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    bun2nix = {
      url = "github:nix-community/bun2nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
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
        { pkgs, inputs', ... }:
        {
          packages.default = pkgs.callPackage ./nix/package.nix {
            bun2nix = inputs'.bun2nix.packages.default;
          };

          # Regenerates nix/bun.lock.nix after bun.lock changes:
          # `nix run .#update-bun-lock`
          apps.update-bun-lock = {
            type = "app";
            program = pkgs.lib.getExe (
              pkgs.writeShellApplication {
                name = "update-bun-lock";
                runtimeInputs = [ inputs'.bun2nix.packages.default ];
                text = ''
                  bun2nix -o nix/bun.lock.nix
                  printf '\n' >> nix/bun.lock.nix
                '';
              }
            );
            meta.description = "Regenerate nix/bun.lock.nix with the flake-pinned bun2nix";
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
