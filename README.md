# Async Job Processing Service

A Node.js service built with Fastify for handling asynchronous job processing with persistent job storage and real-time streaming via Redis Streams and Server-Sent Events (SSE).

## Features

- REST API for creating and monitoring jobs
- In-memory job queue with file persistence
- Background worker for processing jobs
- Automatic job state management (pending, processing, succeeded)
- Real-time processing updates via Server-Sent Events (SSE)
- Redis Streams for reliable, persistent event streaming
- File-based persistence for jobs and queue state

## Prerequisites

- Node.js 16+
- Docker and Docker Compose (for Redis)

## Installation

```bash
# Install dependencies
npm install

# Start Redis (required for streaming)
docker-compose up -d

# Build the project
npm run build
```

## Usage

### Start the server

```bash
# Development mode with hot reload
npm run dev

# Production mode (build first)
npm run build
npm start
```

The server will start on `http://localhost:3000`.

## API Endpoints

### Create a new job

```
POST /job
```

Request body:

```json
{
  "data": {
    "your": "job data",
    "goes": "here"
  }
}
```

Response:

```json
{
  "id": "a01a4a22-8c8e-4dad-9e14-7d8b2efc0aed",
  "status": "pending",
  "created": 1715346000000,
  "updated": 1715346000000,
  "data": {
    "your": "job data",
    "goes": "here"
  }
}
```

### Get job status and output

```
GET /job/:id
```

Response:

```json
{
  "id": "a01a4a22-8c8e-4dad-9e14-7d8b2efc0aed",
  "status": "succeeded",
  "created": 1715346000000,
  "updated": 1715346010000,
  "data": {
    "your": "job data",
    "goes": "here"
  },
  "output": [
    {
      "step": 1,
      "timestamp": 1715346002000,
      "processingTime": 2000,
      "data": "Processed chunk 1 of data: {\"your\":\"job data\",..."
    }
    // Additional output steps...
  ]
}
```

### Stream job processing events (SSE)

```
GET /job/:id/stream
```

Headers:
```
Accept: text/event-stream
```

Response (streaming events):

```
data: {"type":"initial","job":{"id":"a01a4a22-8c8e-4dad-9e14-7d8b2efc0aed","status":"processing","created":1715346000000,"updated":1715346000000,"data":{"your":"job data","goes":"here"}}}

data: {"type":"started","jobId":"a01a4a22-8c8e-4dad-9e14-7d8b2efc0aed","timestamp":"1715346000500","message":"Job processing started"}

data: {"type":"progress","jobId":"a01a4a22-8c8e-4dad-9e14-7d8b2efc0aed","step":"1","timestamp":"1715346001500","processingTime":"1000","data":"Processed chunk 1 of data: {\"your\":\"job data\",.."}

data: {"type":"progress","jobId":"a01a4a22-8c8e-4dad-9e14-7d8b2efc0aed","step":"2","timestamp":"1715346002500","processingTime":"2000","data":"Processed chunk 2 of data: {\"your\":\"job data\",.."}

data: {"type":"completed","jobId":"a01a4a22-8c8e-4dad-9e14-7d8b2efc0aed","timestamp":"1715346010000","processingTime":"10000","message":"Job processing completed"}
```

## Architecture

- **API Server**: Fastify server handling HTTP requests and SSE streaming
- **Job Service**: Manages job state and persistence
- **Worker Process**: Background thread that processes jobs from the queue
- **Redis Streams**: Provides reliable, persistent event streaming
- **File Persistence**: Jobs and queue state are saved to disk
  - `jobs.json`: Contains all job metadata and results
  - `queue.json`: Contains the current queue state

## Redis Streams

This service uses Redis Streams instead of traditional Pub/Sub for several advantages:

1. **Persistence**: Stream events are stored in Redis and don't disappear after being consumed
2. **History**: New consumers can read historical events from the beginning
3. **Reliability**: Consumer groups ensure messages are properly processed
4. **Backpressure Handling**: Consumers can process messages at their own pace
5. **Message Acknowledgement**: Ensures messages aren't lost if a consumer fails

## Data Flow

1. Client creates a job via `POST /job`
2. API adds job to the queue and persists to disk
3. Worker processes the job and adds events to a Redis Stream
4. Client can stream events in real-time via `GET /job/:id/stream`
5. Worker completes job, updates status and saves output
6. Client can get the final result via `GET /job/:id`
