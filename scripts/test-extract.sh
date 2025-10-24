#!/bin/bash

# 네이버 스마트스토어 & 쿠팡 크롤러 테스트 스크립트

echo "🧪 크롤러 테스트 시작..."

# 서버 URL 설정
SERVER_URL="http://localhost:3000"
if [ ! -z "$1" ]; then
    SERVER_URL="$1"
fi

echo "📍 서버 URL: $SERVER_URL"

# Health Check
echo ""
echo "🔍 Health Check 테스트..."
curl -s "$SERVER_URL/api/health" | jq '.' || echo "❌ Health Check 실패"

# 테스트 URL들
NAVER_URL="https://smartstore.naver.com/nakedorigin/products/12021574074"
COUPANG_URL="https://www.coupang.com/vp/products/123456789"

echo ""
echo "🛒 네이버 스마트스토어 테스트..."
echo "URL: $NAVER_URL"

curl -X POST "$SERVER_URL/api/extract" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"$NAVER_URL\"}" \
  -s | jq '.' || echo "❌ 네이버 테스트 실패"

echo ""
echo "🛍️ 쿠팡 테스트..."
echo "URL: $COUPANG_URL"

curl -X POST "$SERVER_URL/api/extract" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"$COUPANG_URL\"}" \
  -s | jq '.' || echo "❌ 쿠팡 테스트 실패"

echo ""
echo "✅ 테스트 완료!"
