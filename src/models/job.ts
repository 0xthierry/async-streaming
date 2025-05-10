export type JobStatus = 'pending' | 'processing' | 'succeeded'

export interface Job {
  id: string
  status: JobStatus
  created: number
  updated: number
  data: any
  output?: any
}

export interface Queue {
  jobs: string[] // Array of job IDs
}
