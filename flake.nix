{
  description = "bad apple collection by ryoppippi";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    opentui = {
      url = "path:./opentui";
      inputs.nixpkgs.follows = "nixpkgs";
      inputs.flake-parts.follows = "flake-parts";
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

      # Each player lives in its own subflake; re-export them here so
      # everything is runnable from the repository root, e.g.
      # `nix run github:ryoppippi/bad-apple#opentui`.
      perSystem =
        { inputs', ... }:
        {
          packages = {
            default = inputs'.opentui.packages.default;
            opentui = inputs'.opentui.packages.default;
          };

          devShells.default = inputs'.opentui.devShells.default;
        };
    };
}
