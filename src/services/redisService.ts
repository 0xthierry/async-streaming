import process from 'node:process'
import Redis from 'ioredis'

class RedisService {
  private redis: Redis

  constructor() {
    // Create a single Redis connection
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
    })

    // Handle connection errors
    this.redis.on('error', (err) => {
      console.error('Redis Connection Error:', err)
    })
  }

  /**
   * Add a message to a Redis Stream
   * @param streamKey The stream key
   * @param data The data to add to the stream
   * @returns The ID of the added entry
   */
  async addToStream(streamKey: string, data: Record<string, string>): Promise<string> {
    try {
      // Convert object to array of field-value pairs for XADD
      const fieldValuePairs = Object.entries(data).flat()

      // Add to stream, with * to auto-generate ID
      const id = await this.redis.xadd(streamKey, '*', ...fieldValuePairs)
      return id || ''
    }
    catch (error) {
      console.error(`Error adding to stream ${streamKey}:`, error)
      throw error
    }
  }

  /**
   * Read messages from a Redis Stream
   * @param streamKey The stream key
   * @param count The number of messages to read (default: 10)
   * @param start The ID to start reading from (default: 0 = beginning)
   * @returns Array of stream entries with ID and fields
   */
  async readFromStream(streamKey: string, count = 10, start = '0'): Promise<Array<{ id: string, data: Record<string, string> }>> {
    try {
      // Check if the stream exists
      const streamInfo = await this.redis.exists(streamKey)
      if (streamInfo === 0) {
        // Stream doesn't exist yet
        return []
      }

      const result = await this.redis.xrange(streamKey, start === '0' ? '-' : `(${start}`, '+', 'COUNT', count)

      return result.map(([id, fields]) => {
        // Convert array of [field1, value1, field2, value2...] to {field1: value1, field2: value2}
        const data: Record<string, string> = {}
        for (let i = 0; i < fields.length; i += 2) {
          data[fields[i]] = fields[i + 1]
        }
        return { id, data }
      })
    }
    catch (error) {
      console.error(`Error reading from stream ${streamKey}:`, error)
      return []
    }
  }

  /**
   * Read new messages from a Redis Stream using XREAD BLOCK
   * @param streamKey The stream key
   * @param lastId The ID to start reading from ('$' for only new messages)
   * @param timeout Timeout in milliseconds (0 = infinite)
   * @returns Promise that resolves with new messages when they arrive
   */
  async readStreamBlocking(
    streamKey: string,
    lastId = '$',
    timeout = 0,
  ): Promise<Array<{ id: string, data: Record<string, string> }>> {
    try {
      const result = await this.redis.xread('BLOCK', timeout, 'STREAMS', streamKey, lastId)

      if (!result)
        return []

      const entries = result[0][1] || []

      return entries.map(([id, fields]: [string, string[]]) => {
        const data: Record<string, string> = {}
        for (let i = 0; i < fields.length; i += 2) {
          data[fields[i]] = fields[i + 1]
        }
        return { id, data }
      })
    }
    catch (error) {
      console.error(`Error reading from stream ${streamKey} with BLOCK:`, error)
      return []
    }
  }

  /**
   * Create a consumer group for a stream
   * @param streamKey The stream key
   * @param groupName The consumer group name
   * @param startId The ID to start from ('$' = only new, '0' = beginning)
   */
  async createGroup(streamKey: string, groupName: string, startId = '$'): Promise<void> {
    try {
      // Create the stream if it doesn't exist
      await this.redis.xgroup('CREATE', streamKey, groupName, startId, 'MKSTREAM')
    }
    catch (error) {
      // Ignore BUSYGROUP error (group already exists)
      if (error instanceof Error && error.message.includes('BUSYGROUP')) {
        // Group already exists, this is fine
        return
      }

      console.error(`Error creating consumer group ${groupName} for stream ${streamKey}:`, error)
      throw error
    }
  }

  /**
   * Read messages from a stream as a consumer in a group
   * @param streamKey The stream key
   * @param groupName The consumer group name
   * @param consumerName The consumer name
   * @param count The number of messages to read (default: 10)
   * @param idsToAck Array of message IDs to acknowledge
   * @returns Array of stream entries with ID and fields
   */
  async readGroup(
    streamKey: string,
    groupName: string,
    consumerName: string,
    count = 10,
    idsToAck: string[] = [],
  ): Promise<Array<{ id: string, data: Record<string, string> }>> {
    try {
      // Acknowledge previous messages if any
      if (idsToAck.length > 0) {
        await this.redis.xack(streamKey, groupName, ...idsToAck)
      }

      // Read new messages
      const result = (await this.redis.xreadgroup(
        'GROUP',
        groupName,
        consumerName,
        'COUNT',
        count,
        'STREAMS',
        streamKey,
        '>',
      ))

      if (!result)
        return []

      const entries = (result as any)[0][1] as [string, string[]][] || []

      return entries.map(([id, fields]: [string, string[]]) => {
        const data: Record<string, string> = {}
        for (let i = 0; i < fields.length; i += 2) {
          data[fields[i]] = fields[i + 1]
        }
        return { id, data }
      })
    }
    catch (error) {
      console.error(`Error reading from group ${groupName} for stream ${streamKey}:`, error)
      return []
    }
  }

  /**
   * Trim a stream to a maximum length
   * @param streamKey The stream key
   * @param maxLen The maximum length to keep
   */
  async trimStream(streamKey: string, maxLen = 1000): Promise<void> {
    try {
      await this.redis.xtrim(streamKey, 'MAXLEN', '~', maxLen)
    }
    catch (error) {
      console.error(`Error trimming stream ${streamKey}:`, error)
    }
  }

  /**
   * Close the Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit()
  }
}

export const redisService = new RedisService()
