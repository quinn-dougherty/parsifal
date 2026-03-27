{ pkgs, ... }: {
  programs = import ./enables.nix;

  virtualisation.docker.enable = true;

  environment.systemPackages = with pkgs; [
    wget
    curl
    kitty
    jujutsu
    gh
    bitwarden-desktop
    ncdu
    zip
    unzip
    chezmoi
    age
    jq
    swaybg
    waybar
    wofi
    btop
    bottom
    sox
    pavucontrol
    fastfetch
  ];
}
