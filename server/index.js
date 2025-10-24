#!/usr/bin/env node

// 쿠팡 상품 크롤러 서버 (API 우선, Playwright/HTML 파싱 fallback)
console.log("🚀 쿠팡 크롤러 서버 시작...");

// Polyfills for global objects (File, Blob, FormData) for Node.js environments
if (typeof globalThis.File === 'undefined') {
  class Blob {
    constructor(blobParts, options) {
      this.blobParts = blobParts;
      this.options = options;
      this.size = blobParts.reduce((acc, part) => acc + (typeof part === 'string' ? Buffer.byteLength(part) : part.length), 0);
      this.type = options?.type || '';
    }
    slice(start, end, contentType) {
      return new Blob([this.blobParts.map(p => typeof p === 'string' ? Buffer.from(p) : p).flat().slice(start, end)], { type: contentType });
    }
    text() {
      return Promise.resolve(this.blobParts.map(p => typeof p === 'string' ? p : p.toString()).join(''));
    }
    arrayBuffer() {
      return Promise.resolve(Buffer.concat(this.blobParts.map(p => typeof p === 'string' ? Buffer.from(p) : p)).buffer);
    }
  }
  globalThis.Blob = Blob;
  console.log("✅ Blob polyfill 적용 완료");

  class File extends Blob {
    constructor(fileBits, fileName, options) {
      super(fileBits, options);
      this.name = fileName;
      this.lastModified = options?.lastModified || Date.now();
      console.log(`✅ File polyfill 적용 완료: ${fileName}`);
    }
  }
  globalThis.File = File;
}

// Import createRequire for CJS modules in ES module scope
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// 안전한 모듈 import (try-catch 블록으로 로딩 실패 시에도 서버가 죽지 않도록)
let express, cors, fs, path, axios, cheerio, fileURLToPath, http, https, fetch, chromium;

try {
  express = (await import('express')).default;
  console.log("✅ express 로딩 완료");
} catch (error) {
  console.error("❌ express 로딩 실패:", error.message);
  process.exit(1);
}

try {
  cors = (await import('cors')).default;
  console.log("✅ cors 로딩 완료");
} catch (error) {
  console.error("❌ cors 로딩 실패:", error.message);
  process.exit(1);
}

try {
  fs = require('fs');
  path = require('path');
  console.log("✅ fs, path 로딩 완료");
} catch (error) {
  console.error("❌ fs, path 로딩 실패:", error.message);
  process.exit(1);
}

try {
  axios = (await import('axios')).default;
  console.log("✅ axios 로딩 완료");
} catch (error) {
  console.error("❌ axios 로딩 실패:", error.message);
  process.exit(1);
}

try {
  cheerio = (await import('cheerio')).default;
  console.log("✅ cheerio 로딩 완료");
} catch (error) {
  console.error("❌ cheerio 로딩 실패:", error.message);
  process.exit(1);
}

try {
  const urlModule = await import('url');
  fileURLToPath = urlModule.fileURLToPath;
  console.log("✅ fileURLToPath 로딩 완료");
} catch (error) {
  console.error("❌ fileURLToPath 로딩 실패:", error.message);
  process.exit(1);
}

try {
  http = require('http');
  https = require('https');
  console.log("✅ http, https 로딩 완료");
} catch (error) {
  console.error("❌ http, https 로딩 실패:", error.message);
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

// 환경변수 확인
console.log("🔧 환경변수 확인:");
console.log("  - NODE_ENV:", process.env.NODE_ENV || "development");
console.log("  - PORT:", process.env.PORT || "3000");
console.log("  - COUPANG_ACCESS_KEY:", process.env.COUPANG_ACCESS_KEY ? "설정됨" : "미설정");
console.log("  - COUPANG_SECRET_KEY:", process.env.COUPANG_SECRET_KEY ? "설정됨" : "미설정");

// Axios 인스턴스 설정 (keepAlive 에이전트 사용)
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

const axiosInstance = axios.create({
  timeout: 30000, // 30초 타임아웃
  httpAgent,
  httpsAgent,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Connection': 'keep-alive'
  }
});

// 쿠팡 상품 ID 추출 함수
const extractCoupangProductId = (url) => {
  const regex = /\/vp\/products\/(\d+)/;
  const match = url.match(regex);
  return match ? match[1] : null;
};

// 쿠팡 API 인증 헤더 생성 함수 (HMAC-SHA256)
const generateCoupangAuth = (method, path, body = '') => {
  const crypto = require('crypto');
  const accessKey = process.env.COUPANG_ACCESS_KEY;
  const secretKey = process.env.COUPANG_SECRET_KEY;

  if (!accessKey || !secretKey) {
    throw new Error('쿠팡 API 키가 설정되지 않았습니다. COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY를 확인해주세요.');
  }

  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); // 밀리초 제거
  const message = timestamp + method + path + body;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');

  return {
    'Authorization': `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${timestamp}, signature=${signature}`,
    'Content-Type': 'application/json;charset=UTF-8'
  };
};

// --- Coupang Direct Crawling Functions ---

// 쿠팡 상품 페이지 직접 크롤링 (하드코딩된 셀렉터)
const extractCoupangProductDirect = async (url) => {
  console.log("🌐 쿠팡 직접 크롤링: 상품 정보 추출 시작...");
  
  try {
    const response = await axiosInstance.get(url, {
      headers: {
        'Referer': 'https://www.coupang.com/',
        'Origin': 'https://www.coupang.com',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    const $ = cheerio.load(response.data);
    
    // 1. JSON 데이터 추출 시도 (가장 정확한 방법)
    let jsonData = null;
    try {
      const scriptTags = $('script').toArray();
      for (const script of scriptTags) {
        const content = $(script).html();
        if (content && (content.includes('__INITIAL_STATE__') || content.includes('__APOLLO_STATE__'))) {
          // 여러 패턴 시도
          const patterns = [
            /window\.__INITIAL_STATE__\s*=\s*({.*?});/,
            /window\.__APOLLO_STATE__\s*=\s*({.*?});/,
            /__INITIAL_STATE__\s*:\s*({.*?})/,
            /__APOLLO_STATE__\s*:\s*({.*?})/
          ];
          
          for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match) {
              jsonData = JSON.parse(match[1]);
              console.log("📦 JSON 데이터 발견:", Object.keys(jsonData));
              break;
            }
          }
          if (jsonData) break;
        }
      }
    } catch (jsonError) {
      console.warn("⚠️ JSON 데이터 파싱 실패:", jsonError.message);
    }

    // JSON 데이터에서 상품 정보 추출
    if (jsonData) {
      try {
        // 다양한 JSON 구조 시도
        const productData = jsonData.product || jsonData.productInfo || jsonData.productDetail || jsonData;
        
        if (productData && (productData.productName || productData.name || productData.title)) {
          const name = productData.productName || productData.name || productData.title || '상품명 없음';
          const price = productData.salePrice || productData.price || productData.originalPrice || '0';
          const brand = productData.brand || productData.brandName || '정보 없음';
          const category = productData.categoryName || productData.displayCategoryName || '정보 없음';
          const images = productData.images || productData.imageUrls || [];
          const description = productData.description || productData.detailContent || '';

          return {
            name,
            price: typeof price === 'number' ? price.toLocaleString() : price,
            brand,
            category,
            images: Array.isArray(images) ? images : [],
            description,
            url,
            source: 'json'
          };
        }
      } catch (jsonParseError) {
        console.warn("⚠️ JSON 상품 정보 추출 실패:", jsonParseError.message);
      }
    }

    // JSON 실패 시 HTML 셀렉터로 폴백 (하드코딩된 셀렉터들)
    console.log("🌐 HTML 셀렉터로 폴백...");
    
    // 상품명 추출 (다양한 셀렉터 시도)
    const nameSelectors = [
      'h1.prod-buy-header__title',
      '.prod-buy-header__title',
      'h1.prod-buy-header__title',
      '.product-title',
      'h1',
      '[data-testid="product-title"]',
      '.prod-name',
      '.product-name'
    ];
    
    let name = '상품명 없음';
    for (const selector of nameSelectors) {
      const text = $(selector).text().trim();
      if (text && text !== '') {
        name = text;
        break;
      }
    }

    // 가격 추출 (다양한 셀렉터 시도)
    const priceSelectors = [
      '.total-price strong',
      '.prod-price .total-price',
      '.total-price',
      '.price',
      '.sale-price',
      '.prod-price',
      '[data-testid="price"]',
      '.price-value',
      '.current-price'
    ];
    
    let price = '0';
    for (const selector of priceSelectors) {
      const text = $(selector).text().trim();
      if (text && text !== '') {
        const priceNum = text.replace(/[^0-9]/g, '');
        if (priceNum) {
          price = priceNum;
          break;
        }
      }
    }

    // 브랜드 추출
    const brandSelectors = [
      '.prod-brand-name > a',
      '.prod-brand-name',
      '.brand-name',
      '.product-brand',
      '[data-testid="brand"]',
      '.brand'
    ];
    
    let brand = '정보 없음';
    for (const selector of brandSelectors) {
      const text = $(selector).text().trim();
      if (text && text !== '') {
        brand = text;
        break;
      }
    }

    // 카테고리 추출 (Breadcrumbs)
    const categoryElements = $('.breadcrumb-item > a, .breadcrumb a, .category-path a').map((i, el) => $(el).text().trim()).get();
    const category = categoryElements.length > 0 ? categoryElements.join(' > ') : '정보 없음';

    // 이미지 추출
    const imageSelectors = [
      '.prod-image__detail > img',
      '.prod-image img',
      '.product-image img',
      '.main-image img',
      '.product-img img'
    ];
    
    const images = [];
    for (const selector of imageSelectors) {
      $(selector).each((i, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy');
        if (src && !src.includes('placeholder') && !src.includes('blank')) {
          const fullSrc = src.startsWith('http') ? src : `https:${src}`;
          if (!images.includes(fullSrc)) {
            images.push(fullSrc);
          }
        }
      });
      if (images.length > 0) break;
    }

    // 상세 설명 추출
    const descriptionSelectors = [
      '.product-description',
      '.prod-description',
      '.detail-content',
      '.product-detail',
      '.description'
    ];
    
    let description = '상세 설명 없음';
    for (const selector of descriptionSelectors) {
      const text = $(selector).text().trim();
      if (text && text !== '') {
        description = text;
        break;
      }
    }

    console.log("✅ 직접 크롤링 완료");
    console.log(`  - 상품명: ${name}`);
    console.log(`  - 가격: ${price}`);
    console.log(`  - 브랜드: ${brand}`);
    console.log(`  - 이미지: ${images.length}개`);

    return {
      name,
      price,
      brand,
      category,
      images: images.slice(0, 10),
      description,
      url,
      source: 'direct'
    };

  } catch (error) {
    console.error("❌ 직접 크롤링 실패:", error.message);
    throw error;
  }
};

// 쿠팡 리뷰 직접 추출
const extractCoupangReviewsDirect = async (url) => {
  console.log("🌐 쿠팡 직접 크롤링: 리뷰 추출 시작...");
  
  try {
    const response = await axiosInstance.get(url, {
      headers: {
        'Referer': 'https://www.coupang.com/',
        'Origin': 'https://www.coupang.com'
      }
    });

    const $ = cheerio.load(response.data);
    const reviews = [];
    
    // 리뷰 셀렉터들
    const reviewSelectors = [
      '.sdp-review__article__list > li',
      '.review-item',
      '.review-list > li',
      '.product-review > li'
    ];
    
    for (const selector of reviewSelectors) {
      $(selector).each((i, el) => {
        const author = $(el).find('.sdp-review__article__list__info__name, .review-author, .reviewer-name').text().trim() || '익명';
        const ratingText = $(el).find('.sdp-review__article__list__info__star-score, .review-rating, .rating').text().trim() || '0점';
        const rating = parseInt(ratingText.replace(/[^0-9]/g, '')) / 10;
        const content = $(el).find('.sdp-review__article__list__review-text, .review-content, .review-text').text().trim() || '내용 없음';
        const date = $(el).find('.sdp-review__article__list__info__date, .review-date, .date').text().trim() || '날짜 없음';
        
        if (content !== '내용 없음') {
          reviews.push({ author, content, rating, date });
        }
        
        if (reviews.length >= 5) return false; // 최대 5개만
      });
      
      if (reviews.length > 0) break;
    }
    
    return reviews;
  } catch (error) {
    console.error("❌ 리뷰 추출 실패:", error.message);
    return [];
  }
};

// 쿠팡 Q&A 직접 추출
const extractCoupangQnADirect = async (url) => {
  console.log("🌐 쿠팡 직접 크롤링: Q&A 추출 시작...");
  
  try {
    const response = await axiosInstance.get(url, {
      headers: {
        'Referer': 'https://www.coupang.com/',
        'Origin': 'https://www.coupang.com'
      }
    });

    const $ = cheerio.load(response.data);
    const qna = [];
    
    // Q&A 셀렉터들
    const qnaSelectors = [
      '.sdp-qna__article__list > li',
      '.qna-item',
      '.qna-list > li',
      '.product-qna > li'
    ];
    
    for (const selector of qnaSelectors) {
      $(selector).each((i, el) => {
        const question = $(el).find('.sdp-qna__article__list__question-text, .qna-question, .question-text').text().trim() || '질문 없음';
        const answer = $(el).find('.sdp-qna__article__list__answer-text, .qna-answer, .answer-text').text().trim() || '답변 없음';
        const author = $(el).find('.sdp-qna__article__list__question-info__name, .qna-author, .author').text().trim() || '익명';
        const date = $(el).find('.sdp-qna__article__list__question-info__date, .qna-date, .date').text().trim() || '날짜 없음';
        
        if (question !== '질문 없음') {
          qna.push({ question, answer, author, date });
        }
        
        if (qna.length >= 5) return false; // 최대 5개만
      });
      
      if (qna.length > 0) break;
    }
    
    return qna;
  } catch (error) {
    console.error("❌ Q&A 추출 실패:", error.message);
    return [];
  }
};

// --- Playwright Functions ---

let browser = null; // Playwright 브라우저 인스턴스

const getBrowser = async () => {
  if (!browser) {
    console.log("🚀 Playwright 브라우저 시작...");
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-http2', // HTTP/2 프로토콜 에러 방지
        '--disable-features=VizDisplayCompositor',
        '--disable-web-security',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-render-process-gone-crashes',
        '--disable-site-isolation-trials',
        '--disable-sync',
        '--disable-extensions',
        '--disable-default-apps',
        '--hide-scrollbars',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-first-run',
        '--no-pings',
        '--no-sandbox',
        '--no-zygote',
        '--password-store=basic',
        '--use-gl=swiftshader',
        '--disable-gl-drawing-for-tests',
        '--enable-webgl-image-chromium',
        '--ignore-gpu-blocklist',
        '--enable-features=NetworkService,NetworkServiceInProcess',
        '--disable-features=VizDisplayCompositor',
        '--disable-breakpad',
        '--disable-component-update',
        '--disable-domain-reliability',
        '--disable-field-trial-config',
        '--disable-hang-monitor',
        '--disable-infobars',
        '--disable-notifications',
        '--disable-offer-store-unmasked-wallet-cards',
        '--disable-popup-blocking',
        '--disable-print-preview',
        '--disable-prompt-on-repost',
        '--disable-speech-api',
        '--disable-sync-preferences',
        '--disable-web-security',
        '--enable-automation',
        '--enable-blink-features=IdleDetection',
        '--enable-logging',
        '--force-color-profile=srgb',
        '--log-level=0',
        '--no-sandbox',
        '--no-startup-window',
        '--enable-features=Metal'
      ]
    });
    console.log("✅ Playwright 브라우저 시작 완료");
  }
  return browser;
};

const closeBrowser = async () => {
  if (browser) {
    await browser.close();
    browser = null;
    console.log("👋 Playwright 브라우저 종료");
  }
};

const extractCoupangProductWithPlaywright = async (url) => {
  console.log("🎭 Playwright: 상품 정보 추출 시작...");
  const browserInstance = await getBrowser();
  const context = await browserInstance.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  });
  const page = await context.newPage();

  try {
    console.log("🌐 쿠팡 페이지 로딩 (Playwright)...");
    // HTTP/2 에러 방지를 위한 재시도 로직
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        await page.goto(url, {
          waitUntil: 'networkidle', // 네트워크 활동이 없을 때까지 대기
          timeout: 60000 // 60초 타임아웃
        });
        console.log("✅ 페이지 로딩 성공 (Playwright)");
        break;
      } catch (error) {
        retryCount++;
        console.log(`⚠️ 페이지 로딩 실패 (${retryCount}/${maxRetries}):`, error.message);

        if (retryCount >= maxRetries) {
          throw new Error(`페이지 로딩 실패 (Playwright): ${error.message}`);
        }

        // 잠시 대기 후 재시도
        await page.waitForTimeout(2000);
      }
    }

    // Promise.race로 DOM 파싱 안전장치 추가
    const contentPromise = page.content();
    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 30000)); // 30초 후 타임아웃

    const htmlContent = await Promise.race([contentPromise, timeoutPromise]);

    if (!htmlContent) {
      console.warn("⚠️ Playwright: 30초 내 DOM 로딩 완료되지 않아 강제 파싱 시작.");
    }

    // 상품명
    const name = await page.locator('.prod-buy-header__title').textContent().catch(() => '상품명 없음');
    // 가격
    const price = await page.locator('.total-price > strong').textContent().catch(() => '0').then(text => text.replace(/[^0-9]/g, ''));
    // 브랜드
    const brand = await page.locator('.prod-brand-name > a').textContent().catch(() => '정보 없음');
    // 카테고리 (Breadcrumbs에서 추출)
    const categoryElements = await page.locator('.breadcrumb-item > a').allTextContents().catch(() => []);
    const category = categoryElements.length > 0 ? categoryElements.join(' > ') : '정보 없음';
    // 이미지 (대표 이미지)
    const imageUrl = await page.locator('.prod-image__detail > img').first().getAttribute('src').catch(() => null);
    const images = imageUrl ? [imageUrl] : [];
    // 상세 설명 (간단하게 첫 단락 또는 특정 영역 텍스트)
    const description = await page.locator('.product-description').textContent().catch(() => '상세 설명 없음');

    // 리뷰 및 Q&A 추출
    const reviews = await extractCoupangReviewsWithPlaywright(page);
    const qna = await extractCoupangQnAWithPlaywright(page);

    return {
      name,
      price,
      brand,
      category,
      images,
      description,
      reviews,
      qna,
      url,
      source: 'playwright'
    };
  } finally {
    await context.close();
    // 브라우저는 재사용을 위해 닫지 않음.
    // await closeBrowser(); // 모든 요청 처리 후 브라우저를 닫으려면 여기에 추가
  }
};

const extractCoupangReviewsWithPlaywright = async (page) => {
  console.log("🎭 Playwright: 리뷰 추출 시작...");
  try {
    // 리뷰 탭 클릭 (있다면)
    const reviewTab = page.locator('a[data-tab-name="review"]');
    if (await reviewTab.isVisible()) {
      await reviewTab.click();
      await page.waitForSelector('.sdp-review__article__list', { timeout: 10000 }).catch(() => console.log("리뷰 목록 로딩 실패"));
    }

    const reviewItems = await page.locator('.sdp-review__article__list > li').all();
    const reviews = [];
    for (const item of reviewItems) {
      const author = await item.locator('.sdp-review__article__list__info__name').textContent().catch(() => '익명');
      const ratingText = await item.locator('.sdp-review__article__list__info__star-score').textContent().catch(() => '0점');
      const rating = parseInt(ratingText.replace(/[^0-9]/g, '')) / 10; // "50점" -> 5
      const content = await item.locator('.sdp-review__article__list__review-text').textContent().catch(() => '내용 없음');
      const date = await item.locator('.sdp-review__article__list__info__date').textContent().catch(() => '날짜 없음');
      reviews.push({ author, content, rating, date });
      if (reviews.length >= 5) break; // 최대 5개만 가져오기
    }
    return reviews;
  } catch (error) {
    console.error("❌ Playwright 리뷰 추출 실패:", error.message);
    return [];
  }
};

const extractCoupangQnAWithPlaywright = async (page) => {
  console.log("🎭 Playwright: Q&A 추출 시작...");
  try {
    // Q&A 탭 클릭 (있다면)
    const qnaTab = page.locator('a[data-tab-name="qna"]');
    if (await qnaTab.isVisible()) {
      await qnaTab.click();
      await page.waitForSelector('.sdp-qna__article__list', { timeout: 10000 }).catch(() => console.log("Q&A 목록 로딩 실패"));
    }

    const qnaItems = await page.locator('.sdp-qna__article__list > li').all();
    const qna = [];
    for (const item of qnaItems) {
      const question = await item.locator('.sdp-qna__article__list__question-text').textContent().catch(() => '질문 없음');
      const answer = await item.locator('.sdp-qna__article__list__answer-text').textContent().catch(() => '답변 없음');
      const author = await item.locator('.sdp-qna__article__list__question-info__name').textContent().catch(() => '익명');
      const date = await item.locator('.sdp-qna__article__list__question-info__date').textContent().catch(() => '날짜 없음');
      qna.push({ question, answer, author, date });
      if (qna.length >= 5) break; // 최대 5개만 가져오기
    }
    return qna;
  } catch (error) {
    console.error("❌ Playwright Q&A 추출 실패:", error.message);
    return [];
  }
};


// --- HTML Parsing (Cheerio) Functions ---

const extractCoupangProductWithHtmlParsing = async (url) => {
  console.log("🌐 HTML 파싱: 상품 정보 추출 시작...");
  try {
    const response = await axiosInstance.get(url, {
      headers: {
        'Referer': 'https://www.coupang.com/',
        'Origin': 'https://www.coupang.com'
      }
    });

    const $ = cheerio.load(response.data);

    // 1. 페이지 내 JSON 데이터 추출 시도 (Playwright 없이 Cheerio로만)
    let jsonData = null;
    try {
      const scriptTags = $('script').toArray();
      for (const script of scriptTags) {
        const content = $(script).html();
        if (content && content.includes('__INITIAL_STATE__')) {
          const match = content.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});/);
          if (match) {
            jsonData = JSON.parse(match[1]);
            console.log("📦 JSON 데이터 발견 (HTML 파싱 내부):", Object.keys(jsonData));
            break;
          }
        }
      }

      if (jsonData && jsonData.product && jsonData.product.product) {
        const product = jsonData.product.product;
        const name = product.productName || product.name || '상품명 없음';
        const price = product.salePrice || product.price || '0';
        const brand = product.brand || '정보 없음';
        const category = product.displayCategoryName || product.categoryName || '정보 없음';
        const images = product.images ? product.images.map(img => img.url) : [];
        const description = product.description || '';

        return {
          name,
          price: price.toLocaleString(),
          brand,
          category,
          images,
          description,
          reviews: [], // JSON 데이터에 리뷰/Q&A는 보통 없음
          qna: [],
          url,
          source: 'json'
        };
      }
    } catch (jsonError) {
      console.warn("⚠️ HTML 파싱: JSON 데이터 추출 실패:", jsonError.message);
    }

    // JSON 데이터 추출 실패 시 HTML 셀렉터로 폴백
    const name = $('.prod-buy-header__title').text().trim() || '상품명 없음';
    const price = $('.total-price > strong').text().trim().replace(/[^0-9]/g, '') || '0';
    const brand = $('.prod-brand-name > a').text().trim() || '정보 없음';
    const categoryElements = $('.breadcrumb-item > a').map((i, el) => $(el).text().trim()).get();
    const category = categoryElements.length > 0 ? categoryElements.join(' > ') : '정보 없음';
    const imageUrl = $('.prod-image__detail > img').first().attr('src');
    const images = imageUrl ? [imageUrl] : [];
    const description = $('.product-description').text().trim() || '상세 설명 없음';

    // 리뷰 및 Q&A 추출
    const reviews = extractCoupangReviewsWithHtmlParsing($);
    const qna = extractCoupangQnAWithHtmlParsing($);

    return {
      name,
      price,
      brand,
      category,
      images,
      description,
      reviews,
      qna,
      url,
      source: 'html'
    };
  } catch (error) {
    console.error("❌ HTML 파싱 상품 정보 추출 실패:", error.message);
    throw error;
  }
};

const extractCoupangReviewsWithHtmlParsing = ($) => {
  console.log("🌐 HTML 파싱: 리뷰 추출 시작...");
  const reviews = [];
  $('.sdp-review__article__list > li').each((i, el) => {
    const author = $(el).find('.sdp-review__article__list__info__name').text().trim() || '익명';
    const ratingText = $(el).find('.sdp-review__article__list__info__star-score').text().trim() || '0점';
    const rating = parseInt(ratingText.replace(/[^0-9]/g, '')) / 10;
    const content = $(el).find('.sdp-review__article__list__review-text').text().trim() || '내용 없음';
    const date = $(el).find('.sdp-review__article__list__info__date').text().trim() || '날짜 없음';
    reviews.push({ author, content, rating, date });
    if (reviews.length >= 5) return false; // 최대 5개만 가져오기
  });
  return reviews;
};

const extractCoupangQnAWithHtmlParsing = ($) => {
  console.log("🌐 HTML 파싱: Q&A 추출 시작...");
  const qna = [];
  $('.sdp-qna__article__list > li').each((i, el) => {
    const question = $(el).find('.sdp-qna__article__list__question-text').text().trim() || '질문 없음';
    const answer = $(el).find('.sdp-qna__article__list__answer-text').text().trim() || '답변 없음';
    const author = $(el).find('.sdp-qna__article__list__question-info__name').text().trim() || '익명';
    const date = $(el).find('.sdp-qna__article__list__question-info__date').text().trim() || '날짜 없음';
    qna.push({ question, answer, author, date });
    if (qna.length >= 5) return false; // 최대 5개만 가져오기
  });
  return qna;
};


// --- Main Extraction Orchestrator ---

const extractCoupangProduct = async (url) => {
  const startTime = process.hrtime.bigint();
  let result = {
    product: {
      name: '상품명 없음',
      price: '0',
      brand: '정보 없음',
      category: '정보 없음',
      images: [],
      description: '상세 설명 없음',
      url,
      source: '실패'
    },
    reviews: [],
    qna: [],
    debug: {
      errors: [],
      processingTime: 0
    }
  };

  const productId = extractCoupangProductId(url);
  if (!productId) {
    result.debug.errors.push('URL에서 상품 ID를 추출할 수 없습니다.');
    result.debug.processingTime = Number(process.hrtime.bigint() - startTime) / 1_000_000;
    return result;
  }

  // 1. 직접 크롤링 우선 (하드코딩된 셀렉터)
  try {
    console.log("--- 1단계: 직접 크롤링 시도 ---");
    const directProduct = await extractCoupangProductDirect(url);
    result.product = directProduct;
    result.reviews = await extractCoupangReviewsDirect(url);
    result.qna = await extractCoupangQnADirect(url);
    result.debug.errors.push('직접 크롤링 성공');
    console.log("✅ 직접 크롤링 성공");
    result.debug.processingTime = Number(process.hrtime.bigint() - startTime) / 1_000_000;
    return result;
  } catch (directError) {
    console.error("❌ 직접 크롤링 실패:", directError.message);
    result.debug.errors.push(`직접 크롤링 실패: ${directError.message}`);
  }

  // 2. Playwright 시도 (JavaScript 렌더링)
  if (chromium) {
    try {
      console.log("--- 2단계: Playwright 시도 ---");
      const playwrightData = await extractCoupangProductWithPlaywright(url);
      result.product = playwrightData;
      result.reviews = playwrightData.reviews;
      result.qna = playwrightData.qna;
      result.debug.errors.push('Playwright 추출 성공');
      console.log("✅ Playwright 추출 성공");
      result.debug.processingTime = Number(process.hrtime.bigint() - startTime) / 1_000_000;
      return result;
    } catch (playwrightError) {
      console.error("❌ Playwright 추출 실패:", playwrightError.message);
      result.debug.errors.push(`Playwright 추출 실패: ${playwrightError.message}`);
      // Playwright 실패 시 브라우저 닫기 (리소스 해제)
      await closeBrowser();
    }
  } else {
    console.log("⚠️ Playwright 모듈이 로딩되지 않아 Playwright 단계를 건너뜁니다.");
    result.debug.errors.push('Playwright 모듈 로딩 실패로 Playwright 단계 건너뜀');
  }

  // 3. HTML 파싱 시도 (기존 방식)
  try {
    console.log("--- 3단계: HTML 파싱 시도 ---");
    const htmlData = await extractCoupangProductWithHtmlParsing(url);
    result.product = htmlData;
    result.reviews = htmlData.reviews;
    result.qna = htmlData.qna;
    result.debug.errors.push('HTML 파싱 성공');
    console.log("✅ HTML 파싱 성공");
    result.debug.processingTime = Number(process.hrtime.bigint() - startTime) / 1_000_000;
    return result;
  } catch (htmlError) {
    console.error("❌ HTML 파싱 실패:", htmlError.message);
    result.debug.errors.push(`HTML 파싱 실패: ${htmlError.message}`);
  }

  console.log("--- 모든 추출 방법 실패 ---");
  result.debug.processingTime = Number(process.hrtime.bigint() - startTime) / 1_000_000;
  return result;
};


// Express 앱 설정
const app = express();
app.use(cors());
app.use(express.json());

// 클라이언트 정적 파일 서빙
const __dirname = fileURLToPath(new URL('.', import.meta.url));
app.use(express.static(path.join(__dirname, '../dist')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Endpoint: /api/extract
app.post('/api/extract', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ ok: false, error: 'URL이 필요합니다.' });
  }

  // 네이버 스마트스토어 URL 감지
  if (url.includes('smartstore.naver.com')) {
    return res.status(400).json({
      ok: false,
      error: '🚧 네이버 스마트스토어 서비스는 준비중입니다.\n\n현재 쿠팡 상품만 지원합니다.\n쿠팡 상품 URL을 입력해주세요.',
      vendor: 'naver'
    });
  }

  // 쿠팡 URL이 아니면 에러 반환
  if (!url.includes('coupang.com')) {
    return res.status(400).json({
      ok: false,
      error: '지원하지 않는 URL입니다. 쿠팡 상품 URL을 입력해주세요.',
      vendor: 'unknown'
    });
  }

  try {
    const data = await extractCoupangProduct(url);
    if (data.product.source === '실패') {
      return res.status(500).json({ ok: false, error: '상품 정보 추출에 실패했습니다.', debug: data.debug });
    }
    res.json({ ok: true, product: data.product, reviews: data.reviews, qna: data.qna, debug: data.debug });
  } catch (error) {
    console.error("API 처리 중 오류 발생:", error);
    res.status(500).json({ ok: false, error: '서버 내부 오류가 발생했습니다.', errorDetails: error.message });
  }
});

// 모든 경로에 대해 index.html 서빙 (React SPA 라우팅 처리)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist', 'index.html'));
});

// 서버 시작
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
  console.log(`환경: ${process.env.NODE_ENV || 'development'}`);
});

// 서버 타임아웃 설정 (2분)
server.timeout = 120000; // 2분 (밀리초)
console.log(`서버 타임아웃 설정: ${server.timeout / 1000}초`);

// 예기치 않은 종료 시 Playwright 브라우저 닫기
process.on('exit', closeBrowser);
process.on('SIGINT', async () => { // Ctrl+C
  await closeBrowser();
  process.exit(0);
});
process.on('SIGTERM', async () => { // kill command
  await closeBrowser();
  process.exit(0);
});
process.on('uncaughtException', async (err) => {
  console.error('🚨 Uncaught Exception:', err);
  await closeBrowser();
  process.exit(1);
});
process.on('unhandledRejection', async (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
  await closeBrowser();
  process.exit(1);
});