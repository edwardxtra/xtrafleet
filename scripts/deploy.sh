#!/bin/bash
set -e

echo "🚀 Starting deployment..."

# Run pre-deploy checks
./scripts/pre-deploy.sh

# Deploy
echo "📤 Deploying to Firebase..."
firebase deploy --only hosting

echo ""
echo "✅ Deployment complete!"
echo "🌐 Live at: https://xtrafleet.com"
