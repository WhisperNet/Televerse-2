# Infrastructure Validation Guide

1. **Start stack**
   ```bash
   docker compose up -d
   ```
2. **Check containers**
   ```bash
   docker ps --format 'table {{.Names}}\t{{.Status}}'
   ```
3. **Mongo replica set**
   ```bash
   docker exec careforall-mongo mongosh --quiet --eval "rs.status().ok"
   ```
4. **RabbitMQ management API**
   ```bash
   curl -u admin:admin123 http://localhost:15672/api/overview
   ```
5. **Prometheus health**
   ```bash
   curl http://localhost:9090/-/healthy
   ```
6. **API gateway health**
   ```bash
   curl http://localhost:8080/healthz
   ```
7. **Grafana UI** – open http://localhost:3000/login (admin/admin123).

Troubleshooting tips: use `docker logs <service>` for failing containers and rerun `docker compose up -d <service>` after edits. Ensure `.env` matches `docker-compose.yml` env references.
