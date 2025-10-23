// index.js (네이버 스마트스토어 iframe 크롤러 - iframe 내부 직접 접근)
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
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

// health check
app.get("/api/health", (_req, res) => res.json({ 
  ok: true, 
  ts: Date.now(),
  environment: process.env.NODE_ENV || 'development',
  outdir: OUTDIR
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
 * iframe 내부에서 상품 데이터 추출 (강화된 디버깅)
 */
async function extractFromFrame(page, frame, frameIndex) {
  console.log(`🔍 iframe ${frameIndex} 내부 데이터 추출 시작`);
  
  const result = {
    product: {
      name: null,
      price: null,
      summary: null,
      image: null
    },
    reviews: [],
    qa: [],
    debug: {
      frameUrl: null,
      htmlContent: null,
      textContent: null,
      foundElements: [],
      errors: []
    }
  };

  try {
    // iframe URL 확인
    result.debug.frameUrl = frame.url();
    console.log(`📍 iframe ${frameIndex} URL:`, result.debug.frameUrl);

    // iframe 내부 HTML 전체 가져오기
    console.log(`📄 iframe ${frameIndex} HTML 내용 확인 중...`);
    try {
      const html = await frame.content();
      result.debug.htmlContent = html;
      console.log(`📄 iframe ${frameIndex} HTML 길이:`, html.length);
      console.log(`📄 iframe ${frameIndex} HTML 처음 500자:`, html.slice(0, 500));
      
      // HTML에서 특정 키워드 찾기
      if (html.includes('상품명') || html.includes('가격') || html.includes('리뷰')) {
        console.log(`✅ iframe ${frameIndex}에서 상품 관련 키워드 발견!`);
      } else {
        console.log(`⚠️ iframe ${frameIndex}에서 상품 관련 키워드 없음`);
      }
    } catch (e) {
      result.debug.errors.push(`HTML 읽기 실패: ${e.message}`);
      console.log(`❌ iframe ${frameIndex} HTML 읽기 실패:`, e.message);
    }

    // iframe 내부 텍스트 내용 확인
    try {
      const textContent = await frame.textContent('body');
      result.debug.textContent = textContent;
      console.log(`📄 iframe ${frameIndex} 텍스트 길이:`, textContent ? textContent.length : 0);
      console.log(`📄 iframe ${frameIndex} 텍스트 처음 300자:`, textContent ? textContent.slice(0, 300) : 'null');
    } catch (e) {
      result.debug.errors.push(`텍스트 읽기 실패: ${e.message}`);
      console.log(`❌ iframe ${frameIndex} 텍스트 읽기 실패:`, e.message);
    }

    // 1. 상품명 추출 (다양한 셀렉터 시도)
    console.log(`📝 iframe ${frameIndex} 상품명 추출 시도 중...`);
    const nameSelectors = [
      // 네이버 스마트스토어 특화 셀렉터
      'h1._1SY6k',
      'h1[data-testid="product-title"]',
      '.product_title h1',
      '.product_name h1',
      '.goods_name h1',
      '.product_info h1',
      '.product_detail h1',
      '.product_name_area h1',
      '.product_title_area h1',
      '.product_name_area h3',
      '.product_title_area h3',
      // 일반적인 셀렉터
      'h1', 'h2', 'h3',
      '._1SY6k',
      '[data-testid="product-title"]',
      '.product_title',
      '.productName',
      '.goods_name',
      '.product_name',
      '.product_title_text',
      '.product_name_text',
      '.product_info h1',
      '.product_detail h1',
      '.product_name_area h1',
      '.product_title_area h1',
      '.product_name_area h3',
      '.product_title_area h3',
      '.product_title',
      '.product_name',
      '.goods_title',
      '.goods_name',
      '.product_name_text',
      '.goods_name_text',
      '.product_title_text',
      '.goods_title_text',
      // 추가 셀렉터
      '[class*="product"] h1',
      '[class*="goods"] h1',
      '[class*="title"]',
      '[class*="name"]'
    ];

    for (const selector of nameSelectors) {
      try {
        const element = frame.locator(selector).first();
        const count = await element.count();
        if (count > 0) {
          const text = await element.textContent();
          if (text && text.trim()) {
            result.product.name = text.trim();
            result.debug.foundElements.push(`상품명: ${selector} -> ${text.trim()}`);
            console.log(`✅ iframe ${frameIndex} 상품명 발견 (${selector}):`, result.product.name);
            break;
          }
        }
      } catch (e) {
        // 셀렉터 실패 시 다음 시도
      }
    }

    // 2. 가격 추출 (다양한 셀렉터 시도)
    console.log(`💰 iframe ${frameIndex} 가격 추출 시도 중...`);
    const priceSelectors = [
      // 네이버 스마트스토어 특화 셀렉터
      '.price_value',
      '.price_text',
      '.price_number',
      '.product_price_text',
      '.price_area .price',
      '.product_price_area .price',
      '.price_area',
      '.product_price_area',
      // 일반적인 셀렉터
      '.price',
      '.product_price',
      '.goods_price',
      '[data-testid="price"]',
      '.price_value',
      '.price_text',
      '.price_number',
      '.product_price_text',
      '.price_area .price',
      '.product_price_area .price',
      '.price_area',
      '.product_price_area',
      // 추가 셀렉터
      '[class*="price"]',
      '[class*="cost"]',
      '[class*="amount"]',
      'span:contains("원")',
      'div:contains("원")',
      'span:contains("₩")',
      'div:contains("₩")'
    ];

    for (const selector of priceSelectors) {
      try {
        const element = frame.locator(selector).first();
        const count = await element.count();
        if (count > 0) {
          const text = await element.textContent();
          if (text && text.trim()) {
            result.product.price = text.trim();
            result.debug.foundElements.push(`가격: ${selector} -> ${text.trim()}`);
            console.log(`✅ iframe ${frameIndex} 가격 발견 (${selector}):`, result.product.price);
            break;
          }
        }
      } catch (e) {
        // 셀렉터 실패 시 다음 시도
      }
    }

    // 3. 요약 정보 추출
    console.log(`📄 iframe ${frameIndex} 요약 정보 추출 시도 중...`);
    const summarySelectors = [
      '.product_summary',
      '.goods_summary',
      '.product_description',
      '.goods_description',
      '.product_info',
      '.product_detail',
      '.product_summary_text',
      '.product_description_text',
      '.product_info_text',
      '.goods_info_text',
      // 추가 셀렉터
      '[class*="summary"]',
      '[class*="description"]',
      '[class*="info"]',
      '[class*="detail"]'
    ];

    for (const selector of summarySelectors) {
      try {
        const element = frame.locator(selector).first();
        const count = await element.count();
        if (count > 0) {
          const text = await element.textContent();
          if (text && text.trim()) {
            result.product.summary = text.trim();
            result.debug.foundElements.push(`요약: ${selector} -> ${text.trim()}`);
            console.log(`✅ iframe ${frameIndex} 요약 발견 (${selector}):`, result.product.summary);
            break;
          }
        }
      } catch (e) {
        // 셀렉터 실패 시 다음 시도
      }
    }

    // 4. 이미지 추출
    console.log(`🖼️ iframe ${frameIndex} 이미지 추출 시도 중...`);
    const imageSelectors = [
      '.product_image img',
      '.goods_image img',
      '.product_thumb img',
      '.goods_thumb img',
      '.product_main_image img',
      '.goods_main_image img',
      'img[alt*="상품"]',
      'img[alt*="제품"]',
      // 추가 셀렉터
      'img[src*="product"]',
      'img[src*="goods"]',
      'img[class*="product"]',
      'img[class*="goods"]'
    ];

    for (const selector of imageSelectors) {
      try {
        const element = frame.locator(selector).first();
        const count = await element.count();
        if (count > 0) {
          const src = await element.getAttribute('src');
          if (src) {
            result.product.image = src;
            result.debug.foundElements.push(`이미지: ${selector} -> ${src}`);
            console.log(`✅ iframe ${frameIndex} 이미지 발견 (${selector}):`, result.product.image);
            break;
          }
        }
      } catch (e) {
        // 셀렉터 실패 시 다음 시도
      }
    }

    // 5. 리뷰 데이터 추출
    console.log(`⭐ iframe ${frameIndex} 리뷰 데이터 추출 시도 중...`);
    try {
      // 리뷰 관련 셀렉터들
      const reviewSelectors = [
        'button:has-text("리뷰")',
        'a:has-text("리뷰")',
        '.review_tab',
        '.review_tab_button',
        '[data-testid="review-tab"]',
        '[class*="review"]'
      ];

      for (const selector of reviewSelectors) {
        try {
          const element = frame.locator(selector).first();
          const count = await element.count();
          if (count > 0) {
            await element.click();
            console.log(`✅ iframe ${frameIndex} 리뷰 탭 클릭 성공`);
            await frame.waitForTimeout(2000);
            break;
          }
        } catch (e) {
          // 클릭 실패 시 다음 시도
        }
      }

      // 리뷰 아이템 추출
      const reviewItemSelectors = [
        '.review_item',
        '.review-item',
        '.review_list .item',
        '.review_list_item',
        '.review_content',
        '.review_text',
        '[class*="review"]'
      ];

      for (const selector of reviewItemSelectors) {
        try {
          const elements = await frame.locator(selector).all();
          if (elements.length > 0) {
            console.log(`📊 iframe ${frameIndex} ${elements.length}개의 리뷰 발견`);
            
            for (let i = 0; i < Math.min(elements.length, 10); i++) {
              try {
                const element = elements[i];
                const author = await element.locator('.review_author, .author, .reviewer').textContent().catch(() => '익명');
                const rating = await element.locator('.rating, .star, .score').textContent().catch(() => '');
                const content = await element.locator('.review_content, .content, .text').textContent().catch(() => '');
                const date = await element.locator('.date, .review_date').textContent().catch(() => '');

                if (content && content.trim()) {
                  result.reviews.push({
                    author: author || '익명',
                    rating: rating || '',
                    content: content.trim(),
                    date: date || ''
                  });
                }
              } catch (e) {
                console.log(`❌ iframe ${frameIndex} 리뷰 ${i} 추출 실패:`, e.message);
              }
            }
            break;
          }
        } catch (e) {
          // 셀렉터 실패 시 다음 시도
        }
      }
    } catch (e) {
      console.log(`❌ iframe ${frameIndex} 리뷰 추출 실패:`, e.message);
    }

    // 6. Q&A 데이터 추출
    console.log(`❓ iframe ${frameIndex} Q&A 데이터 추출 시도 중...`);
    try {
      const qaSelectors = [
        'button:has-text("문의")',
        'button:has-text("Q&A")',
        'a:has-text("문의")',
        'a:has-text("Q&A")',
        '.qa_tab',
        '.qna_tab',
        '.qa_tab_button',
        '.qna_tab_button',
        '[data-testid="qa-tab"]',
        '[class*="qa"]',
        '[class*="qna"]'
      ];

      for (const selector of qaSelectors) {
        try {
          const element = frame.locator(selector).first();
          const count = await element.count();
          if (count > 0) {
            await element.click();
            console.log(`✅ iframe ${frameIndex} Q&A 탭 클릭 성공`);
            await frame.waitForTimeout(2000);
            break;
          }
        } catch (e) {
          // 클릭 실패 시 다음 시도
        }
      }

      const qaItemSelectors = [
        '.qa_item',
        '.qna_item',
        '.qa-item',
        '.qna-item',
        '.qa_list .item',
        '.qna_list .item',
        '.qa_list_item',
        '.qna_list_item',
        '[class*="qa"]',
        '[class*="qna"]'
      ];

      for (const selector of qaItemSelectors) {
        try {
          const elements = await frame.locator(selector).all();
          if (elements.length > 0) {
            console.log(`📊 iframe ${frameIndex} ${elements.length}개의 Q&A 발견`);
            
            for (let i = 0; i < Math.min(elements.length, 10); i++) {
              try {
                const element = elements[i];
                const question = await element.locator('.question, .qa_question, .qna_question').textContent().catch(() => '');
                const answer = await element.locator('.answer, .qa_answer, .qna_answer').textContent().catch(() => '');
                const author = await element.locator('.author, .qa_author, .qna_author').textContent().catch(() => '익명');
                const date = await element.locator('.date, .qa_date, .qna_date').textContent().catch(() => '');

                if (question && question.trim()) {
                  result.qa.push({
                    question: question.trim(),
                    answer: answer ? answer.trim() : '',
                    author: author || '익명',
                    date: date || ''
                  });
                }
              } catch (e) {
                console.log(`❌ iframe ${frameIndex} Q&A ${i} 추출 실패:`, e.message);
              }
            }
            break;
          }
        } catch (e) {
          // 셀렉터 실패 시 다음 시도
        }
      }
    } catch (e) {
      console.log(`❌ iframe ${frameIndex} Q&A 추출 실패:`, e.message);
    }

    console.log(`🎉 iframe ${frameIndex} 데이터 추출 완료`);
    console.log(`📊 iframe ${frameIndex} 추출 결과:`, {
      name: result.product.name,
      price: result.product.price,
      summary: result.product.summary,
      image: result.product.image,
      reviews: result.reviews.length,
      qa: result.qa.length,
      foundElements: result.debug.foundElements.length
    });
    
    return result;
  } catch (e) {
    console.log(`❌ iframe ${frameIndex} 데이터 추출 실패:`, e.message);
    result.debug.errors.push(`전체 추출 실패: ${e.message}`);
    return result;
  }
}

/**
 * POST /api/extract
 * Body: { url: string }
 * Returns: JSON diagnostic summary and list of saved files
 */
app.post("/api/extract", async (req, res) => {
  const t0 = Date.now();
  const { url } = req.body || {};
  if (!url) return res.status(200).json({ ok: false, reason: "NO_URL_PROVIDED" });

  console.log("🚀 네이버 스마트스토어 크롤링 시작:", url);

  // 응답 데이터 구조
  const response = {
    ok: false,
    inputUrl: url,
    finalUrl: null,
    httpStatus: null,
    product: { name: null, price: null, image: null, summary: null },
    reviews: [],
    qa: [],
    frames: [],
    steps: [],
    durationMs: null,
    error: null,
    errorDetails: null,
    debug: {
      console: [],
      pageErrors: [],
      requestFailed: [],
      savedFiles: [],
      totalFrames: 0,
      framesWithData: 0
    }
  };

  let browser = null;
  let page = null;

  try {
    console.log("📱 브라우저 실행 중...");
    response.steps.push("launch");
    const headlessEnv = (process.env.HEADLESS ?? "true").toLowerCase();
    const headless = headlessEnv === "true";

    browser = await chromium.launch({
      headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
        "--memory-pressure-off",
        "--max_old_space_size=2048",
        "--single-process",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding"
      ],
    });

    console.log("✅ 브라우저 실행 완료");

    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116 Safari/537.36",
      locale: "ko-KR",
      timezoneId: "Asia/Seoul",
      viewport: { width: 1366, height: 800 },
      extraHTTPHeaders: {
        "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        referer: "https://search.naver.com/",
      },
    });

    page = await context.newPage();
    console.log("📄 새 페이지 생성 완료");

    // 이벤트 리스너 설정
    page.on("console", (m) => {
      const s = `[${m.type()}] ${m.text()}`;
      if (response.debug.console.length < 200) response.debug.console.push(s);
      console.log("PAGE_CONSOLE:", s);
    });
    page.on("pageerror", (err) => {
      const s = String(err?.message || err);
      response.debug.pageErrors.push(s);
      console.error("PAGE_ERROR:", s);
    });
    page.on("requestfailed", (r) => {
      response.debug.requestFailed.push({ url: r.url(), err: r.failure()?.errorText || null });
      console.warn("REQUEST_FAILED:", r.url(), r.failure()?.errorText || null);
    });

    console.log("🌐 페이지 로딩 중...");
    response.steps.push("goto");
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    response.httpStatus = resp ? resp.status() : null;
    console.log("✅ 페이지 로딩 완료, HTTP 상태:", response.httpStatus);
    
    console.log("⏳ 네트워크 대기 중...");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    response.finalUrl = page.url();
    console.log("📍 최종 URL:", response.finalUrl);

    // JavaScript 렌더링 대기
    console.log("⏳ 동적 콘텐츠 렌더링 대기 중...");
    await page.waitForTimeout(3000);

    // iframe 스캔 및 데이터 추출
    console.log("🔍 iframe 스캔 중...");
    response.steps.push("scan-frames");
    const frames = page.frames();
    console.log(`📊 총 ${frames.length}개의 iframe 발견`);

    let foundData = false;

    // 각 iframe에서 데이터 추출 시도
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const frameUrl = frame.url() || "";
      const frameName = frame.name() || null;
      
      console.log(`🔍 iframe ${i} 스캔 중:`, frameUrl.slice(0, 100));
      
      const frameInfo = { 
        index: i, 
        url: frameUrl.slice(0, 1000), 
        name: frameName,
        hasData: false,
        debug: {
          htmlContent: null,
          textContent: null,
          foundElements: [],
          errors: []
        }
      };
      
      try {
        // iframe 내부에서 데이터 추출 (강화된 디버깅)
        const frameData = await extractFromFrame(page, frame, i);
        
        // 디버깅 정보 저장
        frameInfo.debug = frameData.debug;
        
        // 데이터가 있는지 확인
        if (frameData.product.name || frameData.product.price || frameData.reviews.length > 0 || frameData.qa.length > 0) {
          console.log(`✅ iframe ${i}에서 유용한 데이터 발견!`);
          frameInfo.hasData = true;
          foundData = true;
          
          // 메인 응답에 데이터 병합
          if (frameData.product.name) response.product.name = frameData.product.name;
          if (frameData.product.price) response.product.price = frameData.product.price;
          if (frameData.product.summary) response.product.summary = frameData.product.summary;
          if (frameData.product.image) response.product.image = frameData.product.image;
          
          response.reviews.push(...frameData.reviews);
          response.qa.push(...frameData.qa);
          
          console.log(`📊 iframe ${i} 최종 데이터:`, {
            name: frameData.product.name,
            price: frameData.product.price,
            summary: frameData.product.summary,
            image: frameData.product.image,
            reviews: frameData.reviews.length,
            qa: frameData.qa.length
          });
        } else {
          console.log(`⚠️ iframe ${i}에서 유용한 데이터를 찾지 못함`);
          console.log(`📄 iframe ${i} HTML 스니펫:`, frameData.debug.htmlContent ? frameData.debug.htmlContent.slice(0, 500) : 'null');
          console.log(`📄 iframe ${i} 텍스트 스니펫:`, frameData.debug.textContent ? frameData.debug.textContent.slice(0, 300) : 'null');
        }
        
        // HTML 저장 (디버깅용)
        try {
          const html = await frame.content();
          const fname = path.join(OUTDIR, `frame-${i}-${Date.now()}.html`);
          fs.writeFileSync(fname, html.slice(0, 2_000_000));
          frameInfo.saved = fname;
          response.debug.savedFiles.push(fname);
          console.log(`💾 iframe ${i} HTML 저장 완료:`, fname);
              } catch (e) {
          console.log(`⚠️ iframe ${i} HTML 저장 실패:`, e.message);
        }
        
      } catch (e) {
        console.log(`❌ iframe ${i} 처리 실패:`, e.message);
        frameInfo.error = e.message;
      }

      response.frames.push(frameInfo);
    }

    if (!foundData) {
      console.log("⚠️ iframe에서 데이터를 찾지 못함, 메인 페이지에서 추출 시도");
      
      // 메인 페이지에서 기본 정보 추출 시도
      try {
        const title = await page.title();
        if (title) {
          response.product.name = title;
          console.log("✅ 페이지 제목으로 상품명 설정:", title);
        }
      } catch (e) {
        console.log("❌ 메인 페이지에서 데이터 추출 실패:", e.message);
      }
    }

    // HTML 및 스크린샷 저장
    console.log("💾 HTML 및 스크린샷 저장 중...");
    response.steps.push("save-html-screenshot");
    try {
      const html = await page.content();
      const htmlF = path.join(OUTDIR, `page-${Date.now()}.html`);
      fs.writeFileSync(htmlF, html.slice(0, 2_000_000));
      response.debug.savedFiles.push(htmlF);
      console.log("✅ HTML 저장 완료");
    } catch (e) { 
      console.warn("❌ HTML 저장 실패:", e?.message || e); 
    }

    try {
      const shotF = path.join(OUTDIR, `shot-${Date.now()}.png`);
      await page.screenshot({ path: shotF, fullPage: true }).catch(() => {});
      response.debug.savedFiles.push(shotF);
      console.log("✅ 스크린샷 저장 완료");
      } catch (e) {
      console.warn("❌ 스크린샷 저장 실패:", e?.message || e); 
    }

    response.ok = true;
    response.steps.push("done");
    response.durationMs = Date.now() - t0;
    
    // 디버깅 정보 업데이트
    response.debug.totalFrames = response.frames.length;
    response.debug.framesWithData = response.frames.filter(f => f.hasData).length;
    
    console.log("🎉 크롤링 완료:", response.durationMs + "ms");
    console.log("📊 최종 결과:");
    console.log("  - 상품명:", response.product.name);
    console.log("  - 가격:", response.product.price);
    console.log("  - 요약:", response.product.summary);
    console.log("  - 이미지:", response.product.image);
    console.log("  - 리뷰 수:", response.reviews.length);
    console.log("  - Q&A 수:", response.qa.length);
    console.log("  - 총 iframe 수:", response.debug.totalFrames);
    console.log("  - 데이터가 있는 iframe 수:", response.debug.framesWithData);
    
    // 각 iframe별 디버깅 정보 출력
    response.frames.forEach((frame, index) => {
      console.log(`📊 iframe ${index} 디버깅 정보:`);
      console.log(`  - URL: ${frame.url}`);
      console.log(`  - 데이터 있음: ${frame.hasData}`);
      console.log(`  - 발견된 요소: ${frame.debug.foundElements.join(', ')}`);
      console.log(`  - 오류: ${frame.debug.errors.join(', ')}`);
      if (frame.debug.htmlContent) {
        console.log(`  - HTML 스니펫: ${frame.debug.htmlContent.slice(0, 200)}...`);
      }
    });
    
    return res.status(200).json(response);
  } catch (err) {
    response.ok = false;
    response.error = String(err?.message || err);
    response.errorDetails = {
      message: err?.message || "Unknown error",
      stack: err?.stack || null,
      name: err?.name || "Error"
    };
    response.steps.push("catch");
    response.durationMs = Date.now() - t0;
    console.error("❌ EXTRACT ERROR:", err);
    return res.status(200).json(response);
  } finally {
    try { await page?.close(); } catch {}
    try { await browser?.close(); } catch {}
    console.log("🔒 브라우저 종료 완료");
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
  console.log(`✅ 서버 준비 완료!`);
});