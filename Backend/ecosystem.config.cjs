/**
 * PM2 process definition for the SMS Pro backend.
 *
 * Two processes, deliberately:
 *
 *  1. `smspro-api` — the HTTP/Socket.IO API.
 *  2. `smspro-workers` — the BullMQ consumers.
 *
 * The worker process is the important part. Producers (order dispatch, scheduled
 * orders, location cold-storage sync, subscription expiry) enqueue jobs from the API
 * process, but nothing consumes them unless a worker is running. Previously the
 * deploy only restarted the API, so with BULLMQ_ENABLED=true the queues would grow
 * forever and dispatch retries would never fire — with no error visible in the API.
 *
 * `.cjs` extension: package.json sets "type": "module", and PM2 loads config files
 * with require().
 *
 * Usage on the VPS:
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 reload ecosystem.config.cjs --env production   # zero-downtime for the API
 *   pm2 save
 */
module.exports = {
    apps: [
        {
            name: 'smspro-api',
            script: 'server.js',
            cwd: __dirname,
            // API scaling is opt-in because server.js currently starts scheduled jobs
            // as well as HTTP/Socket.IO. Set API_INSTANCES > 1 only after Redis is
            // enabled and scheduled jobs are protected by distributed locks.
            instances: Number.parseInt(process.env.API_INSTANCES || '1', 10),
            exec_mode: Number.parseInt(process.env.API_INSTANCES || '1', 10) > 1 ? 'cluster' : 'fork',
            instance_var: 'API_INSTANCE_ID',
            max_memory_restart: '600M',
            // Give in-flight requests time to drain; server.js runs a graceful shutdown
            // on SIGTERM with its own 10s ceiling.
            kill_timeout: 12000,
            // Treat the process as up only once it has stayed alive this long, so a
            // crash-on-boot is reported as a failure instead of an endless restart loop.
            min_uptime: '20s',
            max_restarts: 10,
            env: { NODE_ENV: 'development' },
            env_production: { NODE_ENV: 'production' },
        },
        {
            name: 'smspro-workers',
            script: 'src/queues/workers/index.js',
            cwd: __dirname,
            // Workers are safe to scale independently because BullMQ coordinates
            // job ownership through Redis. Override with WORKER_INSTANCES in PM2's
            // environment when queue throughput needs to increase.
            instances: Number.parseInt(process.env.WORKER_INSTANCES || '1', 10),
            exec_mode: 'fork',
            instance_var: 'WORKER_INSTANCE_ID',
            max_memory_restart: '500M',
            // Longer than the API: workers wait for in-flight jobs to finish
            // (SHUTDOWN_TIMEOUT_MS is 15s in the worker entrypoint).
            kill_timeout: 20000,
            min_uptime: '20s',
            max_restarts: 10,
            env: { NODE_ENV: 'development' },
            env_production: { NODE_ENV: 'production' },
        },
    ],
};
