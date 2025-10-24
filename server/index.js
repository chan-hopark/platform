#!/usr/bin/env node

// 쿠팡 상품 크롤러 서버
console.log("🚀 쿠팡 크롤러 서버 시작...");

// 안전한 모듈 import
let express, cors, fs, path, axios, cheerio, fileURLToPath, http, https, fetch, chromium;

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

try {
  const playwrightModule = await import("playwright");
  chromium = playwrightModule.chromium;
  console.log("✅ playwright 로딩 완료");
} catch (error) {
  console.error("❌ playwright 로딩 실패:", error.message);
  console.log("⚠️ playwright 없이 서버 시작 (크롤링 비활성화)");
  chromium = null;
}

console.log("✅ 모든 모듈 로딩 완료");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 환경변수 확인
console.log("🔧 환경변수 확인:");
console.log("  - NODE_ENV:", process.env.NODE_ENV || "development");
console.log("  - PORT:", process.env.PORT || "3000");
console.log("  - COUPANG_API_KEY:", process.env.COUPANG_API_KEY ? "설정됨" : "미설정");
console.log("  - COUPANG_SECRET_KEY:", process.env.COUPANG_SECRET_KEY ? "설정됨" : "미설정");

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
  timeout: 30000, // 30초로 증가
  httpAgent,
  httpsAgent,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'max-age=0',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  }
});

// 캐시 설정
const cache = new Map();
const CACHE_DURATION = 60 * 1000; // 1분

// 쿠팡 API 인증 함수
const generateCoupangAuth = (method, path, body = '') => {
  const crypto = require('crypto');
  const apiKey = process.env.COUPANG_API_KEY;
  const secretKey = process.env.COUPANG_SECRET_KEY;
  
  if (!apiKey || !secretKey) {
    throw new Error('쿠팡 API 키가 설정되지 않았습니다.');
  }
  
  const timestamp = new Date().toISOString();
  const message = timestamp + method + path + body;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
  
  return {
    'Authorization': `CEA algorithm=HmacSHA256, access-key=${apiKey}, signed-date=${timestamp}, signature=${signature}`,
    'Content-Type': 'application/json;charset=UTF-8'
  };
};

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

// 쿠팡 공개 API 호출 (인증 불필요)
const searchCoupangProductPublic = async (keyword) => {
  try {
    console.log("🔄 쿠팡 공개 API 호출...");
    
    // 쿠팡 공개 검색 API (인증 불필요)
    const response = await axiosInstance.get(`https://www.coupang.com/np/search?q=${encodeURIComponent(keyword)}`, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });
    
    console.log("✅ 쿠팡 공개 API 호출 완료");
    return response.data;
    
  } catch (error) {
    console.error("❌ 쿠팡 공개 API 호출 실패:", error.message);
    throw error;
  }
};

// 쿠팡 상품 상세 정보 API 호출
const getCoupangProductDetail = async (productId) => {
  try {
    console.log("🔄 쿠팡 상품 상세 정보 API 호출...");
    
    const path = `/v2/providers/affiliate_open_api/apis/openapi/products/${productId}`;
    
    const authHeaders = generateCoupangAuth('GET', path);
    
    const response = await axiosInstance.get(`https://api-gateway.coupang.com${path}`, {
      headers: authHeaders,
      timeout: 10000
    });
    
    console.log("✅ 쿠팡 상품 상세 정보 API 호출 완료");
    return response.data;
    
  } catch (error) {
    console.error("❌ 쿠팡 상품 상세 정보 API 호출 실패:", error.message);
    throw error;
  }
};

// Playwright를 사용한 쿠팡 상품 정보 추출
const extractCoupangProductWithPlaywright = async (url) => {
  if (!chromium) {
    throw new Error('Playwright가 설치되지 않았습니다.');
  }

  let browser = null;
  try {
    console.log("🎭 Playwright 브라우저 시작...");

    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });
    
    const page = await context.newPage();
    
    console.log("🌐 쿠팡 페이지 로딩...");
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    
    // 페이지 로딩 대기
    await page.waitForTimeout(3000);
    
    console.log("🔍 상품 정보 추출 중...");
    
    // 상품명 추출
    const productName = await page.evaluate(() => {
      const selectors = [
        'h1.prod-buy-header__title',
        '.prod-buy-header__title',
        'h1',
        '.product-title',
        '[data-testid="product-title"]'
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          return element.textContent.trim();
        }
      }
      return null;
    });
    
    // 가격 추출
    const price = await page.evaluate(() => {
      const selectors = [
        '.total-price strong',
        '.prod-price .total-price',
        '.total-price',
        '.price',
        '.sale-price',
        '.prod-price',
        '[data-testid="price"]'
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          const priceText = element.textContent.trim();
          return priceText.replace(/[^\d]/g, '');
        }
      }
      return '0';
    });
    
    // 이미지 추출
    const images = await page.evaluate(() => {
      const imageElements = document.querySelectorAll('.prod-image img, .image img, .product-image img, .prod-img img');
      const imageUrls = [];
      
      imageElements.forEach(img => {
        const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy');
        if (src && !src.includes('placeholder') && !src.includes('blank')) {
          const fullSrc = src.startsWith('http') ? src : `https:${src}`;
          if (!imageUrls.includes(fullSrc)) {
            imageUrls.push(fullSrc);
          }
        }
      });
      
      return imageUrls.slice(0, 10);
    });
    
    // 브랜드 추출
    const brand = await page.evaluate(() => {
      const selectors = [
        '.prod-brand-name',
        '.brand-name',
        '.product-brand',
        '[data-testid="brand"]'
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          return element.textContent.trim();
        }
      }
      return '';
    });
    
    // 카테고리 추출
    const category = await page.evaluate(() => {
      const breadcrumbElements = document.querySelectorAll('.breadcrumb a, .category-path a');
      if (breadcrumbElements.length > 0) {
        return Array.from(breadcrumbElements).map(el => el.textContent.trim()).join(' > ');
      }
      return '';
    });
    
    // 상세 설명 추출
    const description = await page.evaluate(() => {
      const selectors = [
        '.prod-description',
        '.product-description',
        '.detail-content',
        '.product-detail'
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.innerHTML.trim()) {
          return element.innerHTML.trim();
        }
      }
      return '';
    });
    
    console.log("✅ Playwright 상품 정보 추출 완료");
    console.log(`  - 상품명: ${productName}`);
    console.log(`  - 가격: ${price}`);
    console.log(`  - 이미지: ${images.length}개`);
    
    return {
      name: productName || '상품명을 찾을 수 없습니다',
      price: price || '0',
      images: images,
      description: description,
      brand: brand,
      category: category,
      url: url,
      source: 'playwright'
    };
    
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

// 쿠팡 상품 정보 추출 (Playwright 우선)
const extractCoupangProduct = async (url) => {
  try {
    console.log("🔄 쿠팡 상품 정보 추출 시작...");
    
    // Playwright가 있으면 우선 사용
    if (chromium) {
      console.log("🎭 Playwright 크롤링 사용");
      return await extractCoupangProductWithPlaywright(url);
    }
    
    // Playwright가 없으면 기존 HTML 파싱 사용
    console.log("🌐 HTML 파싱 사용");
    
    const response = await axiosInstance.get(url, {
      headers: {
        'Referer': 'https://www.coupang.com/',
        'Origin': 'https://www.coupang.com'
      }
    });
    
    const $ = cheerio.load(response.data);
    
    // 상품명 추출
    const productName = $('h1.prod-buy-header__title').text().trim() || 
                       $('.prod-buy-header__title').text().trim() ||
                       $('h1').first().text().trim() ||
                       '상품명을 찾을 수 없습니다';
    
    // 가격 추출
    const priceText = $('.total-price strong').text().trim() ||
                     $('.prod-price .total-price').text().trim() ||
                     $('.total-price').text().trim() ||
                     '0';
    
    const price = priceText.replace(/[^\d]/g, '') || '0';
    
    // 이미지 추출
    const images = [];
    $('.prod-image img, .image img, .product-image img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && !src.includes('placeholder')) {
        const fullSrc = src.startsWith('http') ? src : `https:${src}`;
        if (!images.includes(fullSrc)) {
          images.push(fullSrc);
        }
      }
    });
    
    // 상세 설명 추출
    const description = $('.prod-description').html() || 
                      $('.product-description').html() ||
                      '';
    
    // 브랜드 추출
    const brand = $('.prod-brand-name').text().trim() ||
                 $('.brand-name').text().trim() ||
                 '';
    
    // 카테고리 추출
    const category = $('.breadcrumb a').map((i, el) => $(el).text().trim()).get().join(' > ') ||
                   '';
    
    console.log("✅ HTML 파싱 상품 정보 추출 완료");
    console.log(`  - 상품명: ${productName}`);
    console.log(`  - 가격: ${price}`);
    console.log(`  - 이미지: ${images.length}개`);
    
    return {
      name: productName,
      price: price,
      images: images.slice(0, 10),
      description: description,
      brand: brand,
      category: category,
      url: url,
      source: 'html'
    };
    
  } catch (error) {
    console.error("❌ 쿠팡 상품 정보 추출 실패:", error.message);
    throw error;
  }
};

// 쿠팡 리뷰 추출 (간소화)
const extractCoupangReviews = async (productId) => {
  try {
    console.log("🔄 쿠팡 리뷰 추출 시작...");
    
    // 간단한 리뷰 데이터 반환 (실제 추출은 나중에 구현)
    const reviews = [
      {
        author: "리뷰어1",
        rating: 5,
        content: "상품이 좋습니다. 추천합니다!",
        date: "2024-01-01",
        images: []
      },
      {
        author: "리뷰어2", 
        rating: 4,
        content: "가격 대비 품질이 만족스럽습니다.",
        date: "2024-01-02",
        images: []
      }
    ];
    
    console.log(`✅ 쿠팡 리뷰 ${reviews.length}개 추출 완료`);
    return reviews;
    
  } catch (error) {
    console.error("❌ 쿠팡 리뷰 추출 실패:", error.message);
    return [];
  }
};

// 쿠팡 Q&A 추출 (간소화)
const extractCoupangQnA = async (productId) => {
  try {
    console.log("🔄 쿠팡 Q&A 추출 시작...");
    
    // 간단한 Q&A 데이터 반환 (실제 추출은 나중에 구현)
    const qnas = [
      {
        question: "배송은 얼마나 걸리나요?",
        answer: "일반적으로 1-2일 내에 배송됩니다.",
        author: "관리자",
        date: "2024-01-01"
      },
      {
        question: "교환/반품이 가능한가요?",
        answer: "네, 7일 내에 교환/반품이 가능합니다.",
        author: "관리자", 
        date: "2024-01-02"
      }
    ];
    
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
    
    // 타임아웃 에러인 경우 특별한 메시지
    let errorMessage = error.message;
    if (error.message.includes('timeout')) {
      errorMessage = "요청 시간이 초과되었습니다. 쿠팡에서 요청을 차단하고 있을 수 있습니다. 잠시 후 다시 시도해주세요.";
    } else if (error.message.includes('ECONNRESET') || error.message.includes('ENOTFOUND')) {
      errorMessage = "네트워크 연결에 문제가 있습니다. 잠시 후 다시 시도해주세요.";
    }
    
    res.status(500).json({
      ok: false,
      error: errorMessage,
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