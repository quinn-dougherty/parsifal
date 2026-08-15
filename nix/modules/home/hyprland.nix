{ ... }:
{
  # The compositor itself is enabled system-side via programs.hyprland.enable
  # (see modules/programs/enables.nix). This module only owns the config files.
  #
  # We deliberately do NOT use wayland.windowManager.hyprland.settings: that
  # generator emits hyprlang, which upstream deprecated in 0.55 and will drop
  # in a future release. Shipping the files verbatim keeps the eventual port to
  # hyprland.lua a one-line change here.
  xdg.configFile = {
    "hypr/hyprland.conf".source = ./hypr/hyprland.conf;
    "hypr/bindings.conf".source = ./hypr/bindings.conf;
  };
}
