import Fastify from 'fastify';
import amqp from 'amqplib';

const fastify = Fastify({ logger: true });

const PORT = process.env.PORT || 3000;
const RABBITMQ_URL = process.env.RABBITMQ_URL;
const EXCHANGE_NAME = 'notifications.direct';

// Global variable for RabbitMQ connection and channel
let rabbitChannel;

// --- Connect to RabbitMQ ---
async function connectToRabbitMQ() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    rabbitChannel = await connection.createChannel();
    
    // Make sure our "post office" (exchange) exists
    await rabbitChannel.assertExchange(EXCHANGE_NAME, 'direct', { durable: true });
    
    fastify.log.info('Connected to RabbitMQ and exchange asserted');
  } catch (err) {
    fastify.log.error('Failed to connect to RabbitMQ', err);
    // If it fails, retry after 5 seconds
    setTimeout(connectToRabbitMQ, 5000);
  }
}

// --- Define API Routes ---
fastify.get('/health', async (request, reply) => {
  return { status: 'ok' };
});

// --- THIS IS THE NEW NOTIFICATION ENDPOINT ---
fastify.post('/api/v1/notifications', async (request, reply) => {
  const { notification_type, user_id, template_code, variables } = request.body;
  
  // 1. Check if RabbitMQ is ready
  if (!rabbitChannel) {
    reply.status(503); // Service Unavailable
    return { success: false, error: 'Message service not ready' };
  }

  // 2. Prepare the message
  const message = {
    user_id,
    template_code,
    variables,
    timestamp: new Date(),
  };
  const messageBuffer = Buffer.from(JSON.stringify(message));
  
  // 3. Set the routing key based on notification type
  // This MUST match the binding key you set in the dashboard
  let routingKey;
  if (notification_type === 'email') {
    routingKey = 'email';
  } else if (notification_type === 'push') {
    routingKey = 'push';
  } else {
    reply.status(400);
    return { success: false, error: 'Invalid notification_type' };
  }
  
  // 4. Publish the message to the exchange
  try {
    rabbitChannel.publish(EXCHANGE_NAME, routingKey, messageBuffer, {
      persistent: true, // This makes sure the message survives a crash
    });
    
    fastify.log.info(`Message published to ${EXCHANGE_NAME} with key ${routingKey}`);
    reply.status(202); // 202 Accepted (meaning, "I'll do it, but not right now")
    return { success: true, message: 'Notification request accepted' };
    
  } catch (err) {
    fastify.log.error('Failed to publish message', err);
    reply.status(500);
    return { success: false, error: 'Internal server error' };
  }
});

// --- Run the server ---
const start = async () => {
  try {
    await connectToRabbitMQ(); // Connect to RabbitMQ *before* starting
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`API Gateway listening on ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();