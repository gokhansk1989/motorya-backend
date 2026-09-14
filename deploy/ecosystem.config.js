module.exports = {
  apps: [
    {
      name: 'motorya-frontend',
      cwd: '/home/ubuntu/motorya-frontend',
      script: 'node_modules/.bin/next',
      args: 'start',
      env: { PORT: 3001, NODE_ENV: 'production' }
    },
    {
      name: 'motorya-admin',
      cwd: '/home/ubuntu/motorya-admin',
      script: 'node_modules/.bin/next',
      args: 'start',
      env: { PORT: 3002, NODE_ENV: 'production' }
    }
  ]
}
