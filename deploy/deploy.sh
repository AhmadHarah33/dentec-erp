#!/bin/sh
# (Re)deploy the ERP on the ZimaOS box. The box has no `docker compose`, so this
# is plain docker. Run from /DATA/AppData/dentec-erp after copying the source to
# ./src and with .env.app and .env.tunnel present (see DEPLOY.md).
#
#   ./deploy.sh
#
# Layout: the app joins Supabase's network (to reach the `db` container) and a
# private `dentec-erp-edge` network shared with the tunnel. The tunnel is on the
# private network only, so the public side can never reach Supabase. Only the
# app is published. Nothing here touches Supabase's own containers or volumes.

set -eu
cd "$(dirname "$0")"

IMAGE=dentec-erp:latest
EDGE=dentec-erp-edge
export DOCKER_BUILDKIT=0   # no buildx on this box; the classic builder is enough

docker build -t "$IMAGE" ./src

docker network inspect "$EDGE" >/dev/null 2>&1 || docker network create "$EDGE" >/dev/null

docker rm -f dentec-erp >/dev/null 2>&1 || true
docker run -d --name dentec-erp --restart unless-stopped \
  --network "$EDGE" --network-alias app \
  --env-file .env.app -e APP_URL=https://erp.dentec.cloud \
  "$IMAGE" >/dev/null
docker network connect supabase_default dentec-erp

docker rm -f dentec-erp-tunnel >/dev/null 2>&1 || true
# cloudflared reads TUNNEL_TOKEN; passed by name so it never appears in the
# command line or `docker ps`.
TUNNEL_TOKEN="$(sed -n 's/^CLOUDFLARE_TUNNEL_TOKEN=//p' .env.tunnel)"
export TUNNEL_TOKEN
docker run -d --name dentec-erp-tunnel --restart unless-stopped \
  --network "$EDGE" -e TUNNEL_TOKEN \
  cloudflare/cloudflared:latest tunnel --no-autoupdate run >/dev/null
unset TUNNEL_TOKEN

echo "deployed; logs: docker logs -f dentec-erp"
