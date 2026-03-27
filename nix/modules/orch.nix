{ pkgs, hostConfig, ... }:
let
  home = "/home/${hostConfig.username}";
  uiDir = "${home}/projects/self/orch";
  serviceName = "${hostConfig.hostname}-ui";
in
{
  # Allow passwordless restart of the UI service (used by deploy action)
  security.sudo.extraRules = [
    {
      users = [ hostConfig.username ];
      commands = [
        {
          command = "/run/current-system/sw/bin/systemctl restart ${serviceName}";
          options = [ "NOPASSWD" ];
        }
      ];
    }
  ];

  systemd.services.${serviceName} = {
    description = "${hostConfig.hostname} Next.js UI";
    after = [ "network.target" ];
    wantedBy = [ "multi-user.target" ];

    environment = {
      NODE_ENV = "production";
      PORT = "3000";
      HOSTNAME = "0.0.0.0";
    };

    path = with pkgs; [
      coreutils
      procps
      tmux
      fastfetch
      gh
      git
      openssh
      "/run/wrappers/bin"
    ];

    serviceConfig = {
      Type = "simple";
      User = hostConfig.username;
      WorkingDirectory = uiDir;
      ExecStart = "${home}/.bun/bin/bun run start";
      Restart = "on-failure";
      RestartSec = 5;
    };
  };
}
