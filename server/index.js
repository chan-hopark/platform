// index.js (네이버 스마트스토어 API 크롤러 - node-fetch 기반)

// Node.js 18 File polyfill (undici 호환성)
if (typeof globalThis.File === 'undefined') {
  // Blob이 없으면 먼저 polyfill
  if (typeof globalThis.Blob === 'undefined') {
    const { Blob } = require('node:buffer');
    globalThis.Blob = Blob;
  }
  
  // File polyfill (Blob 상속)
  globalThis.File = class File extends globalThis.Blob {
    constructor(chunks, filename, options = {}) {
      super(chunks, options);
      this.name = filename || '';
      this.lastModified = options.lastModified || Date.now();
    }
  };
  
  console.log("✅ File polyfill 적용 완료 (Node.js 18 호환)");
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
const NAVER_COOKIE = process.env.NAVER_COOKIE;
const NAVER_USER_AGENT = process.env.NAVER_USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const NAVER_ACCEPT = process.env.NAVER_ACCEPT || "application/json, text/plain, */*";
const NAVER_ACCEPT_LANGUAGE = process.env.NAVER_ACCEPT_LANGUAGE || "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7";

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

// 기본 헤더 설정
const getDefaultHeaders = (referer) => ({
  'cookie': NAVER_COOKIE,
  'user-agent': NAVER_USER_AGENT,
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
 * channelId 추출 (다중 방법 시도)
 */
async function extractChannelId(url) {
  console.log("🔍 channelId 추출 시작...");
  
  // 1차 시도: API를 통한 직접 추출 (가장 안정적)
  try {
    console.log("🔄 1차 시도: API를 통한 channelId 추출");
    const productId = extractProductId(url);
    if (productId) {
      const apiUrl = `https://smartstore.naver.com/i/v2/products/${productId}`;
      console.log(`📍 API URL: ${apiUrl}`);
      
      const apiResponse = await fetch(apiUrl, {
        method: 'GET',
        headers: getDefaultHeaders(url),
        ...fetchOptions
      });
      
      console.log(`📊 API 응답 상태: ${apiResponse.status}`);
      
      if (apiResponse.status === 200) {
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
          return channelId;
        }
        
        console.log("⚠️ API 응답에 channelId가 없습니다.");
        console.log("📄 API 응답 샘플:", JSON.stringify(data).substring(0, 500));
      } else {
        console.log(`⚠️ API 요청 실패: ${apiResponse.status}`);
      }
    }
  } catch (apiError) {
    console.log("❌ API 요청 실패:", apiError.message);
  }
  
  // 2차 시도: HTML에서 추출
  try {
    console.log("🔄 2차 시도: HTML에서 channelId 추출");
    
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
      
      // script 태그에서 찾기
      const scripts = $('script').toArray();
      for (const script of scripts) {
        const content = $(script).html();
        if (content) {
          for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match) {
              console.log(`✅ HTML에서 channelId 발견: ${match[1]}`);
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
              return match[1];
            }
          }
        }
      }
      
      console.log("⚠️ HTML에서 channelId를 찾을 수 없습니다.");
    } else {
      console.log(`⚠️ HTML 요청 실패: ${response.status}`);
    }
  } catch (htmlError) {
    console.log("❌ HTML 파싱 실패:", htmlError.message);
  }
  
  // 3차 시도: URL에서 직접 추출
  try {
    console.log("🔄 3차 시도: URL에서 channelId 추출");
    
    // URL에서 channelId 패턴 찾기
    const urlPatterns = [
      /\/channels\/([a-zA-Z0-9_-]+)\/products/,
      /channelId=([a-zA-Z0-9_-]+)/,
      /channel=([a-zA-Z0-9_-]+)/
    ];
    
    for (const pattern of urlPatterns) {
      const match = url.match(pattern);
      if (match) {
        console.log(`✅ URL에서 channelId 발견: ${match[1]}`);
        return match[1];
      }
    }
    
    console.log("⚠️ URL에서 channelId를 찾을 수 없습니다.");
  } catch (urlError) {
    console.log("❌ URL 파싱 실패:", urlError.message);
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
  return null;
}

/**
 * 상품 정보 API 호출
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

    // 3. channelId 추출
    console.log("🔍 channelId 추출 중...");
    const channelId = await extractChannelId(url);
    if (!channelId) {
      response.error = "channelId 추출 실패";
      response.debug.errors.push("HTML에서 channelId를 찾을 수 없습니다. 세션/쿠키 갱신이 필요할 수 있습니다.");
      return res.status(200).json(response);
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
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 네이버 스마트스토어 크롤러 서버 실행 중`);
      console.log(`📍 포트: ${PORT}`);
      console.log(`📁 디버그 디렉토리: ${OUTDIR}`);
      console.log(`🌍 환경: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📦 빌드 경로: ${buildPath}`);
      console.log(`🍪 쿠키 설정: ${NAVER_COOKIE ? '✅ 설정됨' : '❌ 미설정'}`);
      console.log(`🔧 Node.js 버전: ${process.version}`);
      console.log(`🌐 File polyfill: ${typeof globalThis.File !== 'undefined' ? '✅ 적용됨' : '❌ 미적용'}`);
      console.log(`✅ 서버 준비 완료!`);
    });
  } catch (error) {
    console.error("❌ 서버 시작 실패:", error);
    process.exit(1);
  }
};

// Railway 환경에서 안전한 시작
if (process.env.NODE_ENV === 'production') {
  // 프로덕션 환경에서는 즉시 시작
  startServer();
} else {
  // 개발 환경에서는 약간의 지연 후 시작
  setTimeout(startServer, 100);
}