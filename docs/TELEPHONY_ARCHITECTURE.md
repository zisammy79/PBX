# Telephony Architecture

## Initial deployment (single node)

```mermaid
sequenceDiagram
  participant ExtA as Extension A
  participant Asterisk
  participant TC as Telephony Controller
  participant ExtB as Extension B
  participant API as Control Plane API

  ExtA->>Asterisk: INVITE (PJSIP)
  Asterisk->>TC: ARI StasisStart
  TC->>API: Record call / correlation ID
  TC->>Asterisk: Bridge + dial ExtB
  ExtB->>Asterisk: 200 OK
  Asterisk->>ExtA: RTP media
  Asterisk->>ExtB: RTP media
  Note over ExtA,ExtB: Bidirectional audio
  ExtA->>Asterisk: BYE
  TC->>API: CDR + usage event
```

## Asterisk configuration

- **PJSIP** for endpoints, trunks, WebRTC
- **ARI** for programmatic call control (internal network only)
- **Tenant contexts**: `t_{slug}` — isolated dialplan per tenant
- **Resource naming**: `{slug}_ext_{number}`, `{slug}_trunk_{name}`

## Media paths

| Path | Transport | Use case |
|------|-----------|----------|
| Desk phone | SIP UDP/TCP/TLS + RTP/SRTP | Hardware phones |
| Browser softphone | SIP WSS + WebRTC | Tenant portal |
| AI agent | External Media / chan_websocket | Realtime AI audio |
| Carrier trunk | SIP + RTP | Inbound/outbound PSTN |

## AI call flow

```mermaid
sequenceDiagram
  participant Caller
  participant Asterisk
  participant TC as Telephony Controller
  participant AIGW as AI Media Gateway
  participant AI as OpenAI/Gemini

  Caller->>Asterisk: Inbound call
  Asterisk->>TC: Route to AI agent
  TC->>AIGW: Start session
  AIGW->>AI: WebSocket realtime
  loop Bidirectional audio
    Asterisk->>AIGW: RTP/WS audio
    AIGW->>AI: Provider audio
    AI->>AIGW: Response audio
    AIGW->>Asterisk: Caller audio
  end
  AI->>AIGW: transfer_call tool
  AIGW->>TC: Transfer request
  TC->>Asterisk: Attended transfer to extension
```

## Scale-out architecture (future)

```mermaid
flowchart LR
  SIP[SIP Clients] --> KAM[Kamailio]
  KAM --> RTP[RTPengine]
  RTP --> AS1[Asterisk Node 1]
  RTP --> AS2[Asterisk Node 2]
  KAM --> TC[Telephony Controller]
  TC --> API[Control Plane]
```

- Kamailio: registrar, dispatcher, tenant-aware routing
- RTPengine: media relay, transcoding at scale
- Consistent hashing by tenant for sticky routing
- Health checks and automatic failover
- No shared active call state across nodes

## Public ports (production)

| Port | Protocol | Purpose |
|------|----------|---------|
| 443 | TCP | Web, API, WSS |
| 5060 | UDP/TCP | SIP (restrict by provider IP where possible) |
| 5061 | TCP | SIP TLS |
| 10000-20000 | UDP | RTP |
| 3478 | UDP/TCP | TURN |
| 5349 | TCP | TURN TLS |

ARI (8088), AMI, PostgreSQL, Redis, NATS: **internal only**.

## Foundation stage status

Asterisk automation and ARI integration are **not yet implemented**. Schema and tenant-prefixed resource naming are in place.
