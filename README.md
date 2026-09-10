# GitHub PR AI Reviewer Backend

A portfolio-grade backend for an automated GitHub Pull Request review system.

The service receives GitHub webhook events, authenticates and validates them, converts the payload into an internal domain model, prevents duplicate review work, queues the review asynchronously, tracks job state, and exposes review status through an HTTP API.

The project currently uses **Hexagonal Architecture (Ports and Adapters)** with in-memory infrastructure and a fake review processor. The next stages will replace those temporary adapters with real GitHub, Antigravity, MCP, and durable persistence integrations.

---

## Current Capabilities

- GitHub Pull Request webhook receiver
- HMAC-SHA256 webhook signature verification
- Raw request-body verification using `X-Hub-Signature-256`
- Request body-size protection
- Runtime validation of untrusted webhook JSON
- Support for PR actions:
  - `opened`
  - `reopened`
  - `synchronize`
- Transport-level duplicate protection using `X-GitHub-Delivery`
- Business-level idempotency using:
  - repository
  - pull request number
  - head commit SHA
- Asynchronous review queue
- Single-worker review processing
- Review job states:
  - `queued`
  - `processing`
  - `completed`
  - `failed`
- Review status API
- In-memory job storage
- Fake review processor for simulating slow AI work
- Manual dependency injection through a composition root

---

## Architecture

This project follows **Hexagonal Architecture**, also known as **Ports and Adapters Architecture**.

The core idea is that application logic should not depend directly on external technologies such as Node HTTP, GitHub, Redis, PostgreSQL, or an AI provider.

Instead, the application defines **ports** (interfaces), and infrastructure provides **adapters** that implement those ports.

```text
                         GitHub
                           │
                           │ HTTP Webhook
                           ▼
                ┌───────────────────────┐
                │ GitHub Webhook Adapter│
                │       INBOUND         │
                └───────────┬───────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │ Enqueue PR Review     │
                │       USE CASE        │
                └───────────┬───────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
                ▼                       ▼
        ReviewJobStore Port       ReviewQueue Port
                ▲                       ▲
                │                       │
                ▼                       ▼
      InMemoryReviewJobStore   InMemoryReviewQueue
                                        │
                                        ▼
                                ReviewProcessor Port
                                        ▲
                                        │
                                        ▼
                              FakeReviewProcessor
```

For review status:

```text
GET /reviews/:deliveryId
          │
          ▼
 Review Status Adapter
          │
          ▼
   GetReviewJob Use Case
          │
          ▼
 ReviewJobStore Port
          │
          ▼
InMemoryReviewJobStore
```

---

## Project Structure

```text
src/
├── domain/
│   └── review.ts
│
├── application/
│   ├── ports/
│   │   ├── reviewJobStore.ts
│   │   ├── reviewProcessor.ts
│   │   └── reviewQueue.ts
│   │
│   └── useCases/
│       ├── enqueuePullRequestReview.ts
│       └── getReviewJob.ts
│
├── adapters/
│   ├── inbound/
│   │   ├── githubWebhook.ts
│   │   └── reviewStatus.ts
│   │
│   └── outbound/
│       ├── fakeReviewProcessor.ts
│       ├── inMemoryReviewJobStore.ts
│       └── inMemoryReviewQueue.ts
│
├── infrastructure/
│   ├── config.ts
│   └── http.ts
│
└── server.ts
```

---

## Layer Responsibilities

### Domain

`src/domain/`

Contains the core business models and rules.

Examples:

- `ReviewTrigger`
- `ReviewJob`
- `ReviewStatus`
- `SupportedAction`
- review identity / review key

The domain layer does not depend on:

- Node HTTP
- GitHub headers
- databases
- queues
- Antigravity
- MCP

### Application

`src/application/`

Contains use cases and ports.

#### Ports

Ports define what the application needs from external systems.

Current ports:

- `ReviewQueue`
- `ReviewJobStore`
- `ReviewProcessor`

The application depends on these interfaces instead of concrete infrastructure.

#### Use Cases

Current use cases:

- `enqueuePullRequestReview`
- `getReviewJob`

Application logic decides what should happen, while adapters decide how it happens.

### Inbound Adapters

`src/adapters/inbound/`

Receive input from outside the application.

Current inbound adapters:

- GitHub webhook handler
- review status HTTP handler

The GitHub webhook adapter is responsible for:

1. Reading GitHub headers
2. Reading the bounded raw request body
3. Verifying the webhook signature
4. Filtering unsupported GitHub events
5. Parsing JSON
6. Validating the payload
7. Converting GitHub JSON into `ReviewTrigger`
8. Handling transport-level duplicate deliveries
9. Calling the application use case

### Outbound Adapters

`src/adapters/outbound/`

Implement application ports.

Current outbound adapters:

- `InMemoryReviewQueue`
- `InMemoryReviewJobStore`
- `FakeReviewProcessor`

These are intentionally temporary implementations.

### Infrastructure

`src/infrastructure/`

Contains generic technical concerns such as:

- HTTP helpers
- request body reading
- body-size protection
- environment configuration

### Composition Root

`src/server.ts`

The composition root creates concrete implementations and wires them together.

Example dependency graph:

```text
InMemoryReviewJobStore ────────┐
                               │
FakeReviewProcessor ───────┐   │
                           ▼   ▼
                    InMemoryReviewQueue
                           │
                           ▼
                EnqueuePullRequestReview
                           │
                           ▼
                  GitHubWebhookHandler
```

This is manual dependency injection.

---

## Request Flow

A valid Pull Request webhook currently follows this flow:

```text
GitHub
  │
  │ POST /webhooks/github
  ▼
Node HTTP Server
  │
  ▼
GitHub Webhook Adapter
  │
  ├── validate headers
  ├── read bounded raw body
  ├── verify HMAC signature
  ├── filter event type
  ├── parse JSON
  ├── validate PR payload
  └── create ReviewTrigger
  │
  ▼
Transport duplicate check
  │
  ▼
EnqueuePullRequestReview
  │
  ├── create review key
  ├── detect same PR commit
  ├── create ReviewJob
  ├── save job
  └── enqueue review
  │
  ▼
202 Accepted
```

The review then continues asynchronously:

```text
Worker
  │
  ▼
status = processing
  │
  ▼
ReviewProcessor
  │
  ▼
FakeReviewProcessor
  │
  ▼
simulate review work
  │
  ▼
status = completed
```

The webhook request does **not** wait for the review to finish.

---

## Review Identity and Idempotency

The application uses two kinds of duplicate protection.

### Transport-Level Idempotency

Uses:

```text
X-GitHub-Delivery
```

This protects against processing the same webhook delivery more than once.

Example:

```text
delivery-001
delivery-001
```

The second delivery is treated as a duplicate.

Current implementation:

```text
Set<string>
```

This is in-memory and does not survive a process restart.

### Business-Level Idempotency

Different webhook deliveries may still refer to the same code revision.

The business review identity is based on:

```text
repository + pullNumber + headSha
```

Example:

```text
example/android-app:42:abc123
```

If another delivery points to the same repository, PR number, and head SHA, the application should not create another review.

If a developer pushes a new commit:

```text
example/android-app:42:def456
```

it becomes a new review target.

---

## Review Job Lifecycle

A `ReviewTrigger` represents an event that may require review.

A `ReviewJob` represents work accepted by the application.

Current states:

```text
queued
   ↓
processing
   ↓
completed
```

Failure path:

```text
queued
   ↓
processing
   ↓
failed
```

Each job also stores:

- delivery ID
- review key
- repository
- pull request number
- head commit SHA
- error information
- creation time
- last update time

---

## Security Model

Incoming network data is treated as untrusted.

The webhook trust boundary is:

```text
Internet
   ↓
UNTRUSTED HTTP request
   ↓
validate required headers
   ↓
bounded body reading
   ↓
verify GitHub HMAC
   ↓
authenticated request
   ↓
JSON.parse → unknown
   ↓
runtime payload validation
   ↓
ReviewTrigger
   ↓
trusted application model
```

### HMAC Verification

GitHub sends:

```text
X-Hub-Signature-256
```

The server calculates its own signature from:

```text
raw request body
+
GITHUB_WEBHOOK_SECRET
+
HMAC-SHA256
```

The signatures are compared using `timingSafeEqual()`.

The signature is calculated from the exact raw request bytes. The payload is not parsed and re-serialized before verification.

### Request Body Protection

The server limits webhook request bodies before processing them.

Current limit:

```text
2 MiB
```

If the body exceeds the configured limit:

```http
413 Payload Too Large
```

The server checks both:

- declared `Content-Length` when available
- actual received bytes

---

## HTTP API

### Health Check

```http
GET /health
```

Response:

```json
{
  "status": "ok"
}
```

Status:

```text
200 OK
```

---

### GitHub Webhook

```http
POST /webhooks/github
```

Required GitHub headers:

```text
X-GitHub-Event
X-GitHub-Delivery
X-Hub-Signature-256
```

Example supported payload:

```json
{
  "action": "opened",
  "number": 42,
  "repository": {
    "full_name": "example/android-app"
  },
  "pull_request": {
    "head": {
      "sha": "abc123def456"
    }
  },
  "sender": {
    "login": "developer"
  }
}
```

Example success response:

```json
{
  "status": "queued",
  "deliveryId": "delivery-001",
  "reviewKey": "example/android-app:42:abc123def456"
}
```

Status:

```text
202 Accepted
```

Possible response codes:

| Status | Meaning |
|---|---|
| `202` | Review accepted and queued |
| `200` | Event ignored or duplicate |
| `400` | Missing headers, invalid JSON, or invalid payload |
| `401` | Invalid webhook signature |
| `413` | Payload too large |
| `500` | Unexpected server error |

---

### Review Status

```http
GET /reviews/:deliveryId
```

Example:

```http
GET /reviews/status-test-001
```

Example response:

```json
{
  "deliveryId": "status-test-001",
  "status": "processing",
  "repository": "example/android-app",
  "pullNumber": 42,
  "headSha": "abc123def456",
  "error": null,
  "createdAt": "2026-09-07T10:00:00.000Z",
  "updatedAt": "2026-09-07T10:00:01.000Z"
}
```

Possible statuses:

```text
queued
processing
completed
failed
```

If the job does not exist:

```http
404 Not Found
```

---

## Local Development

### Requirements

- Node.js with direct TypeScript support
- npm
- Git
- Bruno for manual API testing

This project currently runs TypeScript directly with Node's strip-only TypeScript support.

Because of that, avoid TypeScript syntax that requires JavaScript code generation, such as constructor parameter properties.

Prefer:

```typescript
private readonly reviewProcessor:
    ReviewProcessor;

constructor(
    reviewProcessor: ReviewProcessor
) {
    this.reviewProcessor =
        reviewProcessor;
}
```

instead of:

```typescript
constructor(
    private readonly reviewProcessor:
        ReviewProcessor
) {}
```

---

## Environment Variables

Create a local `.env` file:

```env
GITHUB_WEBHOOK_SECRET=your-secret-here
```

Generate a high-entropy secret locally:

```bash
openssl rand -hex 32
```

Never commit `.env`.

Recommended `.gitignore` entries:

```gitignore
.env
node_modules/
```

---

## Install Dependencies

```bash
npm install
```

---

## Run Locally

```bash
npm run dev
```

The server runs at:

```text
http://127.0.0.1:3000
```

---

## Bruno Testing

The Bruno collection can be used as a manual integration-test suite.

Recommended cases:

| Test | Expected |
|---|---|
| Health check | `200` |
| Valid PR opened | `202` |
| Valid PR reopened | `202` |
| Valid PR synchronize | `202` |
| Duplicate delivery | `200 duplicate` |
| Same PR + SHA with different delivery | `200 duplicate` |
| New SHA for same PR | `202` |
| Wrong signature | `401` |
| Missing GitHub event header | `400` |
| Missing delivery header | `400` |
| Missing signature header | `400` |
| Unsupported GitHub event | `200 ignored` |
| Unsupported PR action | `200 ignored` |
| Invalid JSON | `400` |
| Invalid PR number type | `400` |
| Invalid PR number value | `400` |
| Missing repository | `400` |
| Missing head SHA | `400` |
| Missing sender | `202` |
| Oversized payload | `413` |
| Unknown route | `404` |
| Unknown review job | `404` |

For webhook tests, Bruno should generate a valid `X-Hub-Signature-256` from the exact request body and the same webhook secret used by the server.

---

## Current Limitations

The project is intentionally still in a development stage.

Current limitations:

- Queue is in memory
- Review job storage is in memory
- Delivery deduplication is in memory
- State disappears after Node restarts
- Deduplication does not work across multiple server instances
- Business idempotency is not yet backed by an atomic durable store
- Worker concurrency is currently `1`
- Review processor is fake
- No real GitHub PR diff fetching yet
- No GitHub review/comment posting yet
- No Antigravity integration yet
- No MCP integration yet
- No production HTTPS/reverse proxy yet
- No durable retry/dead-letter strategy yet

These are deliberate temporary adapters and will be replaced without redesigning the core application.

---

## Planned Architecture

The target architecture is:

```text
GitHub Webhook
      ↓
Webhook Receiver
      ↓
Durable Review Queue
      ↓
Review Worker
      ↓
GitHub PR Data / Diff
      ↓
Antigravity Reviewer
      ↓
Staff Android Reviewer Skill
      ↓
Structured Review Result
      ↓
GitHub Review / Comments
```

Future ports/adapters are expected to include:

```text
ReviewQueue
    ↓
Durable queue adapter

ReviewJobStore
    ↓
Persistent database adapter

ReviewProcessor
    ↓
AntigravityReviewProcessor

GitHubClient
    ↓
GitHub API / MCP adapter
```

---

## Design Principles

The project currently applies:

- Hexagonal Architecture
- Ports and Adapters
- Separation of concerns
- Dependency inversion
- Dependency injection
- Composition root
- Runtime validation of untrusted input
- Fail-fast configuration
- HMAC webhook authentication
- Constant-time signature comparison
- Bounded request bodies
- Asynchronous job processing
- Explicit job lifecycle
- Transport-level idempotency
- Business-level idempotency
- Replaceable infrastructure

---

## Why This Architecture?

The goal is to make external technologies replaceable.

Today:

```text
ReviewQueue
    ↓
InMemoryReviewQueue

ReviewJobStore
    ↓
InMemoryReviewJobStore

ReviewProcessor
    ↓
FakeReviewProcessor
```

Later:

```text
ReviewQueue
    ↓
Durable queue

ReviewJobStore
    ↓
PostgreSQL / persistent storage

ReviewProcessor
    ↓
AntigravityReviewProcessor
```

The core application should remain largely unchanged.

That is the main reason for using Hexagonal Architecture in this project.

---

## Project Status

Current milestone:

```text
GitHub webhook receiver
        ↓
authenticated request boundary
        ↓
runtime payload validation
        ↓
domain normalization
        ↓
transport deduplication
        ↓
business idempotency
        ↓
asynchronous review job
        ↓
queue + worker
        ↓
job state tracking
        ↓
review status API
```

The next major milestone is replacing the fake reviewer with real GitHub PR data access and, later, Antigravity-based AI review processing.

---

## License

Add the license you want to use for this repository before publishing it publicly.
