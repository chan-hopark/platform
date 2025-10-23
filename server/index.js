// index.js (네이버 스마트스토어 API 크롤러 - node-fetch 기반)

// undici 체크 및 차단
try {
  const undiciPath = require.resolve('undici');
  console.log("❌ undici가 감지되었습니다:", undiciPath);
  console.log("🔄 undici 제거를 시도합니다...");
  
  // undici 모듈 차단
  const Module = require('module');
  const originalRequire = Module.prototype.require;
  Module.prototype.require = function(id) {
    if (id === 'undici' || id.includes('undici')) {
      throw new Error('undici is blocked');
    }
    return originalRequire.apply(this, arguments);
  };
  
  console.log("✅ undici 차단 완료");
} catch (error) {
  console.log("✅ undici가 설치되지 않음");
}

// Node.js 18 File/Blob polyfill (undici 호환성)
if (typeof globalThis.File === 'undefined' || typeof globalThis.Blob === 'undefined') {
  try {
    // node:buffer에서 Blob 가져오기
    const { Blob } = require('node:buffer');
    
    // Blob polyfill
    if (typeof globalThis.Blob === 'undefined') {
      globalThis.Blob = Blob;
      console.log("✅ Blob polyfill 적용 완료");
    }
    
    // File polyfill (Blob 상속)
    if (typeof globalThis.File === 'undefined') {
      globalThis.File = class File extends globalThis.Blob {
        constructor(chunks, filename, options = {}) {
          super(chunks, options);
          this.name = filename || '';
          this.lastModified = options.lastModified || Date.now();
        }
      };
      console.log("✅ File polyfill 적용 완료");
    }
    
    // 추가 polyfill들
    if (typeof globalThis.FormData === 'undefined') {
      const { FormData } = require('formdata-node');
      globalThis.FormData = FormData;
      console.log("✅ FormData polyfill 적용 완료");
    }
    
    console.log("✅ 모든 polyfill 적용 완료 (Node.js 18 호환)");
  } catch (error) {
    console.log("⚠️ Polyfill 적용 실패:", error.message);
    console.log("🔄 대체 방법으로 진행...");
  }
}

import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";
import { fileURLToPath } from "url";
import http from "http";
import https from "https";
import fetch from "node-fetch";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 환경변수 로딩 확인 (배포 시 제거 예정)
console.log("🔧 환경변수 로딩 상태:");
console.log("  - NAVER_COOKIE:", process.env.NAVER_COOKIE ? "✅ 설정됨" : "❌ 미설정");
console.log("  - NAVER_USER_AGENT:", process.env.NAVER_USER_AGENT ? "✅ 설정됨" : "❌ 미설정");
console.log("  - NAVER_ACCEPT:", process.env.NAVER_ACCEPT ? "✅ 설정됨" : "❌ 미설정");
console.log("  - NAVER_ACCEPT_LANGUAGE:", process.env.NAVER_ACCEPT_LANGUAGE ? "✅ 설정됨" : "❌ 미설정");
console.log("  - NODE_ENV:", process.env.NODE_ENV || "development");
console.log("  - PORT:", process.env.PORT || "3000");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// 정적 파일 서빙 (빌드된 React 앱)
const buildPath = path.join(__dirname, "..", "dist");
if (fs.existsSync(buildPath)) {
  console.log("📁 정적 파일 서빙:", buildPath);
  app.use(express.static(buildPath));
} else {
  console.log("⚠️ 빌드된 파일이 없습니다. npm run build를 실행하세요.");
}

// debug output dir (Railway 환경에 맞게 수정)
const OUTDIR = process.env.NODE_ENV === 'production' 
  ? path.join("/app", "debug-output") 
  : path.join(__dirname, "..", "debug-output");
try { 
  fs.mkdirSync(OUTDIR, { recursive: true }); 
  console.log("📁 디버그 출력 디렉토리:", OUTDIR);
} catch (e) {
  console.log("⚠️ 디버그 디렉토리 생성 실패:", e.message);
}

// 환경변수 확인
let NAVER_COOKIE = process.env.NAVER_COOKIE;
const NAVER_USER_AGENT = process.env.NAVER_USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const NAVER_ACCEPT = process.env.NAVER_ACCEPT || "application/json, text/plain, */*";
const NAVER_ACCEPT_LANGUAGE = process.env.NAVER_ACCEPT_LANGUAGE || "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7";

// 쿠키 갱신 관련 변수
let lastCookieUpdate = 0;
const COOKIE_UPDATE_INTERVAL = 6 * 60 * 60 * 1000; // 6시간

// User-Agent 로테이션
const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15"
];

let currentUserAgentIndex = 0;

if (!NAVER_COOKIE) {
  console.log("⚠️ NAVER_COOKIE 환경변수가 설정되지 않았습니다.");
  console.log("   Railway Variables 탭에서 NAVER_COOKIE를 설정하세요.");
  console.log("   또는 .env 파일에 NAVER_COOKIE를 설정하세요.");
}

// node-fetch 설정 (undici 문제 해결)
const fetchOptions = {
  timeout: 15000,
  agent: new https.Agent({ keepAlive: true })
};

// 쿠키 상태 관리
let cookieStatus = {
  lastUpdate: 0,
  isUpdating: false,
  updateCount: 0,
  lastError: null
};

// 자동 쿠키 갱신 함수 (로그인 없이)
async function refreshNaverCookie(forceUpdate = false) {
  // 이미 갱신 중이면 대기
  if (cookieStatus.isUpdating && !forceUpdate) {
    console.log("⏳ 쿠키 갱신이 이미 진행 중입니다...");
    return false;
  }

  try {
    cookieStatus.isUpdating = true;
    console.log("🔄 자동 쿠키 갱신 시작...");
    
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });
    
    // User-Agent 로테이션 사용
    const currentUserAgent = getNextUserAgent();

    const context = await browser.newContext({
      userAgent: currentUserAgent,
      viewport: { width: 1920, height: 1080 }
    });
    
    const page = await context.newPage();
    
    // 스마트스토어 메인 페이지 방문
    await page.goto('https://smartstore.naver.com', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    // 잠시 대기 (쿠키 설정 시간)
    await page.waitForTimeout(3000);
    
    // document.cookie에서 쿠키 추출
    const documentCookies = await page.evaluate(() => {
      return document.cookie;
    });
    
    // Playwright context에서도 쿠키 추출
    const contextCookies = await context.cookies();
    const contextCookieString = contextCookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    
    // 더 긴 쿠키 문자열 선택
    const cookieString = documentCookies.length > contextCookieString.length ? documentCookies : contextCookieString;
    
    if (cookieString && cookieString.length > 10) {
      NAVER_COOKIE = cookieString;
      lastCookieUpdate = Date.now();
      cookieStatus.lastUpdate = Date.now();
      cookieStatus.updateCount++;
      cookieStatus.lastError = null;
      
      console.log("✅ 쿠키 자동 갱신 완료");
      console.log(`📄 새 쿠키 길이: ${cookieString.length} 문자`);
      console.log(`🔄 사용된 User-Agent: ${currentUserAgent.substring(0, 50)}...`);
      
      return true;
    } else {
      throw new Error("쿠키 추출 실패: 유효하지 않은 쿠키");
    }
    
  } catch (error) {
    cookieStatus.lastError = error.message;
    console.log("❌ 쿠키 자동 갱신 실패:", error.message);
    return false;
  } finally {
    cookieStatus.isUpdating = false;
    if (browser) {
      await browser.close();
    }
  }
}

// User-Agent 로테이션 함수
function getNextUserAgent() {
  const userAgent = userAgents[currentUserAgentIndex];
  currentUserAgentIndex = (currentUserAgentIndex + 1) % userAgents.length;
  console.log(`🔄 User-Agent 로테이션: ${userAgent.substring(0, 50)}...`);
  return userAgent;
}

// 쿠키 갱신 필요 여부 확인
async function checkAndRefreshCookie(forceUpdate = false) {
  const now = Date.now();
  
  // 강제 갱신 또는 주기적 갱신 (6시간마다)
  if (forceUpdate || now - lastCookieUpdate > COOKIE_UPDATE_INTERVAL) {
    console.log("⏰ 쿠키 갱신 필요 감지");
    return await refreshNaverCookie(forceUpdate);
  }
  
  return false;
}

// API 호출 전 쿠키 최신성 확인
async function ensureFreshCookie() {
  const now = Date.now();
  const timeSinceLastUpdate = now - lastCookieUpdate;
  
  // 5시간 이상 지났으면 갱신
  if (timeSinceLastUpdate > 5 * 60 * 60 * 1000) {
    console.log("🔄 쿠키가 오래되어 갱신 시도...");
    return await refreshNaverCookie(true);
  }
  
  return true;
}

// 기본 헤더 설정 (User-Agent 로테이션 포함)
const getDefaultHeaders = (referer) => ({
  'cookie': NAVER_COOKIE,
  'user-agent': getNextUserAgent(),
  'accept': NAVER_ACCEPT,
  'referer': referer,
  'accept-language': NAVER_ACCEPT_LANGUAGE,
  'accept-encoding': 'gzip, deflate, br, zstd'
});

// 캐시 설정 (60초)
const cache = new Map();
const CACHE_DURATION = 60000; // 60초

// health check
app.get("/api/health", (_req, res) => res.json({ 
  ok: true, 
  ts: Date.now(),
  environment: process.env.NODE_ENV || 'development',
  outdir: OUTDIR,
  cookieSet: !!NAVER_COOKIE,
  userAgentSet: !!NAVER_USER_AGENT,
  acceptSet: !!NAVER_ACCEPT,
  acceptLanguageSet: !!NAVER_ACCEPT_LANGUAGE,
  port: process.env.PORT || 3000,
  nodeVersion: process.version
}));

// root -> React 앱 또는 health check
app.get("/", (_req, res) => {
  if (fs.existsSync(buildPath)) {
    res.sendFile(path.join(buildPath, "index.html"));
  } else {
    res.send("Server is running 🚀");
  }
});

// Health check 엔드포인트
app.get("/api/health", (_req, res) => {
  try {
    const now = Date.now();
    const timeSinceLastUpdate = now - cookieStatus.lastUpdate;
    
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      cookie: {
        hasCookie: !!NAVER_COOKIE,
        cookieLength: NAVER_COOKIE ? NAVER_COOKIE.length : 0,
        lastUpdate: cookieStatus.lastUpdate ? new Date(cookieStatus.lastUpdate).toISOString() : null,
        timeSinceLastUpdate: Math.floor(timeSinceLastUpdate / 1000 / 60), // 분 단위
        updateCount: cookieStatus.updateCount,
        isUpdating: cookieStatus.isUpdating,
        lastError: cookieStatus.lastError
      },
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version
      }
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * URL에서 productId 추출
 */
function extractProductId(url) {
  try {
    const match = url.match(/\/products\/(\d+)/);
    return match ? match[1] : null;
  } catch (e) {
    console.log("❌ productId 추출 실패:", e.message);
    return null;
  }
}

/**
 * channelId 추출 (다중 방법 시도) - 강화된 디버깅
 */
async function extractChannelId(url, debugInfo = {}) {
  console.log("🔍 channelId 추출 시작...");
  
  const triedMethods = [];
  const errors = [];
  let successMethod = null;
  let apiStatus = null;
  let htmlChecked = null;
  let urlPatterns = null;
  
  // 1차 시도: API를 통한 직접 추출 (가장 안정적)
  try {
    console.log("🔄 1차 시도: API를 통한 channelId 추출");
    triedMethods.push("API");
    
    const productId = extractProductId(url);
    if (productId) {
      const apiUrl = `https://smartstore.naver.com/i/v2/products/${productId}`;
      console.log(`📍 API URL: ${apiUrl}`);
      
      const apiResponse = await fetch(apiUrl, {
        method: 'GET',
        headers: getDefaultHeaders(url),
        ...fetchOptions
      });
      
      apiStatus = apiResponse.status;
      console.log(`📊 API 응답 상태: ${apiStatus}`);
      
      if (apiStatus === 200) {
        const data = await apiResponse.json();
        console.log(`📄 API 응답 키들:`, Object.keys(data));
        
        // 다양한 경로에서 channelId 찾기
        let channelId = null;
        
        if (data.channel && data.channel.id) {
          channelId = data.channel.id;
        } else if (data.channelId) {
          channelId = data.channelId;
        } else if (data.channel && data.channel.channelId) {
          channelId = data.channel.channelId;
        } else if (data.product && data.product.channelId) {
          channelId = data.product.channelId;
        }
        
        if (channelId) {
          console.log(`✅ API에서 channelId 발견: ${channelId}`);
          successMethod = "API";
          debugInfo.triedMethods = triedMethods;
          debugInfo.successMethod = successMethod;
          debugInfo.apiStatus = apiStatus;
          return channelId;
        }
        
        console.log("⚠️ API 응답에 channelId가 없습니다.");
        console.log("📄 API 응답 샘플:", JSON.stringify(data).substring(0, 500));
        errors.push("API 응답에 channelId 없음");
      } else {
        console.log(`⚠️ API 요청 실패: ${apiStatus}`);
        errors.push(`API 요청 실패: ${apiStatus}`);
              }
            } else {
      errors.push("productId 추출 실패");
    }
  } catch (apiError) {
    console.log("❌ API 요청 실패:", apiError.message);
    errors.push(`API 요청 실패: ${apiError.message}`);
  }
  
  // 2차 시도: HTML에서 추출
  try {
    console.log("🔄 2차 시도: HTML에서 channelId 추출");
    triedMethods.push("HTML");
    
    const safeHeaders = {
      ...getDefaultHeaders(url),
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'cache-control': 'no-cache',
      'pragma': 'no-cache',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'upgrade-insecure-requests': '1'
    };
    
    const response = await fetch(url, {
      method: 'GET',
      headers: safeHeaders,
      ...fetchOptions
    });
    
    if (response.status === 200) {
      const html = await response.text();
      htmlChecked = { length: html.length, patterns: 0 };
      const $ = cheerio.load(html);
      
      // 다양한 패턴으로 channelId 찾기
      const patterns = [
        /"channelUid":"([a-zA-Z0-9_-]+)"/,
        /"channelId":"([a-zA-Z0-9_-]+)"/,
        /"channel":"([a-zA-Z0-9_-]+)"/,
        /channels\/([a-zA-Z0-9_-]+)/,
        /channelUid=([a-zA-Z0-9_-]+)/,
        /channelId=([a-zA-Z0-9_-]+)/
      ];
      
      let foundPatterns = 0;
      
      // script 태그에서 찾기
      const scripts = $('script').toArray();
      for (const script of scripts) {
        const content = $(script).html();
        if (content) {
          for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match) {
              console.log(`✅ HTML에서 channelId 발견: ${match[1]}`);
              successMethod = "HTML";
              debugInfo.triedMethods = triedMethods;
              debugInfo.successMethod = successMethod;
              debugInfo.htmlChecked = { ...htmlChecked, patterns: foundPatterns + 1 };
              return match[1];
            }
          }
        }
      }
      
      // meta 태그에서 찾기
      const metaTags = $('meta').toArray();
      for (const meta of metaTags) {
        const content = $(meta).attr('content');
        if (content) {
          for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match) {
              console.log(`✅ meta 태그에서 channelId 발견: ${match[1]}`);
              successMethod = "HTML";
              debugInfo.triedMethods = triedMethods;
              debugInfo.successMethod = successMethod;
              debugInfo.htmlChecked = { ...htmlChecked, patterns: foundPatterns + 1 };
              return match[1];
            }
          }
        }
      }
      
      console.log("⚠️ HTML에서 channelId를 찾을 수 없습니다.");
      errors.push("HTML에서 channelId 패턴 없음");
    } else {
      console.log(`⚠️ HTML 요청 실패: ${response.status}`);
      errors.push(`HTML 요청 실패: ${response.status}`);
    }
  } catch (htmlError) {
    console.log("❌ HTML 파싱 실패:", htmlError.message);
    errors.push(`HTML 파싱 실패: ${htmlError.message}`);
  }
  
  // 3차 시도: URL에서 직접 추출
  try {
    console.log("🔄 3차 시도: URL에서 channelId 추출");
    triedMethods.push("URL");
    
    // URL에서 channelId 패턴 찾기
    const urlPatternsList = [
      /\/channels\/([a-zA-Z0-9_-]+)\/products/,
      /channelId=([a-zA-Z0-9_-]+)/,
      /channel=([a-zA-Z0-9_-]+)/
    ];
    
    urlPatterns = { checked: urlPatternsList.length, found: 0 };
    
    for (const pattern of urlPatternsList) {
      const match = url.match(pattern);
      if (match) {
        console.log(`✅ URL에서 channelId 발견: ${match[1]}`);
        successMethod = "URL";
        debugInfo.triedMethods = triedMethods;
        debugInfo.successMethod = successMethod;
        debugInfo.urlPatterns = { ...urlPatterns, found: 1 };
        return match[1];
      }
    }
    
    console.log("⚠️ URL에서 channelId를 찾을 수 없습니다.");
    errors.push("URL에서 channelId 패턴 없음");
  } catch (urlError) {
    console.log("❌ URL 파싱 실패:", urlError.message);
    errors.push(`URL 파싱 실패: ${urlError.message}`);
  }
  
  console.log("❌ 모든 방법으로 channelId 추출 실패");
  console.log("🔍 실패 원인 분석:");
  console.log("  - 1차 시도 (API): 네이버 API 호출 실패 또는 응답에 channelId 없음");
  console.log("  - 2차 시도 (HTML): HTML 파싱 실패 또는 channelId 패턴 없음");
  console.log("  - 3차 시도 (URL): URL에서 channelId 패턴 없음");
  console.log("💡 해결 방법:");
  console.log("  1. Railway Variables에서 NAVER_COOKIE 갱신");
  console.log("  2. NAVER_USER_AGENT 최신 브라우저 값으로 업데이트");
  console.log("  3. 간단한 URL로 테스트 (쿼리 파라미터 제거)");
  
  // debug 정보 저장
  debugInfo.triedMethods = triedMethods;
  debugInfo.successMethod = successMethod;
  debugInfo.errors = errors;
  debugInfo.apiStatus = apiStatus;
  debugInfo.htmlChecked = htmlChecked;
  debugInfo.urlPatterns = urlPatterns;
  
  return null;
}

/**
 * 상품 정보 API 호출 (자동 쿠키 갱신 포함)
 */
async function getProductInfo(channelId, productId, originalUrl) {
  try {
    console.log("🛍️ 상품 정보 API 호출 중...");
    
    const apiUrl = `https://smartstore.naver.com/i/v2/channels/${channelId}/products/${productId}?withWindow=false`;
    console.log(`📍 API URL: ${apiUrl}`);
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: getDefaultHeaders(originalUrl),
      ...fetchOptions
    });
    
    console.log(`📊 상품 API 응답: ${response.status}`);
    
    // 401, 403, 429 에러 시 자동 쿠키 갱신 시도
    if ([401, 403, 429].includes(response.status)) {
      console.log(`🔄 ${response.status} 에러 감지, 자동 쿠키 갱신 시도...`);
      const refreshSuccess = await refreshNaverCookie();
      
      if (refreshSuccess) {
        console.log("🔄 쿠키 갱신 후 재시도...");
        const retryResponse = await fetch(apiUrl, {
          method: 'GET',
          headers: getDefaultHeaders(originalUrl),
          ...fetchOptions
        });
        
        if (retryResponse.status === 200) {
          const data = await retryResponse.json();
          console.log(`📄 상품 API 응답 크기: ${JSON.stringify(data).length} 문자`);
          
          return {
            success: true,
            data: data.product || {},
            rawData: data
          };
        }
      }
    }
    
    if (response.status === 200) {
      const data = await response.json();
      console.log(`📄 상품 API 응답 크기: ${JSON.stringify(data).length} 문자`);
      
      return {
        success: true,
        data: data.product || {},
        rawData: data
      };
    } else {
      return {
        success: false,
        error: `상품 API 호출 실패: ${response.status}`,
        status: response.status
      };
    }
    
  } catch (e) {
    console.log("❌ 상품 정보 API 오류:", e.message);
    return {
      success: false,
      error: e.message,
      status: e.response?.status
    };
  }
}

/**
 * 리뷰 API 호출
 */
async function getReviews(productId, channelId, originalUrl) {
  try {
    console.log("⭐ 리뷰 API 호출 중...");
    
    // 첫 번째 시도: productId만 사용
    let apiUrl = `https://smartstore.naver.com/i/v2/reviews/paged-reviews?productId=${productId}&page=1&pageSize=20&sortType=REVIEW_CREATED_DESC`;
    console.log(`📍 리뷰 API URL (1차): ${apiUrl}`);
    
    let response;
    try {
      response = await fetch(apiUrl, {
        method: 'GET',
        headers: getDefaultHeaders(originalUrl),
        ...fetchOptions
      });
      
      if (response.status === 404) {
        // 두 번째 시도: mallId 포함
        apiUrl = `https://smartstore.naver.com/i/v2/reviews/paged-reviews?mallId=${channelId}&productId=${productId}&page=1&pageSize=20&sortType=REVIEW_CREATED_DESC`;
        console.log(`📍 리뷰 API URL (2차): ${apiUrl}`);
        response = await fetch(apiUrl, {
          method: 'GET',
          headers: getDefaultHeaders(originalUrl),
          ...fetchOptions
        });
      }
    } catch (e) {
      throw e;
    }
    
    console.log(`📊 리뷰 API 응답: ${response.status}`);
    
    if (response.status === 200) {
      const data = await response.json();
      console.log(`📄 리뷰 API 응답 크기: ${JSON.stringify(data).length} 문자`);
      
      return {
        success: true,
        data: data.reviews || [],
        rawData: data
      };
    } else {
      return {
        success: false,
        error: `리뷰 API 호출 실패: ${response.status}`,
        status: response.status
      };
    }
    
  } catch (e) {
    console.log("❌ 리뷰 API 오류:", e.message);
    return {
      success: false,
      error: e.message,
      status: e.response?.status
    };
  }
}

/**
 * Q&A API 호출
 */
async function getQnas(productId, channelId, originalUrl) {
  try {
    console.log("❓ Q&A API 호출 중...");
    
    // 첫 번째 시도: productId만 사용
    let apiUrl = `https://smartstore.naver.com/i/v2/questions/${productId}?page=1&pageSize=20&sortType=CREATED_DESC`;
    console.log(`📍 Q&A API URL (1차): ${apiUrl}`);
    
    let response;
    try {
      response = await fetch(apiUrl, {
        method: 'GET',
        headers: getDefaultHeaders(originalUrl),
        ...fetchOptions
      });
      
      if (response.status === 404) {
        // 두 번째 시도: mallId 포함
        apiUrl = `https://smartstore.naver.com/i/v2/questions?mallId=${channelId}&productId=${productId}&page=1&pageSize=20&sortType=CREATED_DESC`;
        console.log(`📍 Q&A API URL (2차): ${apiUrl}`);
        response = await fetch(apiUrl, {
          method: 'GET',
          headers: getDefaultHeaders(originalUrl),
          ...fetchOptions
        });
      }
    } catch (e) {
      throw e;
    }
    
    console.log(`📊 Q&A API 응답: ${response.status}`);
    
    if (response.status === 200) {
      const data = await response.json();
      console.log(`📄 Q&A API 응답 크기: ${JSON.stringify(data).length} 문자`);
      
      return {
        success: true,
        data: data.questions || [],
        rawData: data
      };
    } else {
      return {
        success: false,
        error: `Q&A API 호출 실패: ${response.status}`,
        status: response.status
      };
    }
    
  } catch (e) {
    console.log("❌ Q&A API 오류:", e.message);
    return {
      success: false,
      error: e.message,
      status: e.response?.status
    };
  }
}

/**
 * POST /api/extract
 * Body: { url: string }
 * Returns: JSON with product, reviews, qna data
 */
app.post("/api/extract", async (req, res) => {
  const t0 = Date.now();
  const { url } = req.body || {};
  
  if (!url) {
    return res.status(200).json({ 
      ok: false, 
      reason: "NO_URL_PROVIDED",
      error: "URL이 제공되지 않았습니다."
    });
  }

  console.log("🚀 네이버 스마트스토어 크롤링 시작:", url);

  // 응답 데이터 구조
  const response = {
    ok: false,
    inputUrl: url,
    productId: null,
    channelId: null,
    product: {},
    reviews: [],
    qnas: [],
    debug: {
      endpoints: [],
      errors: [],
      cacheHit: false
    },
    durationMs: null,
    error: null
  };

  try {
    // 1. productId 추출
    console.log("🔍 productId 추출 중...");
    const productId = extractProductId(url);
    if (!productId) {
      response.error = "productId 추출 실패";
      response.debug.errors.push("URL에서 productId를 찾을 수 없습니다.");
      return res.status(200).json(response);
    }
    response.productId = productId;
    console.log(`✅ productId: ${productId}`);

    // 2. 캐시 확인
    const cacheKey = `${url}_${productId}`;
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log("📦 캐시에서 데이터 반환");
        response.debug.cacheHit = true;
        return res.status(200).json({ ...cached.data, debug: { ...cached.data.debug, cacheHit: true } });
      }
    }

    // 3. 쿠키 최신성 확인 및 갱신
    console.log("🍪 쿠키 상태 확인 중...");
    const cookieRefreshResult = await ensureFreshCookie();
    if (!cookieRefreshResult) {
      console.log("⚠️ 쿠키 갱신 실패, 기존 쿠키로 진행");
    }
    
    // 4. channelId 추출 (강화된 디버깅)
    console.log("🔍 channelId 추출 중...");
    const debugInfo = {};
    const channelId = await extractChannelId(url, debugInfo);
    if (!channelId) {
      // 쿠키 만료로 인한 실패인지 확인
      const isCookieExpired = debugInfo.errors && debugInfo.errors.some(err => 
        err.includes('401') || err.includes('403') || err.includes('429')
      );
      
      if (isCookieExpired) {
        console.log("🔄 쿠키 만료 감지, 강제 갱신 시도...");
        const forceRefreshResult = await refreshNaverCookie(true);
        if (forceRefreshResult) {
          console.log("✅ 쿠키 갱신 성공, channelId 재추출 시도...");
          const retryChannelId = await extractChannelId(url, debugInfo);
          if (retryChannelId) {
            response.channelId = retryChannelId;
            console.log(`✅ channelId 재추출 성공: ${retryChannelId}`);
          } else {
            response.error = "❌ 쿠키 갱신 후에도 channelId 추출 실패";
            response.debug.errors = ["쿠키가 만료되어 API 접근 거부됨 → 자동 갱신 시도 중", ...(debugInfo.errors || [])];
            response.debug.cookieRefreshAttempted = true;
            return res.status(200).json(response);
          }
        } else {
          response.error = "❌ 쿠키 자동 갱신 실패";
          response.debug.errors = ["쿠키가 만료되어 API 접근 거부됨 → 자동 갱신 실패", ...(debugInfo.errors || [])];
          response.debug.cookieRefreshAttempted = true;
          return res.status(200).json(response);
        }
      } else {
        response.error = "❌ 모든 방법으로 channelId 추출 실패";
        response.debug.errors = debugInfo.errors || ["❌ 모든 방법으로 channelId 추출 실패"];
        response.debug.triedMethods = debugInfo.triedMethods;
        response.debug.successMethod = debugInfo.successMethod;
        response.debug.apiStatus = debugInfo.apiStatus;
        response.debug.htmlChecked = debugInfo.htmlChecked;
        response.debug.urlPatterns = debugInfo.urlPatterns;
        return res.status(200).json(response);
      }
    }
    response.channelId = channelId;
    console.log(`✅ channelId: ${channelId}`);

    // 4. API 호출
    console.log("📡 API 호출 시작...");
    
    const [productResult, reviewsResult, qnasResult] = await Promise.all([
      getProductInfo(channelId, productId, url),
      getReviews(productId, channelId, url),
      getQnas(productId, channelId, url)
    ]);

    // 5. 결과 처리
    if (productResult.success) {
      response.product = productResult.data;
      response.debug.endpoints.push({
        name: "상품 정보",
        url: `https://smartstore.naver.com/i/v2/channels/${channelId}/products/${productId}`,
        status: "success"
      });
    } else {
      response.debug.errors.push(`상품 정보: ${productResult.error}`);
      response.debug.endpoints.push({
        name: "상품 정보",
        url: `https://smartstore.naver.com/i/v2/channels/${channelId}/products/${productId}`,
        status: "error",
        error: productResult.error
      });
    }

    if (reviewsResult.success) {
      response.reviews = reviewsResult.data;
      response.debug.endpoints.push({
        name: "리뷰",
        url: "https://smartstore.naver.com/i/v2/reviews/paged-reviews",
        status: "success"
      });
    } else {
      response.debug.errors.push(`리뷰: ${reviewsResult.error}`);
      response.debug.endpoints.push({
        name: "리뷰",
        url: "https://smartstore.naver.com/i/v2/reviews/paged-reviews",
        status: "error",
        error: reviewsResult.error
      });
    }

    if (qnasResult.success) {
      response.qnas = qnasResult.data;
      response.debug.endpoints.push({
        name: "Q&A",
        url: "https://smartstore.naver.com/i/v2/questions",
        status: "success"
      });
    } else {
      response.debug.errors.push(`Q&A: ${qnasResult.error}`);
      response.debug.endpoints.push({
        name: "Q&A",
        url: "https://smartstore.naver.com/i/v2/questions",
        status: "error",
        error: qnasResult.error
      });
    }

    // 6. 에러 처리
    if (!productResult.success && !reviewsResult.success && !qnasResult.success) {
      response.error = "모든 API 호출 실패";
      response.debug.errors.push("세션/쿠키 만료 또는 권한 부족. DevTools에서 최신 쿠키로 .env의 NAVER_COOKIE 업데이트 필요");
    } else if (!productResult.success) {
      response.error = "상품 정보 API 호출 실패";
    }

    response.ok = true;
    response.durationMs = Date.now() - t0;

    // 7. 캐시 저장
    cache.set(cacheKey, {
      data: response,
      timestamp: Date.now()
    });

    console.log("🎉 크롤링 완료:", response.durationMs + "ms");
    console.log("📊 최종 결과:");
    console.log("  - 상품명:", response.product.productName || "없음");
    console.log("  - 가격:", response.product.salePrice || "없음");
    console.log("  - 리뷰 수:", response.reviews.length);
    console.log("  - Q&A 수:", response.qnas.length);

    return res.status(200).json(response);

  } catch (err) {
    response.ok = false;
    response.error = String(err?.message || err);
    response.durationMs = Date.now() - t0;
    console.error("❌ EXTRACT ERROR:", err);
    return res.status(200).json(response);
  }
});

// server listen
const PORT = process.env.PORT || 3000;

// Railway 환경에서 안전한 서버 시작
const startServer = () => {
  try {
    console.log("🔄 서버 시작 중...");
    console.log(`📍 포트: ${PORT}`);
    console.log(`🌍 환경: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔧 Node.js 버전: ${process.version}`);
    
    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 네이버 스마트스토어 크롤러 서버 실행 중`);
      console.log(`📁 디버그 디렉토리: ${OUTDIR}`);
      console.log(`📦 빌드 경로: ${buildPath}`);
      console.log(`🍪 쿠키 설정: ${NAVER_COOKIE ? '✅ 설정됨' : '❌ 미설정'}`);
      console.log(`🌐 File polyfill: ${typeof globalThis.File !== 'undefined' ? '✅ 적용됨' : '❌ 미적용'}`);
      console.log(`✅ 서버 준비 완료!`);
    });
    
    // 서버 에러 핸들링
    server.on('error', (error) => {
      console.error("❌ 서버 에러:", error);
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ 포트 ${PORT}가 이미 사용 중입니다.`);
      }
      process.exit(1);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('🔄 SIGTERM 신호 수신, 서버 종료 중...');
      server.close(() => {
        console.log('✅ 서버 종료 완료');
        process.exit(0);
      });
    });
    
  } catch (error) {
    console.error("❌ 서버 시작 실패:", error);
    console.error("❌ 에러 스택:", error.stack);
    process.exit(1);
  }
};

// Railway 환경에서 안전한 시작
if (process.env.NODE_ENV === 'production') {
  // 프로덕션 환경에서는 즉시 시작
  startServer();
  
  // 백그라운드에서 쿠키 갱신 (서버 시작 후)
  setTimeout(async () => {
    try {
      console.log("🔄 서버 시작 후 쿠키 갱신...");
      await refreshNaverCookie(true);
    } catch (error) {
      console.log("⚠️ 쿠키 갱신 실패:", error.message);
    }
  }, 10000); // 10초 후 실행
} else {
  // 개발 환경에서는 약간의 지연 후 시작
  setTimeout(() => {
    startServer();
  }, 100);
}