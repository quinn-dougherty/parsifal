{ pkgs, ... }: {
  programs = import ./enables.nix;

  virtualisation = {
    docker.enable = true;
    podman.enable = true;
    incus.enable = true;
  };

  environment.systemPackages = with pkgs; [
    wget
    curl
    kitty
    ghostty
    jujutsu
    gh
    spotify
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
    ripgrep
    typst 
    typstyle
    wezterm
  ];
}
