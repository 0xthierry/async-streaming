import process from 'node:process'
import cors from '@fastify/cors'
import Fastify from 'fastify'
import { jobRoutes } from './routes/jobRoutes'
import { streamRoutes } from './routes/streamRoutes'
import { redisService } from './services/redisService'

async function startServer() {
  // Create Fastify instance
  const fastify = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  })

  // Register CORS
  await fastify.register(cors, {
    origin: true,
  })

  // Register routes
  await fastify.register(jobRoutes)
  await fastify.register(streamRoutes)

  // Start the server
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' })
    console.warn('Server is running on http://localhost:3000')
  }
  catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }

  // Handle graceful shutdown
  const shutdown = async () => {
    console.warn('Shutting down server...')
    await fastify.close()
    await redisService.close()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  // Start the worker directly in-process instead of using worker threads
  console.warn('Starting worker process...')
  try {
    const { startWorker } = await import('./workers/jobWorker.js')
    startWorker().catch((err: Error) => {
      console.error('Worker error:', err)
    })
  }
  catch (err) {
    console.error('Failed to start worker:', err)
  }
}

// Start the server
startServer().catch(console.error)
