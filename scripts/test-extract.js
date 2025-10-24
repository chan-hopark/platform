#!/usr/bin/env node

// 네이버 스마트스토어 & 쿠팡 크롤러 테스트 스크립트

import https from 'https';
import http from 'http';

// 서버 URL 설정
const SERVER_URL = process.argv[2] || 'http://localhost:3000';

console.log('🧪 크롤러 테스트 시작...');
console.log(`📍 서버 URL: ${SERVER_URL}`);

// HTTP 요청 헬퍼
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };
    
    const req = client.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode, data: jsonData });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

// Health Check 테스트
async function testHealth() {
  console.log('\n🔍 Health Check 테스트...');
  try {
    const response = await makeRequest(`${SERVER_URL}/api/health`);
    if (response.status === 200) {
      console.log('✅ Health Check 성공');
      console.log(`   - 상태: ${response.data.status}`);
      console.log(`   - Node.js: ${response.data.nodeVersion}`);
      console.log(`   - 쿠키: ${response.data.cookie.hasCookie ? '✅' : '❌'}`);
      console.log(`   - Polyfills: File=${response.data.polyfills.file}, Blob=${response.data.polyfills.blob}`);
    } else {
      console.log(`❌ Health Check 실패: ${response.status}`);
    }
  } catch (error) {
    console.log(`❌ Health Check 오류: ${error.message}`);
  }
}

// 네이버 스마트스토어 테스트
async function testNaver() {
  console.log('\n🛒 네이버 스마트스토어 테스트...');
  const testUrl = 'https://smartstore.naver.com/nakedorigin/products/12021574074';
  console.log(`   URL: ${testUrl}`);
  
  try {
    const response = await makeRequest(`${SERVER_URL}/api/extract`, {
      method: 'POST',
      body: { url: testUrl }
    });
    
    if (response.status === 200) {
      if (response.data.ok) {
        console.log('✅ 네이버 테스트 성공');
        console.log(`   - 벤더: ${response.data.vendor}`);
        console.log(`   - Product ID: ${response.data.productId}`);
        console.log(`   - Channel ID: ${response.data.channelId}`);
        console.log(`   - 상품명: ${response.data.product.name || 'N/A'}`);
        console.log(`   - 가격: ${response.data.product.price || 'N/A'}`);
        console.log(`   - 처리 시간: ${response.data.durationMs}ms`);
      } else {
        console.log('❌ 네이버 테스트 실패');
        console.log(`   - 오류: ${response.data.error}`);
        if (response.data.debug && response.data.debug.errors) {
          response.data.debug.errors.forEach(err => {
            console.log(`   - 상세: ${err}`);
          });
        }
      }
    } else {
      console.log(`❌ 네이버 테스트 HTTP 오류: ${response.status}`);
    }
  } catch (error) {
    console.log(`❌ 네이버 테스트 오류: ${error.message}`);
  }
}

// 쿠팡 테스트
async function testCoupang() {
  console.log('\n🛍️ 쿠팡 테스트...');
  const testUrl = 'https://www.coupang.com/vp/products/123456789';
  console.log(`   URL: ${testUrl}`);
  
  try {
    const response = await makeRequest(`${SERVER_URL}/api/extract`, {
      method: 'POST',
      body: { url: testUrl }
    });
    
    if (response.status === 200) {
      if (response.data.ok) {
        console.log('✅ 쿠팡 테스트 성공');
        console.log(`   - 벤더: ${response.data.vendor}`);
        console.log(`   - 상품명: ${response.data.product.name || 'N/A'}`);
        console.log(`   - 가격: ${response.data.product.price || 'N/A'}`);
        console.log(`   - 이미지 수: ${response.data.product.images ? response.data.product.images.length : 0}`);
        console.log(`   - 처리 시간: ${response.data.durationMs}ms`);
      } else {
        console.log('❌ 쿠팡 테스트 실패');
        console.log(`   - 오류: ${response.data.error}`);
        if (response.data.debug && response.data.debug.errors) {
          response.data.debug.errors.forEach(err => {
            console.log(`   - 상세: ${err}`);
          });
        }
      }
    } else {
      console.log(`❌ 쿠팡 테스트 HTTP 오류: ${response.status}`);
    }
  } catch (error) {
    console.log(`❌ 쿠팡 테스트 오류: ${error.message}`);
  }
}

// 메인 실행
async function main() {
  await testHealth();
  await testNaver();
  await testCoupang();
  
  console.log('\n✅ 테스트 완료!');
  console.log('\n💡 팁:');
  console.log('   - 서버가 실행 중인지 확인하세요: npm start');
  console.log('   - 환경 변수가 설정되었는지 확인하세요: NAVER_COOKIE, NAVER_USER_AGENT');
  console.log('   - Railway 배포 시: https://your-app.railway.app/api/health');
}

main().catch(console.error);
