import type { Job, JobStatus, Queue } from '../models/job'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { v4 as uuidv4 } from 'uuid'

class JobService {
  private jobs: Map<string, Job> = new Map()
  private queue: Queue = { jobs: [] }
  private jobsPath = path.join(process.cwd(), 'jobs.json')
  private queuePath = path.join(process.cwd(), 'queue.json')

  constructor() {
    this.init()
  }

  private async init() {
    await this.loadJobs()
    await this.loadQueue()
  }

  private async loadJobs() {
    try {
      const data = await fs.readFile(this.jobsPath, 'utf-8')
      const jobsArray = JSON.parse(data) as Job[]
      this.jobs = new Map(jobsArray.map(job => [job.id, job]))
    }
    catch {
      // File doesn't exist or is invalid - start with empty jobs
      console.warn('No jobs file found or invalid format, starting with empty jobs')
      this.jobs = new Map()
    }
  }

  private async loadQueue() {
    try {
      const data = await fs.readFile(this.queuePath, 'utf-8')
      this.queue = JSON.parse(data) as Queue
    }
    catch {
      // File doesn't exist or is invalid - start with empty queue
      console.warn('No queue file found or invalid format, starting with empty queue')
      this.queue = { jobs: [] }
    }
  }

  private async saveJobs() {
    const jobsArray = Array.from(this.jobs.values())
    await fs.writeFile(this.jobsPath, JSON.stringify(jobsArray, null, 2), 'utf-8')
  }

  private async saveQueue() {
    await fs.writeFile(this.queuePath, JSON.stringify(this.queue, null, 2), 'utf-8')
  }

  async createJob(data: any): Promise<Job> {
    const id = uuidv4()
    const now = Date.now()

    const job: Job = {
      id,
      status: 'pending',
      created: now,
      updated: now,
      data,
    }

    this.jobs.set(id, job)
    this.queue.jobs.push(id)

    await Promise.all([this.saveJobs(), this.saveQueue()])

    return job
  }

  async getJob(id: string): Promise<Job | null> {
    return this.jobs.get(id) || null
  }

  async getNextJob(): Promise<Job | null> {
    if (this.queue.jobs.length === 0)
      return null

    const jobId = this.queue.jobs[0]
    const job = this.jobs.get(jobId)

    return job || null
  }

  async updateJobStatus(id: string, status: JobStatus, output?: any): Promise<Job | null> {
    const job = this.jobs.get(id)
    if (!job)
      return null

    job.status = status
    job.updated = Date.now()

    if (output !== undefined) {
      job.output = output
    }

    await this.saveJobs()
    return job
  }

  async removeJobFromQueue(id: string): Promise<void> {
    this.queue.jobs = this.queue.jobs.filter(jobId => jobId !== id)
    await this.saveQueue()
  }

  getAllPendingJobs(): Job[] {
    return Array.from(this.jobs.values())
      .filter(job => job.status === 'pending')
  }
}

export const jobService = new JobService()
