{
  hyprland.enable = true;
  git.enable = true;
  nix-ld.enable = true;
  zoxide.enable = true;
  tmux.enable = true;
  firefox.enable = true;
  vim = {
    enable = true;
    defaultEditor = true;
  };
  gnupg.agent = {
    enable = true;
    enableSSHSupport = true;
  };
  mosh = {
    enable = true;
    openFirewall = true;
  };
}
