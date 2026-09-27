{
  description = "Parsifal";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      home-manager,
      ...
    }:
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
          home-manager.nixosModules.home-manager
          ./modules/configuration.nix
          ./modules/hardware.nix
          ./modules/programs
          ./modules/orch.nix
          ./modules/greetd.nix
          ./modules/islnet.nix
          ./modules/home
        ];
      };
    };
}
