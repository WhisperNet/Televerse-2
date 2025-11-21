const promClient = require('prom-client');

const register = new promClient.Registry();

// Add default metrics (CPU, memory)
promClient.collectDefaultMetrics({ register });

// Custom counter for HTTP requests
const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// Webhook processing metrics
const webhooksProcessedTotal = new promClient.Counter({
  name: 'webhooks_processed_total',
  help: 'Total webhooks processed',
  labelNames: ['event_type', 'status'],
  registers: [register],
});

// Middleware to track requests
function metricsMiddleware(req, res, next) {
  res.on('finish', () => {
    httpRequestsTotal.inc({
      method: req.method,
      route: req.route ? req.route.path : req.path,
      status_code: res.statusCode,
    });
  });
  next();
}

module.exports = {
  register,
  metricsMiddleware,
  webhooksProcessedTotal,
};
