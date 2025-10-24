#!/usr/bin/env node

// 쿠팡 전용 크롤러 서버
console.log("🚀 쿠팡 크롤러 서버 시작...");

// Polyfill 설정 (Node.js 18 호환성)
if (typeof globalThis.File === 'undefined') {
  const { File } = await import('node:buffer');
  globalThis.File = File;
}

if (typeof globalThis.Blob === 'undefined') {
  const { Blob } = await import('node:buffer');
  globalThis.Blob = Blob;
}

if (typeof globalThis.FormData === 'undefined') {
  const { FormData } = await import('formdata-node');
  globalThis.FormData = FormData;
}

console.log("🔍 Polyfill 상태:");
console.log("  - File:", typeof globalThis.File !== 'undefined' ? "✅" : "❌");
console.log("  - Blob:", typeof globalThis.Blob !== 'undefined' ? "✅" : "❌");
console.log("  - FormData:", typeof globalThis.FormData !== 'undefined' ? "✅" : "❌");

// 안전한 모듈 import
let express, cors, fs, path, axios, cheerio, fileURLToPath, http, https, fetch;

console.log("📦 모듈 로딩 시작...");

try {
  const expressModule = await import("express");
  express = expressModule.default;
  console.log("✅ express 로딩 완료");
} catch (error) {
  console.error("❌ express 로딩 실패:", error.message);
  process.exit(1);
}

try {
  const corsModule = await import("cors");
  cors = corsModule.default;
  console.log("✅ cors 로딩 완료");
} catch (error) {
  console.error("❌ cors 로딩 실패:", error.message);
  process.exit(1);
}

try {
  const fsModule = await import("fs");
  fs = fsModule.default;
  console.log("✅ fs 로딩 완료");
} catch (error) {
  console.error("❌ fs 로딩 실패:", error.message);
  process.exit(1);
}

try {
  const pathModule = await import("path");
  path = pathModule.default;
  console.log("✅ path 로딩 완료");
} catch (error) {
  console.error("❌ path 로딩 실패:", error.message);
  process.exit(1);
}

try {
  const axiosModule = await import("axios");
  axios = axiosModule.default;
  console.log("✅ axios 로딩 완료");
} catch (error) {
  console.error("❌ axios 로딩 실패:", error.message);
  process.exit(1);
}

try {
  const cheerioModule = await import("cheerio");
  cheerio = cheerioModule;
  console.log("✅ cheerio 로딩 완료");
} catch (error) {
  console.error("❌ cheerio 로딩 실패:", error.message);
  process.exit(1);
}

try {
  const urlModule = await import("url");
  fileURLToPath = urlModule.fileURLToPath;
  console.log("✅ url 로딩 완료");
} catch (error) {
  console.error("❌ url 로딩 실패:", error.message);
  process.exit(1);
}

try {
  const httpModule = await import("http");
  http = httpModule.default;
  console.log("✅ http 로딩 완료");
} catch (error) {
  console.error("❌ http 로딩 실패:", error.message);
  process.exit(1);
}

try {
  const httpsModule = await import("https");
  https = httpsModule.default;
  console.log("✅ https 로딩 완료");
} catch (error) {
  console.error("❌ https 로딩 실패:", error.message);
  process.exit(1);
}

try {
  const fetchModule = await import("node-fetch");
  fetch = fetchModule.default;
  console.log("✅ node-fetch 로딩 완료");
} catch (error) {
  console.error("❌ node-fetch 로딩 실패:", error.message);
  process.exit(1);
}

console.log("✅ 모든 모듈 로딩 완료");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 환경변수 로딩 확인
console.log("🔧 환경변수 확인:");
console.log("  - NODE_ENV:", process.env.NODE_ENV || "development");
console.log("  - PORT:", process.env.PORT || "3000");

const PORT = process.env.PORT || 3000;

// Express 앱 설정
const app = express();

// 미들웨어 설정
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 정적 파일 서빙 (프론트엔드)
app.use(express.static(path.join(__dirname, '../dist')));

// HTTP Agent 설정 (성능 최적화)
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

// Axios 인스턴스 설정
const axiosInstance = axios.create({
  timeout: 15000,
  httpAgent,
  httpsAgent,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  }
});

// 캐시 설정
const cache = new Map();
const CACHE_DURATION = 60 * 1000; // 1분

// 벤더 감지 함수
const detectVendor = (url) => {
  if (url.includes('smartstore.naver.com')) {
    return 'naver';
  } else if (url.includes('coupang.com')) {
    return 'coupang';
  }
  return 'unknown';
};

// 쿠팡 상품 ID 추출
const extractCoupangProductId = (url) => {
  try {
    // 쿠팡 URL 패턴: https://www.coupang.com/vp/products/123456789
    const match = url.match(/\/products\/(\d+)/);
    if (match) {
      return match[1];
    }
    return null;
  } catch (error) {
    console.error("❌ 쿠팡 상품 ID 추출 실패:", error.message);
    return null;
  }
};

// 쿠팡 상품 정보 추출 (웹 스크래핑)
const extractCoupangProduct = async (url) => {
  try {
    console.log("🔄 쿠팡 상품 정보 추출 시작...");
    
    const response = await axiosInstance.get(url);
    const $ = cheerio.load(response.data);
    
    // 상품명 추출
    const productName = $('h1.prod-buy-header__title').text().trim() || 
                       $('.prod-buy-header__title').text().trim() ||
                       $('h1').first().text().trim();
    
    // 가격 추출
    const priceText = $('.total-price strong').text().trim() ||
                     $('.prod-price .total-price').text().trim() ||
                     $('.price').first().text().trim();
    
    const price = priceText.replace(/[^\d]/g, '');
    
    // 이미지 추출
    const images = [];
    $('.prod-image img, .image img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && !src.includes('placeholder')) {
        images.push(src.startsWith('http') ? src : `https:${src}`);
      }
    });
    
    // 상세 설명 추출
    const description = $('.prod-description').html() || 
                      $('.product-description').html() ||
                      $('.detail-content').html();
    
    // 브랜드 추출
    const brand = $('.prod-brand-name').text().trim() ||
                 $('.brand-name').text().trim();
    
    // 카테고리 추출
    const category = $('.breadcrumb a').map((i, el) => $(el).text().trim()).get().join(' > ');
    
    console.log("✅ 쿠팡 상품 정보 추출 완료");
    
    return {
      name: productName,
      price: price,
      images: images.slice(0, 10), // 최대 10개 이미지
      description: description,
      brand: brand,
      category: category,
      url: url
    };
    
  } catch (error) {
    console.error("❌ 쿠팡 상품 정보 추출 실패:", error.message);
    throw error;
  }
};

// 쿠팡 리뷰 추출
const extractCoupangReviews = async (productId) => {
  try {
    console.log("🔄 쿠팡 리뷰 추출 시작...");
    
    // 쿠팡 리뷰 API 엔드포인트 (실제 API가 있다면 사용)
    const reviewUrl = `https://www.coupang.com/vp/product/reviews?productId=${productId}`;
    
    const response = await axiosInstance.get(reviewUrl);
    const $ = cheerio.load(response.data);
    
    const reviews = [];
    $('.sdp-review__article__list .sdp-review__article__list__item').each((i, el) => {
      if (i >= 20) return false; // 최대 20개
      
      const review = {
        author: $(el).find('.sdp-review__article__list__user__name').text().trim(),
        rating: $(el).find('.sdp-review__rating__star').length,
        content: $(el).find('.sdp-review__article__list__review__content').text().trim(),
        date: $(el).find('.sdp-review__article__list__review__date').text().trim(),
        images: []
      };
      
      $(el).find('.sdp-review__article__list__review__media img').each((j, img) => {
        const src = $(img).attr('src');
        if (src) {
          review.images.push(src.startsWith('http') ? src : `https:${src}`);
        }
      });
      
      if (review.content) {
        reviews.push(review);
      }
    });
    
    console.log(`✅ 쿠팡 리뷰 ${reviews.length}개 추출 완료`);
    return reviews;
    
  } catch (error) {
    console.error("❌ 쿠팡 리뷰 추출 실패:", error.message);
    return [];
  }
};

// 쿠팡 Q&A 추출
const extractCoupangQnA = async (productId) => {
  try {
    console.log("🔄 쿠팡 Q&A 추출 시작...");
    
    const qnaUrl = `https://www.coupang.com/vp/product/qna?productId=${productId}`;
    
    const response = await axiosInstance.get(qnaUrl);
    const $ = cheerio.load(response.data);
    
    const qnas = [];
    $('.sdp-qna__article__list .sdp-qna__article__list__item').each((i, el) => {
      if (i >= 20) return false; // 최대 20개
      
      const qna = {
        question: $(el).find('.sdp-qna__article__list__item__question__content').text().trim(),
        answer: $(el).find('.sdp-qna__article__list__item__answer__content').text().trim(),
        author: $(el).find('.sdp-qna__article__list__item__question__author').text().trim(),
        date: $(el).find('.sdp-qna__article__list__item__question__date').text().trim()
      };
      
      if (qna.question) {
        qnas.push(qna);
      }
    });
    
    console.log(`✅ 쿠팡 Q&A ${qnas.length}개 추출 완료`);
    return qnas;
    
  } catch (error) {
    console.error("❌ 쿠팡 Q&A 추출 실패:", error.message);
    return [];
  }
};

// API 엔드포인트

// 헬스체크
app.get("/api/health", (_req, res) => {
  try {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      port: PORT,
      vendor: "coupang"
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 루트 경로 (프론트엔드)
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// 데이터 추출 API
app.post("/api/extract", async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        ok: false,
        error: "URL이 필요합니다."
      });
    }
    
    console.log(`🔄 데이터 추출 시작: ${url}`);
    
    // 벤더 감지
    const vendor = detectVendor(url);
    console.log(`📍 감지된 벤더: ${vendor}`);
    
    // 네이버인 경우 서비스 준비중 메시지
    if (vendor === 'naver') {
      return res.json({
        ok: false,
        error: "네이버 스마트스토어 서비스는 준비중입니다.",
        vendor: "naver",
        message: "현재 쿠팡 상품만 지원합니다."
      });
    }
    
    // 쿠팡이 아닌 경우
    if (vendor !== 'coupang') {
      return res.status(400).json({
        ok: false,
        error: "지원하지 않는 쇼핑몰입니다.",
        vendor: vendor,
        message: "현재 쿠팡 상품만 지원합니다."
      });
    }
    
    // 캐시 확인
    const cacheKey = `coupang_${url}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log("✅ 캐시에서 데이터 반환");
      return res.json({
        ...cached.data,
        cacheHit: true,
        durationMs: Date.now() - startTime
      });
    }
    
    // 쿠팡 상품 ID 추출
    const productId = extractCoupangProductId(url);
    if (!productId) {
      return res.status(400).json({
        ok: false,
        error: "쿠팡 상품 ID를 추출할 수 없습니다.",
        vendor: "coupang"
      });
    }
    
    console.log(`📍 쿠팡 상품 ID: ${productId}`);
    
    // 상품 정보 추출
    const product = await extractCoupangProduct(url);
    
    // 리뷰 추출
    const reviews = await extractCoupangReviews(productId);
    
    // Q&A 추출
    const qnas = await extractCoupangQnA(productId);
    
    const result = {
      ok: true,
      vendor: "coupang",
      productId: productId,
      product: product,
      reviews: reviews,
      qnas: qnas,
      debug: {
        cacheHit: false,
        steps: [
          { step: "벤더 감지", success: true, value: vendor },
          { step: "상품 ID 추출", success: true, value: productId },
          { step: "상품 정보 추출", success: true, value: product.name },
          { step: "리뷰 추출", success: true, value: `${reviews.length}개` },
          { step: "Q&A 추출", success: true, value: `${qnas.length}개` }
        ],
        endpoints: [
          { method: "GET", url: url, status: 200 },
          { method: "GET", url: `리뷰 페이지`, status: 200 },
          { method: "GET", url: `Q&A 페이지`, status: 200 }
        ]
      },
      durationMs: Date.now() - startTime
    };
    
    // 캐시 저장
    cache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
    
    console.log(`✅ 데이터 추출 완료 (${result.durationMs}ms)`);
    res.json(result);
    
  } catch (error) {
    console.error("❌ 데이터 추출 실패:", error.message);
    res.status(500).json({
      ok: false,
      error: error.message,
      vendor: "coupang",
      debug: {
        cacheHit: false,
        steps: [
          { step: "데이터 추출", success: false, value: error.message }
        ],
        errors: [error.message]
      },
      durationMs: Date.now() - startTime
    });
  }
});

// 서버 시작
const startServer = () => {
  console.log("🔄 서버 시작 중...");
  console.log(`📍 포트: ${PORT}`);
  
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 쿠팡 크롤러 서버 실행 중 - 포트: ${PORT}`);
    console.log(`✅ Railway 헬스체크 준비 완료!`);
  });
  
  server.on('error', (error) => {
    console.error("❌ 서버 에러:", error);
    process.exit(1);
  });
  
  server.on('listening', () => {
    console.log(`✅ 서버가 포트 ${PORT}에서 리스닝 중`);
  });
  
  return server;
};

// 서버 시작
console.log("🚀 쿠팡 크롤러 서버 시작...");
const server = startServer();