import type { FastifyInstance } from 'fastify'
import { FastifySSEPlugin } from 'fastify-sse-v2'
import { jobService } from '../services/jobService'
import { redisService } from '../services/redisService'

interface JobStreamParams {
  id: string
}

declare module 'fastify' {
  export interface Pushable<T> extends AsyncIterable<T> {
    push: (value: T) => this
    end: (err?: Error) => this
  }

  export interface PushableV<T> extends AsyncIterable<T[]> {
    push: (value: T) => this
    end: (err?: Error) => this
  }

  interface Options {
    onEnd?: (err?: Error) => void
    writev?: false
  }

  interface OptionsV {
    onEnd?: (err?: Error) => void
    writev: true
  }
  interface FastifyReply {
    sseContext: {
      source: Pushable<EventMessage>
    }
    // eslint-disable-next-line ts/method-signature-style
    sse(source: AsyncIterable<EventMessage> | EventMessage): void
  }
}

export async function streamRoutes(fastify: FastifyInstance): Promise<void> {
  // Register the SSE plugin
  await fastify.register(FastifySSEPlugin)

  // Stream job processing events via SSE
  fastify.get<{ Params: JobStreamParams }>('/job/:id/stream', async (request, reply) => {
    const { id } = request.params

    // Check if job exists
    const job = await jobService.getJob(id)
    if (!job) {
      return reply.code(404).send({ error: 'Job not found' })
    }

    // Redis stream key for this job
    const streamKey = `job:${id}:stream`

    // Send initial job data
    const initialData = {
      type: 'initial',
      job,
    }
    reply.sse({ data: JSON.stringify(initialData) })

    // Flag to track if we've sent the completed message
    let completed = false

    // If job is already completed, check if we should read from stream or simulate events
    const useSimulatedEvents = job.status === 'succeeded' && job.output

    // Setup direct stream reading without consumer groups for simplicity
    let lastId = '0' // Start reading from the beginning

    // Function to read messages from the stream
    const readMessages = async () => {
      try {
        // Read messages from the stream
        const entries = await redisService.readFromStream(streamKey, 10, lastId)

        // If we have new messages
        if (entries.length > 0) {
          // Update the last ID we've seen
          lastId = entries[entries.length - 1].id

          for (const entry of entries) {
            // Skip if already completed
            if (completed)
              continue

            const messageData = entry.data

            // If this is a completed event, mark as completed
            if (messageData.type === 'completed') {
              completed = true
            }

            // Send the event to the client
            reply.sse({ data: JSON.stringify(messageData) })

            // If completed or error, end the stream after a short delay
            if (messageData.type === 'completed' || messageData.type === 'error') {
              setTimeout(() => {
                reply.sseContext.source.end()
              }, 100)

              // Exit the polling loop
              return
            }
          }
        }
      }
      catch (error) {
        console.error('Error reading from stream:', error)
      }
    }

    // Set up polling interval to check for new messages
    // Only set up polling if the job is not already completed
    let eventLoopInterval: NodeJS.Timeout | null = null

    if (!useSimulatedEvents) {
      // Read messages immediately
      await readMessages()

      // Only set interval if we haven't completed yet
      if (!completed) {
        eventLoopInterval = setInterval(readMessages, 500)
      }
    }

    // Handle connection close
    request.socket.on('close', () => {
      if (eventLoopInterval) {
        clearInterval(eventLoopInterval)
      }
    })

    // If job is already completed and no stream events exist,
    // simulate the events for the client
    if (useSimulatedEvents) {
      // Wait a bit to ensure we've had a chance to read any existing stream events
      setTimeout(async () => {
        // If we've already completed from the stream, don't send simulated events
        if (completed)
          return

        // Send a simulated started event
        reply.sse({
          data: JSON.stringify({
            type: 'started',
            jobId: id,
            timestamp: String(job.created),
            message: 'Job processing started',
          }),
        })

        // Artificial delay to simulate processing
        await new Promise(resolve => setTimeout(resolve, 200))

        // Send simulated progress events based on the output
        if (Array.isArray(job.output)) {
          for (const item of job.output) {
            reply.sse({
              data: JSON.stringify({
                type: 'progress',
                jobId: id,
                step: String(item.step || 0),
                timestamp: String(item.timestamp || 0),
                processingTime: String(item.processingTime || 0),
                data: item.data || '',
              }),
            })

            // Small delay between events for better visualization
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        }

        // Send a simulated completed event
        reply.sse({
          data: JSON.stringify({
            type: 'completed',
            jobId: id,
            timestamp: String(job.updated),
            processingTime: String(job.updated - job.created),
            message: 'Job processing completed',
          }),
        })

        // End the stream after sending all events
        setTimeout(() => {
          reply.sseContext.source.end()
        }, 100)
      }, 500)
    }
  })
}
