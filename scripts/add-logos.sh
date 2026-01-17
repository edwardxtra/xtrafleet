#!/bin/bash

# Script to add official XtraFleet logos to the project
# Run this from the project root directory

echo "🎨 Adding XtraFleet logos..."

# Check if we're in the right directory
if [ ! -d "public" ]; then
    echo "❌ Error: Must run from project root (public/ directory not found)"
    exit 1
fi

# Copy the logo files from uploads to public directory
if [ -f "/mnt/user-data/uploads/Xfleet_Logo.jpg" ]; then
    cp /mnt/user-data/uploads/Xfleet_Logo.jpg public/xtrafleet-logo.webp
    echo "✅ Copied full logo (xtrafleet-logo.webp)"
else
    echo "⚠️  Full logo not found at /mnt/user-data/uploads/Xfleet_Logo.jpg"
fi

if [ -f "/mnt/user-data/uploads/Logomark.jpg" ]; then
    cp /mnt/user-data/uploads/Logomark.jpg public/xtrafleet-logomark.jpg
    echo "✅ Copied logomark (xtrafleet-logomark.jpg)"
else
    echo "⚠️  Logomark not found at /mnt/user-data/uploads/Logomark.jpg"
fi

echo ""
echo "📝 Next steps:"
echo "  git add public/"
echo "  git commit -m 'feat: add official XtraFleet logos'"
echo "  git push origin main"
