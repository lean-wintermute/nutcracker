#!/bin/bash
# Sync static image catalog to Firestore after deployment
#
# Usage:
#   ./scripts/sync-catalog.sh [--prod|--local]
#
# This script calls the syncImageCatalog Cloud Function to upload
# the static image-catalog.json to Firestore's image_catalog collection.

set -e

# Default to production
ENV="${1:-prod}"

if [ "$ENV" == "--local" ] || [ "$ENV" == "local" ]; then
    # Local emulator
    ENDPOINT="http://127.0.0.1:5001/nutcracker-3e8fb/us-central1/syncImageCatalog"
    echo "Syncing to local emulator..."
elif [ "$ENV" == "--prod" ] || [ "$ENV" == "prod" ]; then
    # Production
    ENDPOINT="https://us-central1-nutcracker-3e8fb.cloudfunctions.net/syncImageCatalog"
    echo "Syncing to production..."
else
    echo "Unknown environment: $ENV"
    echo "Usage: $0 [--prod|--local]"
    exit 1
fi

echo "Calling: $ENDPOINT"

RESPONSE=$(curl -s -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -d '{}')

echo "Response: $RESPONSE"

# Check for success
if echo "$RESPONSE" | grep -q '"success":true'; then
    SYNCED=$(echo "$RESPONSE" | grep -o '"synced":[0-9]*' | cut -d: -f2)
    echo "Successfully synced $SYNCED images to Firestore catalog."
else
    echo "Sync failed. Check response above."
    exit 1
fi
