#!/usr/bin/env bash
# NexusID daily dev startup
cd ~/Documents/nexusid

echo "=== 1. Checking ports ==="
lsof -i :3000 -i :3001 -i :4000 2>/dev/null | grep LISTEN || echo "Ports 3000, 3001, 4000 free"

echo "=== 2. Postgres (Docker) ==="
docker ps --filter name=nexusid-postgres --format "{{.Status}}" | grep -q "healthy" \
  && echo "✓ Postgres healthy on :5432" \
  || docker start nexusid-postgres 2>/dev/null && echo "✓ Started nexusid-postgres"

echo "=== 3. Prisma status ==="
npx prisma migrate status --schema=services/backend/prisma/schema.prisma 2>/dev/null \
  || echo "⚠ Check prisma schema path"

echo "=== 4. Backend (port 4000) ==="
npm run dev -w services/backend &
sleep 4
curl -s http://localhost:4000/health && echo " ✓ Backend up" || echo " ✗ Backend not responding yet"

echo "=== 5. Web (port 3000) ==="
npm run dev -w apps/web &

echo "=== 6. Demo shop — Shop A (port 3001) ==="
# Server-side only: SHOP_A_API_KEY (defaults to the key from npm run seed:demo)
npm run dev -w apps/demo-shop &

echo ""
echo "================================"
echo "Stack started."
echo "  Web:     http://localhost:3000"
echo "  Shop A:  http://localhost:3001"
echo "  Backend: http://localhost:4000/health"
echo ""
echo "Next: cd ~/Documents/nexusid && claude"
echo "================================"
