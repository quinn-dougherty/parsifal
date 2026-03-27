{
  description = "Parsifal";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
      hostConfig = builtins.fromTOML (builtins.readFile ./config.toml);
    in
    {
      nixosConfigurations.${hostConfig.hostname} = nixpkgs.lib.nixosSystem {
        inherit system;
        specialArgs = { inherit hostConfig; };
        modules = [
          ./modules/configuration.nix
	  ./modules/hardware.nix
	  ./modules/programs
	  ./modules/orch.nix
	  ./modules/greetd.nix
        ];
      };
    };
}
