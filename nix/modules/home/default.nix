{ hostConfig, ... }:
{
  home-manager = {
    useGlobalPkgs = true;
    useUserPackages = true;

    # Existing dotfiles are renamed rather than blocking activation.
    backupFileExtension = "hm-bak";

    extraSpecialArgs = { inherit hostConfig; };

    users.${hostConfig.username} = import ./q.nix;
  };
}
