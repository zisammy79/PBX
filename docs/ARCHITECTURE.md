# Architecture

## Overview

```mermaid
flowchart TB
  subgraph clients [Clients]
    Browser[Browser WebRTC Softphone]
    SIPPhone[SIP Phones]
    APIClient[API Integrators]
  end

  subgraph edge [Edge]
    RP[Reverse Proxy TLS]
    TURN[coturn STUN/TURN]
  end

  subgraph control [Control Plane]
    Web[Next.js Web App]
    API[NestJS API]
    Worker[Background Worker]
    PG[(PostgreSQL)]
    Redis[(Redis)]
    NATS[NATS JetStream]
  end

  subgraph media [Media Plane]
    TC[Telephony Controller]
    Asterisk[Asterisk PJSIP]
    AIGW[AI Media Gateway]
  end

  subgraph external [External]
    SIPTrunk[SIP Carriers]
    AIProviders[AI Providers]
    S3[S3 Recordings]
    Stripe[Stripe Billing]
  end

  Browser --> RP
  SIPPhone --> Asterisk
  APIClient --> RP
  RP --> Web
  RP --> API
  Browser --> TURN
  API --> PG
  API --> Redis
  API --> NATS
  Worker --> PG
  Worker --> NATS
  TC --> Asterisk
  TC --> API
  AIGW --> Asterisk
  AIGW --> AIProviders
  Asterisk --> SIPTrunk
  API --> S3
  Worker --> Stripe
```

## Planes

### Control plane

Manages tenants, users, configuration, billing metadata, and API access. Never holds active call media state.

### Media plane

Handles SIP sessions, RTP/WebSocket audio, bridges, recording streams, and AI audio pipelines.

## Monorepo layout

See [README.md](../README.md#repository-structure).

## Technology choices

| Component | Choice | Rationale |
|-----------|--------|-----------|
| API | NestJS + Fastify | Structured DI, OpenAPI, TypeScript |
| Web | Next.js | SSR, React ecosystem |
| AI gateway | Go | Low-latency concurrent audio |
| Telephony controller | Go | ARI reliability, concurrency |
| Database | PostgreSQL + Drizzle | RLS support, typed migrations |
| Events | NATS JetStream | Durable tenant-scoped subjects |
| Storage | S3-compatible | Recordings, exports |
| Observability | OpenTelemetry + Prometheus | Standard metrics/traces |

## Scale-out path

Documented in [TELEPHONY_ARCHITECTURE.md](./TELEPHONY_ARCHITECTURE.md). Kamailio + RTPengine front multiple Asterisk nodes; control plane remains shared; active call state stays on media nodes.

## Foundation stage deliverables

- Monorepo scaffolding
- Full data model schema
- Auth with JWT and permission checks
- Tenant guard (no client-supplied tenant trust)
- Tenant and extension APIs
- Health/readiness endpoints
- Local Docker infrastructure
