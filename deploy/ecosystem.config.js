// -H 127.0.0.1: Next sunuculari varsayilan olarak 0.0.0.0'i dinliyor, yani
// 3001/3002 portlari internete aciktı. Disariyla konusan tek sey nginx olmali.
module.exports = {
  apps: [
    {
      name: 'motorya-frontend',
      cwd: '/home/ubuntu/motorya-frontend',
      script: 'node_modules/.bin/next',
      args: 'start -H 127.0.0.1',
      env: { PORT: 3001, NODE_ENV: 'production' }
    },
    {
      name: 'motorya-admin',
      cwd: '/home/ubuntu/motorya-admin',
      script: 'node_modules/.bin/next',
      args: 'start -H 127.0.0.1',
      env: { PORT: 3002, NODE_ENV: 'production' }
    }
  ]
}
