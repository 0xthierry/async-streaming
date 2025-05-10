import { jobService } from '../services/jobService'
import { redisService } from '../services/redisService'

// Simulates a long-running job
async function processJob(jobId: string, data: any): Promise<any> {
  // Update job status to processing
  await jobService.updateJobStatus(jobId, 'processing')

  // Get the Redis stream key for this job
  const streamKey = `job:${jobId}:stream`

  // Simulate job processing with some delay
  const startTime = Date.now()
  const output = []

  // Add started event to stream
  await redisService.addToStream(streamKey, {
    type: 'started',
    jobId,
    timestamp: String(Date.now()),
    message: 'Job processing started',
  })

  // Simulate a job that takes some time and produces incremental output
  for (let i = 0; i < 60; i++) {
    // Simulate work being done
    await new Promise(resolve => setTimeout(resolve, 1000))

    const stepResult = {
      step: i + 1,
      timestamp: Date.now(),
      processingTime: Date.now() - startTime,
      data: `Processed chunk ${i + 1} of data: ${JSON.stringify(data).substring(0, 20)}...`,
    }

    // Add to the output collection
    output.push(stepResult)

    // Add step result to Redis stream
    await redisService.addToStream(streamKey, {
      type: 'progress',
      jobId,
      step: String(i + 1),
      timestamp: String(stepResult.timestamp),
      processingTime: String(stepResult.processingTime),
      data: stepResult.data,
    })

    console.warn(`Job ${jobId} - step ${i + 1} completed`)
  }

  // Add completed event to stream
  await redisService.addToStream(streamKey, {
    type: 'completed',
    jobId,
    timestamp: String(Date.now()),
    processingTime: String(Date.now() - startTime),
    message: 'Job processing completed',
  })

  // Trim the stream to a reasonable size
  await redisService.trimStream(streamKey, 100)

  // Final result
  return output
}

export async function startWorker(): Promise<void> {
  console.warn('Starting job worker...')

  // Worker loop
  while (true) {
    try {
      // Get the next job from the queue
      const job = await jobService.getNextJob()

      if (job) {
        console.warn(`Processing job ${job.id}...`)

        try {
          // Process the job
          const result = await processJob(job.id, job.data)

          // Update job with the result
          await jobService.updateJobStatus(job.id, 'succeeded', result)

          // Remove the job from the queue
          await jobService.removeJobFromQueue(job.id)

          console.warn(`Job ${job.id} completed successfully`)
        }
        catch (error) {
          console.error(`Error processing job ${job.id}:`, error)

          // Add error event to stream
          const streamKey = `job:${job.id}:stream`
          await redisService.addToStream(streamKey, {
            type: 'error',
            jobId: job.id,
            timestamp: String(Date.now()),
            error: error instanceof Error ? error.message : String(error),
          })

          // Move to the next job in case of failure
          await jobService.removeJobFromQueue(job.id)
        }
      }
      else {
        // No jobs in the queue, wait a bit before checking again
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    catch (error) {
      console.error('Worker error:', error)
      // Wait a bit before continuing in case of error
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
}
