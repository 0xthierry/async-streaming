import process from 'node:process'
import { startWorker } from './jobWorker'

// Start the worker process
async function run(): Promise<void> {
  try {
    await startWorker()
  }
  catch (error) {
    console.error('Worker thread error:', error)
    process.exit(1)
  }
}

// Run the worker
run().catch((error) => {
  console.error('Worker thread fatal error:', error)
  process.exit(1)
})
