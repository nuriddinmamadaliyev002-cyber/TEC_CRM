module.exports = {
  apps: [
    { name: 'courses-api', cwd: '/var/www/IIS-courses/backend', script: 'src/index.js', env: { NODE_ENV: 'production' }, max_memory_restart: '300M' },
    { name: 'courses-bot', cwd: '/var/www/IIS-courses/bot',     script: 'bot.js',       env: { NODE_ENV: 'production' }, max_memory_restart: '150M' },
  ],
};
