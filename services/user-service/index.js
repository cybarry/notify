import Fastify from 'fastify';
import pg from 'pg';
import { createClient } from 'redis';

const fastify = Fastify({ logger: true });

const PORT = process.env.PORT || 3001;
const { Pool } = pg;

// 1. Connect to Postgres
// This works because Docker passes in the environment variable from docker-compose.yml
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// 2. Connect to Redis
const redisClient = createClient({
  url: process.env.REDIS_URL,
});

redisClient.on('error', (err) => fastify.log.error('Redis Client Error', err));
await redisClient.connect();

// 3. Create the database table on startup (if it doesn't exist)
async function createTable() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        push_token TEXT,
        preferences JSONB,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    fastify.log.info('Users table checked/created successfully.');
  } finally {
    client.release();
  }
}

// The /health endpoint is CRITICAL for Docker
fastify.get('/health', async (request, reply) => {
  return { status: 'ok' };
});

// A simple route to test
fastify.get('/', async (request, reply) => {
  return { hello: 'from user-service' };
});

// --- NEW ROUTE TO CREATE A USER ---
fastify.post('/api/v1/users', async (request, reply) => {
  const { name, email, password } = request.body;

  // Basic validation
  if (!name || !email || !password) {
    reply.status(400);
    return { error: 'Validation failed', message: 'name, email, and password are required' };
  }

  try {
    const res = await pool.query(
      'INSERT INTO users(name, email, password) VALUES($1, $2, $3) RETURNING id, name, email',
      [name, email, 'hashed_password_placeholder'] // TODO: Hash password
    );
    
    // Also, cache the new user's email in Redis for 1 hour
    await redisClient.set(`user:${res.rows[0].id}`, email, { EX: 3600 });
    
    reply.status(201);
    return { success: true, message: 'User created', data: res.rows[0] };
  } catch (err) {
    fastify.log.error(err);
    reply.status(500);
    return { success: false, error: 'Internal server error', message: err.message };
  }
});

// Run the server
const start = async () => {
  try {
    await createTable(); // Create the table *before* starting
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`User service listening on ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();