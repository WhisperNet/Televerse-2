const amqplib = require('amqplib');

const DEFAULT_EXCHANGE = process.env.RABBITMQ_EXCHANGE || 'careforall.events';
const PREFETCH_COUNT = Number(process.env.RABBITMQ_PREFETCH || 10);

let connectionPromise;
let channelPromise;

async function getConnection(uri = process.env.RABBITMQ_URI) {
  if (!uri) {
    throw new Error('RABBITMQ_URI must be provided');
  }

  if (!connectionPromise) {
    connectionPromise = amqplib.connect(uri);
    connectionPromise.then((conn) => {
      conn.on('close', () => {
        console.warn('[rabbitmq] connection closed');
        connectionPromise = null;
        channelPromise = null;
      });
      conn.on('error', (err) => {
        console.error('[rabbitmq] connection error', err);
      });
    });
  }

  return connectionPromise;
}

async function getChannel(uri) {
  if (!channelPromise) {
    channelPromise = (await getConnection(uri)).createChannel();
    channelPromise.then((ch) => {
      ch.prefetch(PREFETCH_COUNT);
    });
  }
  return channelPromise;
}

async function publishEvent(routingKey, payload, options = {}) {
  const channel = await getChannel();
  await channel.assertExchange(DEFAULT_EXCHANGE, 'topic', { durable: true });
  const buffer = Buffer.from(JSON.stringify(payload));
  const published = channel.publish(DEFAULT_EXCHANGE, routingKey, buffer, {
    contentType: 'application/json',
    persistent: true,
    timestamp: Date.now(),
    ...options,
  });

  if (!published) {
    console.warn('[rabbitmq] publish returned false (write buffer full)');
  }

  return published;
}

async function consumeQueue(queueName, routingKey, handler) {
  if (!queueName || !handler) {
    throw new Error('consumeQueue requires queueName and handler');
  }

  const channel = await getChannel();
  await channel.assertExchange(DEFAULT_EXCHANGE, 'topic', { durable: true });
  const q = await channel.assertQueue(queueName, { durable: true });
  await channel.bindQueue(q.queue, DEFAULT_EXCHANGE, routingKey);

  await channel.consume(q.queue, async (msg) => {
    if (!msg) return;
    try {
      const content = JSON.parse(msg.content.toString());
      await handler(content, msg);
      channel.ack(msg);
    } catch (error) {
      console.error('[rabbitmq] handler failed, message requeued', error);
      channel.nack(msg, false, true);
    }
  });

  return q.queue;
}

module.exports = {
  publishEvent,
  consumeQueue,
  getConnection,
};
