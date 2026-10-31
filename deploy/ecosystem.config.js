module.exports = {
  apps: [
    { name: 'tec-api', cwd: '/var/www/TEC/backend', script: 'src/index.js', env: { NODE_ENV: 'production' }, max_memory_restart: '300M' },
    { name: 'tec-bot', cwd: '/var/www/TEC/bot',     script: 'bot.js',       env: { NODE_ENV: 'production' }, max_memory_restart: '150M' },
  ],
};
