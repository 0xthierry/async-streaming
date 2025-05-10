import process from 'node:process'
import { redisService } from '../services/redisService'

/**
 * Simple utility to monitor Redis streams
 * Run with: npx tsx src/utils/monitor-streams.ts
 */
async function monitorStreams() {
  console.warn('⚙️ Redis Stream Monitor started')

  // Get the job ID from command line args
  const jobId = process.argv[2]
  if (!jobId) {
    console.error('❌ Please provide a job ID as an argument')
    console.error('Usage: npx tsx src/utils/monitor-streams.ts JOB_ID')
    process.exit(1)
  }

  const streamKey = `job:${jobId}:stream`
  console.warn(`🔍 Monitoring stream: ${streamKey}`)

  let lastId = '0'

  // Set up polling to read new messages
  const interval = setInterval(async () => {
    try {
      const entries = await redisService.readFromStream(streamKey, 100, lastId)

      if (entries.length > 0) {
        // Update last ID
        lastId = entries[entries.length - 1].id

        // Print entries
        console.warn(`⚡ Found ${entries.length} new messages:`)
        for (const entry of entries) {
          console.warn(`🆔 ${entry.id}:`, entry.data)
        }
      }
    }
    catch (error) {
      console.error('❌ Error reading stream:', error)
    }
  }, 1000)

  // Handle Ctrl+C
  process.on('SIGINT', async () => {
    clearInterval(interval)
    console.warn('\n🛑 Stopping monitor...')
    await redisService.close()
    process.exit(0)
  })
}

// Run the monitor
monitorStreams().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})
