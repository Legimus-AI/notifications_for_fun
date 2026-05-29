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
//
// max_memory_restart is the OOM SAFETY-NET (defense in depth). T8 fixes the
// dominant reconnect-listener leak, but Baileys 7.0.0-rc has documented
// internal leaks we don't control (per-message growth #2090, media-send #2104).
// If a residual leak creeps up, PM2 sends SIGINT at 1500M — BELOW V8's hard
// heap limit — so our gracefulShutdown runs (frees device slots, no <conflict>
// cascade) instead of a hard "FATAL: heap out of memory" crash that yanks the
// sockets ungracefully. This turns a catastrophic OOM into a clean ~5s restart.
// WHY run node directly (not `npm start`): with `script:'npm', args:'start'`,
// PM2 monitors the `npm` WRAPPER process, not the real node child. That breaks
// BOTH safety nets: max_memory_restart watches the wrapper's (tiny) RSS so it
// never fires on the leaking node child, and SIGINT goes to npm which may not
// forward it → gracefulShutdown never runs → ungraceful exit → ghost device
// slot → <conflict> cascade. Running node directly makes PM2 signal + measure
// the actual process. ts-node/register keeps TS-on-the-fly (matches `npm start`).
module.exports = {
  apps: [
    {
      name: 'notifications_for_fun',
      script: './src/index.ts',
      interpreter: 'node',
      interpreter_args: '-r ts-node/register -r tsconfig-paths/register',
      kill_timeout: 30_000,
      wait_ready: false,
      listen_timeout: 30_000,
      min_uptime: 10_000,
      max_restarts: 15,
      restart_delay: 10_000,
      max_memory_restart: '1500M',
    },
  ],
};
