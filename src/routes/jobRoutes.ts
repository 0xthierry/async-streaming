import type { FastifyInstance } from 'fastify'
import { jobService } from '../services/jobService'

interface CreateJobBody {
  data: any
}

interface GetJobParams {
  id: string
}

export async function jobRoutes(fastify: FastifyInstance) {
  // Create a new job
  fastify.post<{ Body: CreateJobBody }>('/job', async (request, reply) => {
    try {
      const { data } = request.body

      if (!data) {
        return reply.code(400).send({ error: 'Job data is required' })
      }

      const job = await jobService.createJob(data)

      return reply.code(201).send(job)
    }
    catch (error) {
      console.error('Error creating job:', error)
      return reply.code(500).send({ error: 'Internal server error' })
    }
  })

  // Get job status and output
  fastify.get<{ Params: GetJobParams }>('/job/:id', async (request, reply) => {
    try {
      const { id } = request.params

      const job = await jobService.getJob(id)

      if (!job) {
        return reply.code(404).send({ error: 'Job not found' })
      }

      return reply.send(job)
    }
    catch (error) {
      console.error('Error fetching job:', error)
      return reply.code(500).send({ error: 'Internal server error' })
    }
  })
}
