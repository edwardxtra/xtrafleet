#!/bin/bash

# Script to add official XtraFleet logos to the repository
# Run this from the project root directory

echo "🎨 Adding XtraFleet official logos..."

# Check if we're in the right directory
if [ ! -d "public" ]; then
    echo "❌ Error: Must run from project root (public directory not found)"
    exit 1
fi

# Copy logos from uploads to public directory
echo "📋 Copying logo files..."
cp /mnt/user-data/uploads/Xfleet_Logo.jpg public/xtrafleet-logo.webp
cp /mnt/user-data/uploads/Logomark.jpg public/xtrafleet-logomark.jpg

# Verify files were copied
if [ ! -f "public/xtrafleet-logo.webp" ] || [ ! -f "public/xtrafleet-logomark.jpg" ]; then
    echo "❌ Error: Failed to copy logo files"
    exit 1
fi

echo "✅ Logos copied successfully!"
echo ""
echo "📦 Files added:"
echo "  - public/xtrafleet-logo.webp (full logo with text)"
echo "  - public/xtrafleet-logomark.jpg (X symbol only)"
echo ""
echo "Next steps:"
echo "  git add public/"
echo "  git commit -m 'feat: add official XtraFleet logos'"
echo "  git push origin main"
