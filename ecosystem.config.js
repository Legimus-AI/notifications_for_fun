// PM2 process configuration.
//
// kill_timeout=20s gives our gracefulShutdown enough room to cleanly close
// every WhatsApp Baileys socket BEFORE PM2 sends SIGKILL. The default 1.6s
// is too short — the WebSockets get yanked, WhatsApp's server keeps the
// device slot live for seconds, and the next boot races a "ghost" socket
// causing <conflict type=replaced/> → channels cascade to logged_out and
// require QR re-pair. See WhatsAppService.gracefulShutdownAll.
module.exports = {
  apps: [
    {
      name: 'notifications_for_fun',
      script: 'npm',
      args: 'start',
      kill_timeout: 20_000,
      wait_ready: false,
      listen_timeout: 30_000,
    },
  ],
};
