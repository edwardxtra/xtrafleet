#!/bin/bash

# Migration script to consolidate billing routes
# Moves /dashboard/admin/billing to /admin/billing and updates all references

set -e

echo "🔄 Starting billing route migration..."

# Check if we're in the right directory
if [ ! -d "src/app" ]; then
    echo "❌ Error: Must run from project root"
    exit 1
fi

# 1. Backup old admin/billing if it exists
if [ -d "src/app/admin/billing" ]; then
    echo "📦 Backing up old admin/billing..."
    rm -rf src/app/admin/billing.backup
    mv src/app/admin/billing src/app/admin/billing.backup
fi

# 2. Copy dashboard/admin/billing to admin/billing
echo "📋 Copying dashboard/admin/billing to admin/billing..."
cp -r src/app/dashboard/admin/billing src/app/admin/

# 3. Update all path references
echo "🔧 Updating path references..."
find src/app/admin/billing -type f -name "*.tsx" -o -name "*.ts" | while read file; do
    sed -i.bak 's|/dashboard/admin/billing|/admin/billing|g' "$file"
    rm "${file}.bak"
done

# 4. Remove the entire dashboard/admin directory
echo "🗑️  Removing dashboard/admin directory..."
rm -rf src/app/dashboard/admin

# 5. Clean up backup
if [ -d "src/app/admin/billing.backup" ]; then
    rm -rf src/app/admin/billing.backup
fi

echo "✅ Migration complete!"
echo ""
echo "Next steps:"
echo "  git add src/app/admin src/app/dashboard"
echo "  git commit -m 'refactor: consolidate billing to /admin/billing'"
echo "  git push origin main"
