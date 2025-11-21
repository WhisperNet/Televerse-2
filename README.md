# CareForAll Monorepo

This repository hosts the infrastructure, backend microservices, and frontend for the CareForAll donation platform MVP. Follow `PHASE.md` for the execution plan.

## Environment Variables

Copy `.env.example` to `.env` (or edit `.env` directly) and keep the following keys in sync with Docker Compose:

```
MONGODB_URI=mongodb://mongo:27017
RABBITMQ_URI=amqp://admin:admin123@rabbitmq:5672
JWT_SECRET=hackathon-secret-2025
WEBHOOK_SECRET=webhook-secret-123
RABBITMQ_EXCHANGE=careforall.events
```

When running locally (outside Docker), you can export `LOG_DIRECTORY=./logs` to keep Winston from writing into `/var/log`.
