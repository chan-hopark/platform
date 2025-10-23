// index.js (네이버 스마트스토어 API 크롤러 - axios 기반)
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// axios 인스턴스 생성 (성능 최적화)
const axiosInstance = axios.create({
  timeout: 15000,
  httpAgent: new (await import('http')).Agent({ keepAlive: true }),
  httpsAgent: new (await import('https')).Agent({ keepAlive: true })
});

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
  cookieSet: !!NAVER_COOKIE
}));

// root -> React 앱 또는 fallback
app.get("/", (_req, res) => {
  if (fs.existsSync(buildPath)) {
    res.sendFile(path.join(buildPath, "index.html"));
  } else {
  res.type("text").send(
      "🚀 네이버 스마트스토어 크롤러 API 실행 중\n\n" +
      "POST JSON {\"url\":\"...\"} to /api/extract to run crawler.\n\n" +
      "빌드된 프론트엔드가 없습니다. npm run build를 실행하세요."
    );
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
 * HTML에서 channelId 추출
 */
async function extractChannelId(url) {
  try {
    console.log("🔍 HTML에서 channelId 추출 중...");
    
    const response = await axiosInstance.get(url, {
      headers: getDefaultHeaders(url)
    });
    
    if (response.status !== 200) {
      throw new Error(`HTML 요청 실패: ${response.status}`);
    }
    
    const $ = cheerio.load(response.data);
    
    // 방법 1: script 태그에서 channelUid 찾기
    const scripts = $('script').toArray();
    for (const script of scripts) {
      const content = $(script).html();
      if (content) {
        // channelUid 패턴 찾기
        const match = content.match(/"channelUid":"([a-zA-Z0-9_-]+)"/);
        if (match) {
          console.log(`✅ script 태그에서 channelId 발견: ${match[1]}`);
          return match[1];
        }
        
        // __PRELOADED_STATE__ 또는 __APOLLO_STATE__에서 찾기
        const stateMatch = content.match(/__PRELOADED_STATE__|__APOLLO_STATE__/);
        if (stateMatch) {
          const jsonMatch = content.match(/"channelUid":"([a-zA-Z0-9_-]+)"/);
          if (jsonMatch) {
            console.log(`✅ 상태 객체에서 channelId 발견: ${jsonMatch[1]}`);
            return jsonMatch[1];
          }
        }
      }
    }
    
    // 방법 2: meta 태그에서 찾기
    const metaTags = $('meta').toArray();
    for (const meta of metaTags) {
      const content = $(meta).attr('content');
      if (content && content.includes('channel')) {
        const match = content.match(/channels\/([a-zA-Z0-9_-]+)/);
        if (match) {
          console.log(`✅ meta 태그에서 channelId 발견: ${match[1]}`);
          return match[1];
        }
      }
    }
    
    console.log("⚠️ HTML에서 channelId를 찾을 수 없습니다.");
    return null;
    
  } catch (e) {
    console.log("❌ channelId 추출 실패:", e.message);
    return null;
  }
}

/**
 * 상품 정보 API 호출
 */
async function getProductInfo(channelId, productId, originalUrl) {
  try {
    console.log("🛍️ 상품 정보 API 호출 중...");
    
    const apiUrl = `https://smartstore.naver.com/i/v2/channels/${channelId}/products/${productId}?withWindow=false`;
    console.log(`📍 API URL: ${apiUrl}`);
    
    const response = await axiosInstance.get(apiUrl, {
      headers: getDefaultHeaders(originalUrl)
    });
    
    console.log(`📊 상품 API 응답: ${response.status}`);
    
    if (response.status === 200) {
      const data = response.data;
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
      response = await axiosInstance.get(apiUrl, {
        headers: getDefaultHeaders(originalUrl)
      });
    } catch (e) {
      if (e.response?.status === 404) {
        // 두 번째 시도: mallId 포함
        apiUrl = `https://smartstore.naver.com/i/v2/reviews/paged-reviews?mallId=${channelId}&productId=${productId}&page=1&pageSize=20&sortType=REVIEW_CREATED_DESC`;
        console.log(`📍 리뷰 API URL (2차): ${apiUrl}`);
        response = await axiosInstance.get(apiUrl, {
          headers: getDefaultHeaders(originalUrl)
        });
      } else {
        throw e;
      }
    }
    
    console.log(`📊 리뷰 API 응답: ${response.status}`);
    
    if (response.status === 200) {
      const data = response.data;
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
      response = await axiosInstance.get(apiUrl, {
        headers: getDefaultHeaders(originalUrl)
      });
    } catch (e) {
      if (e.response?.status === 404) {
        // 두 번째 시도: mallId 포함
        apiUrl = `https://smartstore.naver.com/i/v2/questions?mallId=${channelId}&productId=${productId}&page=1&pageSize=20&sortType=CREATED_DESC`;
        console.log(`📍 Q&A API URL (2차): ${apiUrl}`);
        response = await axiosInstance.get(apiUrl, {
          headers: getDefaultHeaders(originalUrl)
        });
      } else {
        throw e;
      }
    }
    
    console.log(`📊 Q&A API 응답: ${response.status}`);
    
    if (response.status === 200) {
      const data = response.data;
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
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 네이버 스마트스토어 크롤러 서버 실행 중`);
  console.log(`📍 포트: ${PORT}`);
  console.log(`📁 디버그 디렉토리: ${OUTDIR}`);
  console.log(`🌍 환경: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📦 빌드 경로: ${buildPath}`);
  console.log(`🍪 쿠키 설정: ${NAVER_COOKIE ? '✅ 설정됨' : '❌ 미설정'}`);
  console.log(`✅ 서버 준비 완료!`);
});