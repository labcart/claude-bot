module.exports = {
  apps: [
    {
      name: 'labcart-bot',
      script: './server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        BOT_SERVER_PORT: 3010
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true,
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: false,
      listen_timeout: 3000
    }
  ]
};
