#!/bin/bash
set -e

echo "🔍 Running pre-deploy checks..."

# 1. TypeScript check
echo "📝 Checking TypeScript..."
npx tsc --noEmit
if [ $? -ne 0 ]; then
  echo "❌ TypeScript errors found!"
  exit 1
fi
echo "✅ TypeScript OK"

# 2. Build check
echo "🏗️ Building..."
npm run build
if [ $? -ne 0 ]; then
  echo "❌ Build failed!"
  exit 1
fi
echo "✅ Build OK"

# 3. Check for common issues
echo "🔎 Checking for common issues..."

# Check for broken template literals in API routes
BROKEN=$(grep -rn "\.collection\`\|\.doc\`" src/app/api/ 2>/dev/null || true)
if [ -n "$BROKEN" ]; then
  echo "❌ Found broken template literal syntax:"
  echo "$BROKEN"
  exit 1
fi
echo "✅ No broken template literals"

echo ""
echo "✅ All pre-deploy checks passed!"
