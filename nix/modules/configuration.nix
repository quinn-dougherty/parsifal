{ pkgs, hostConfig, ... }:
{
  boot.loader = {
    systemd-boot.enable = true;
    efi.canTouchEfiVariables = true;
  };

  hardware.bluetooth.enable = true;

  networking = {
    hostName = hostConfig.hostname;
    networkmanager.enable = true;
    firewall.trustedInterfaces = [ "tailscale0" ];
  };

  time.timeZone = hostConfig.timezone;

  i18n = {
    defaultLocale = "en_US.UTF-8";
    extraLocaleSettings = {
      LC_ADDRESS = "en_US.UTF-8";
      LC_IDENTIFICATION = "en_US.UTF-8";
      LC_MEASUREMENT = "en_US.UTF-8";
      LC_MONETARY = "en_US.UTF-8";
      LC_NAME = "en_US.UTF-8";
      LC_NUMERIC = "en_US.UTF-8";
      LC_PAPER = "en_US.UTF-8";
      LC_TELEPHONE = "en_US.UTF-8";
      LC_TIME = "en_US.UTF-8";
    };
  };

  nix.settings.experimental-features = [
    "nix-command"
    "flakes"
  ];

  nixpkgs.config.allowUnfree = true;

  services = {
    xserver.xkb = {
      layout = "us";
      variant = "";
    };
    openssh.enable = true;
    tailscale.enable = true;
    blueman.enable = true;
    ttyd = {
      enable = true;
      writeable = true;
    };
  };

  users.users.${hostConfig.username} = {
    isNormalUser = true;
    description = "Quinn Dougherty";
    extraGroups = [
      "networkmanager"
      "wheel"
      "docker"
    ];
  };


  system.stateVersion = "25.11";
}
