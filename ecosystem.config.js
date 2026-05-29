// PM2 process configuration.
//
// kill_timeout=30s gives our gracefulShutdown enough room to cleanly close
// every WhatsApp Baileys socket BEFORE PM2 sends SIGKILL. The default 1.6s
// is too short — the WebSockets get yanked, WhatsApp's server keeps the
// device slot live for seconds, and the next boot races a "ghost" socket
// causing <conflict type=replaced/> → channels cascade to logged_out and
// require QR re-pair. See WhatsAppService.gracefulShutdownAll.
//
// min_uptime + max_restarts protect against a crash-loop pinning the CPU
// (e.g. a startup bug that throws synchronously). PM2 backs off after 15
// fast restarts. restart_delay smooths jitter between retries.
//
// Logging: pm2-logrotate is configured globally (see STABILITY_PLAN.md T6).
// DO NOT add --max-old-space-size here on prod — the OOM is a listener leak,
// not a legitimate RAM need. Fixing the leak (T8) is the correct path; if
// V8 grows past ~2GB on this app there is still a leak to hunt.
module.exports = {
  apps: [
    {
      name: 'notifications_for_fun',
      script: 'npm',
      args: 'start',
      kill_timeout: 30_000,
      wait_ready: false,
      listen_timeout: 30_000,
      min_uptime: 10_000,
      max_restarts: 15,
      restart_delay: 10_000,
    },
  ],
};
