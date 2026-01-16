#!/bin/bash

# Domain Health Check Script
# Verifies that custom domain and Firebase domain are serving the same content

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Checking domain health...${NC}\n"

# Domains to check
FIREBASE_DOMAIN="https://studio-5112915880-e9ca2.web.app"
CUSTOM_DOMAIN="https://xtrafleet.com"

# Function to get build info from domain
get_build_info() {
    local domain=$1
    local response=$(curl -sI "$domain" 2>&1)
    
    if [ $? -ne 0 ]; then
        echo "ERROR: Could not reach $domain"
        return 1
    fi
    
    # Extract relevant headers
    local date=$(echo "$response" | grep -i "^date:" | cut -d' ' -f2-)
    local cache=$(echo "$response" | grep -i "^x-nextjs-cache:" | cut -d' ' -f2- || echo "N/A")
    local cache_status=$(echo "$response" | grep -i "^cdn-cache-status:" | cut -d' ' -f2- || echo "N/A")
    
    echo "$date|$cache|$cache_status"
}

# Function to fetch a page and get content hash
get_content_hash() {
    local domain=$1
    local path=${2:-"/"}
    curl -sL "$domain$path" 2>/dev/null | md5sum | cut -d' ' -f1
}

echo "📡 Checking Firebase domain: $FIREBASE_DOMAIN"
FIREBASE_INFO=$(get_build_info "$FIREBASE_DOMAIN")
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Firebase domain unreachable${NC}"
    exit 1
fi
FIREBASE_HASH=$(get_content_hash "$FIREBASE_DOMAIN")

echo -e "${GREEN}✓ Firebase domain responding${NC}"
echo "   Date: $(echo $FIREBASE_INFO | cut -d'|' -f1)"
echo "   Content hash: $FIREBASE_HASH"
echo ""

echo "🌐 Checking custom domain: $CUSTOM_DOMAIN"
CUSTOM_INFO=$(get_build_info "$CUSTOM_DOMAIN")
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Custom domain unreachable${NC}"
    exit 1
fi
CUSTOM_HASH=$(get_content_hash "$CUSTOM_DOMAIN")

echo -e "${GREEN}✓ Custom domain responding${NC}"
echo "   Date: $(echo $CUSTOM_INFO | cut -d'|' -f1)"
echo "   Content hash: $CUSTOM_HASH"
echo ""

# Compare content hashes
echo "🔎 Comparing content..."
if [ "$FIREBASE_HASH" = "$CUSTOM_HASH" ]; then
    echo -e "${GREEN}✅ SUCCESS: Both domains serving identical content${NC}"
    echo ""
    echo "Summary:"
    echo "  • Firebase: $FIREBASE_DOMAIN"
    echo "  • Custom:   $CUSTOM_DOMAIN"
    echo "  • Status:   IN SYNC ✓"
    exit 0
else
    echo -e "${RED}❌ WARNING: Domains serving different content!${NC}"
    echo ""
    echo "Details:"
    echo -e "  Firebase hash: ${YELLOW}$FIREBASE_HASH${NC}"
    echo -e "  Custom hash:   ${YELLOW}$CUSTOM_HASH${NC}"
    echo ""
    echo -e "${YELLOW}This usually means:${NC}"
    echo "  1. DNS records are not properly configured"
    echo "  2. CDN cache hasn't updated yet (wait 5-10 minutes)"
    echo "  3. Custom domain is pointing to wrong backend"
    echo ""
    echo -e "${BLUE}To fix:${NC}"
    echo "  1. Check Firebase Console → Hosting → Domains"
    echo "  2. Verify DNS records match Firebase requirements"
    echo "  3. Wait for DNS propagation (up to 10 minutes)"
    echo "  4. Clear browser cache and try again"
    exit 1
fi
