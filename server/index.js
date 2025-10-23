// index.js (Railway 최적화 버전)
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
      "🚀 Playwright 크롤러 API 실행 중\n\n" +
      "POST JSON {\"url\":\"...\"} to /api/extract to run crawler.\n\n" +
      "빌드된 프론트엔드가 없습니다. npm run build를 실행하세요."
    );
  }
});

/**
 * POST /api/extract
 * Body: { url: string }
 * Returns: JSON diagnostic summary and list of saved files
 */
app.post("/api/extract", async (req, res) => {
  const t0 = Date.now();
  const { url } = req.body || {};
  if (!url) return res.status(200).json({ ok: false, reason: "NO_URL_PROVIDED" });

  console.log("🚀 크롤링 시작:", url);

  // debug diag object that will be returned
  const diag = {
    ok: false,
    inputUrl: url,
    finalUrl: null,
    httpStatus: null,
    metas: {},
    product: { name: null, price: null, image: null, summary: null },
    frames: [],
    networkSamples: [],
    console: [],
    pageErrors: [],
    requestFailed: [],
    savedFiles: [],
    steps: [],
    durationMs: null,
    error: null,
    errorDetails: null,
  };

  let browser = null;
  let page = null;

  try {
    console.log("📱 브라우저 실행 중...");
    diag.steps.push("launch");
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
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116 Safari/537.36",
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

    // console logs
    page.on("console", (m) => {
      const s = `[${m.type()}] ${m.text()}`;
      if (diag.console.length < 200) diag.console.push(s);
      console.log("PAGE_CONSOLE:", s);
    });
    page.on("pageerror", (err) => {
      const s = String(err?.message || err);
      diag.pageErrors.push(s);
      console.error("PAGE_ERROR:", s);
    });
    page.on("requestfailed", (r) => {
      diag.requestFailed.push({ url: r.url(), err: r.failure()?.errorText || null });
      console.warn("REQUEST_FAILED:", r.url(), r.failure()?.errorText || null);
    });

    // sample network responses capture (limited)
    page.on("response", async (resp) => {
      try {
        const u = resp.url();
        // 관심 요청 패턴
        if (/review|qna|product|goods|detail|api|graphql|search/i.test(u)) {
          const st = resp.status();
          if (diag.networkSamples.length < 40) {
            const item = { url: u.slice(0, 1000), status: st };
            // try to capture small body snippets for JSON responses
            const ct = resp.headers()["content-type"] || "";
            if (/application\/json|json/i.test(ct)) {
              try {
                const text = await resp.text();
                item.bodySnippet = text.slice(0, 2000);
                // save full JSON response to disk (capped)
                const fname = path.join(OUTDIR, `resp-${Date.now()}.json`);
                try {
                  fs.writeFileSync(fname, text.slice(0, 2_000_000)); // 2MB cap
                  item.saved = fname;
                  diag.savedFiles.push(fname);
                } catch (e) {}
              } catch (e) {
                item.bodySnippet = "<<unreadable json>>";
              }
            } else {
              item.bodySnippet = `content-type:${ct}`;
            }
            diag.networkSamples.push(item);
            console.log("NET_SAMPLE:", item.url, item.status);
          }
        }
      } catch (e) {
        console.warn("response handler err", e?.message || e);
      }
    });

    console.log("🌐 페이지 로딩 중...");
    diag.steps.push("goto");
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    diag.httpStatus = resp ? resp.status() : null;
    console.log("✅ 페이지 로딩 완료, HTTP 상태:", diag.httpStatus);
    
    console.log("⏳ 네트워크 대기 중...");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    diag.finalUrl = page.url();
    console.log("📍 최종 URL:", diag.finalUrl);

    // JavaScript 렌더링 대기
    console.log("⏳ 동적 콘텐츠 렌더링 대기 중...");
    await page.waitForTimeout(3000);

    // read some metas safely
    console.log("📋 메타데이터 추출 중...");
    diag.steps.push("read-metas");
    const safeAttr = async (locator) => {
      try {
        return await page.locator(locator).getAttribute("content");
      } catch {
        return null;
      }
    };
    diag.metas.ogTitle = (await safeAttr('meta[property="og:title"]')) || null;
    diag.metas.ogImage = (await safeAttr('meta[property="og:image"]')) || null;
    diag.metas.price = (await safeAttr('meta[property="product:price:amount"]')) || null;

    diag.product.name = diag.metas.ogTitle || (await page.title().catch(() => null)) || null;
    diag.product.price = diag.metas.price || null;
    diag.product.image = diag.metas.ogImage || null;

    console.log("🔍 iframe 스캔 중...");
    diag.steps.push("scan-frames");
    const frames = page.frames();
    console.log(`📊 총 ${frames.length}개의 iframe 발견`);

    let productFrame = null;
    let productData = null;

    // iframe 내부에서 상품 정보 추출 시도
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const frameUrl = f.url() || "";
      const frameName = f.name() || null;
      
      console.log(`🔍 iframe ${i} 스캔 중:`, frameUrl.slice(0, 100));
      
      const info = { 
        index: i, 
        url: frameUrl.slice(0, 1000), 
        name: frameName, 
        contentSnippet: null, 
        saved: null,
        productData: null
      };
      
      try {
        const c = await f.content();
        info.contentSnippet = c.slice(0, 2000);
        
        // iframe 내부에서 상품 정보 추출 시도
        console.log(`🛍️ iframe ${i}에서 상품 정보 추출 시도 중...`);
        
        const frameProductData = await f.evaluate(() => {
          const result = {
            name: null,
            price: null,
            summary: null,
            image: null
          };
          
          // 상품명 추출 (다양한 셀렉터 시도)
          const nameSelectors = [
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
            '.goods_name'
          ];
          
          for (const selector of nameSelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim()) {
              result.name = element.textContent.trim();
              console.log('상품명 발견:', result.name);
              break;
            }
          }
          
          // 가격 추출
          const priceSelectors = [
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
            '.price_value',
            '.price_text',
            '.price_number',
            '.product_price_text',
            '.price_area .price',
            '.product_price_area .price',
            '.price_area',
            '.product_price_area',
            '.price_value',
            '.price_text',
            '.price_number',
            '.product_price_text',
            '.price_area .price',
            '.product_price_area .price',
            '.price_area',
            '.product_price_area'
          ];
          
          for (const selector of priceSelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim()) {
              result.price = element.textContent.trim();
              console.log('가격 발견:', result.price);
              break;
            }
          }
          
          // 요약 정보 추출
          const summarySelectors = [
            '.product_summary',
            '.goods_summary',
            '.product_description',
            '.goods_description',
            '.product_info',
            '.product_detail',
            '.product_summary_text',
            '.product_description_text',
            '.product_summary',
            '.goods_summary',
            '.product_description',
            '.goods_description',
            '.product_info',
            '.product_detail',
            '.product_summary_text',
            '.product_description_text'
          ];
          
          for (const selector of summarySelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim()) {
              result.summary = element.textContent.trim();
              console.log('요약 발견:', result.summary);
              break;
            }
          }
          
          // 이미지 추출
          const imageSelectors = [
            '.product_image img',
            '.goods_image img',
            '.product_thumb img',
            '.goods_thumb img',
            '.product_main_image img',
            '.goods_main_image img',
            'img[alt*="상품"]',
            'img[alt*="제품"]'
          ];
          
          for (const selector of imageSelectors) {
            const element = document.querySelector(selector);
            if (element && element.src) {
              result.image = element.src;
              console.log('이미지 발견:', result.image);
              break;
            }
          }
          
          return result;
        });
        
        info.productData = frameProductData;
        
        // 상품 정보가 있는 iframe 발견
        if (frameProductData.name || frameProductData.price) {
          console.log(`✅ iframe ${i}에서 상품 정보 발견:`, frameProductData);
          productFrame = f;
          productData = frameProductData;
        }
        
        const fname = path.join(OUTDIR, `frame-${i}-${Date.now()}.html`);
        try {
          fs.writeFileSync(fname, c.slice(0, 2_000_000));
          info.saved = fname;
          diag.savedFiles.push(fname);
        } catch (e) {}
      } catch (e) {
        console.log(`❌ iframe ${i} 읽기 실패:`, e.message);
        info.contentSnippet = "<<cannot read frame content>>";
      }

      diag.frames.push(info);
    }

    // iframe에서 찾은 상품 정보를 메인 결과에 적용
    if (productData) {
      console.log("✅ iframe에서 상품 정보 추출 성공");
      diag.product.name = productData.name || diag.product.name;
      diag.product.price = productData.price || diag.product.price;
      diag.product.summary = productData.summary || diag.product.summary;
      diag.product.image = productData.image || diag.product.image;
    } else {
      console.log("⚠️ iframe에서 상품 정보를 찾지 못함, 메인 페이지에서 추출 시도");
      
      // 메인 페이지에서 상품 정보 추출 시도
      try {
        const mainPageData = await page.evaluate(() => {
          const result = {
            name: null,
            price: null,
            summary: null,
            image: null
          };
          
          // 상품명 추출
          const nameSelectors = [
            'h1', 'h2', 'h3',
            '._1SY6k',
            '[data-testid="product-title"]',
            '.product_title',
            '.productName',
            '.goods_name',
            '.product_name'
          ];
          
          for (const selector of nameSelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim()) {
              result.name = element.textContent.trim();
              break;
            }
          }
          
          // 가격 추출
          const priceSelectors = [
            '.price',
            '.product_price',
            '.goods_price',
            '[data-testid="price"]',
            '.price_value',
            '.price_text'
          ];
          
          for (const selector of priceSelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim()) {
              result.price = element.textContent.trim();
              break;
            }
          }
          
          return result;
        });
        
        diag.product.name = mainPageData.name || diag.product.name;
        diag.product.price = mainPageData.price || diag.product.price;
        diag.product.summary = mainPageData.summary || diag.product.summary;
        diag.product.image = mainPageData.image || diag.product.image;
      } catch (e) {
        console.log("❌ 메인 페이지에서 상품 정보 추출 실패:", e.message);
      }
    }

    // Save page HTML (cap)
    console.log("💾 HTML 및 스크린샷 저장 중...");
    diag.steps.push("save-html-screenshot");
    try {
      const html = await page.content();
      const htmlF = path.join(OUTDIR, `page-${Date.now()}.html`);
      fs.writeFileSync(htmlF, html.slice(0, 2_000_000)); // 2MB cap
      diag.savedFiles.push(htmlF);
      console.log("✅ HTML 저장 완료");
    } catch (e) { 
      console.warn("❌ HTML 저장 실패:", e?.message || e); 
    }

    try {
      const shotF = path.join(OUTDIR, `shot-${Date.now()}.png`);
      await page.screenshot({ path: shotF, fullPage: true }).catch(() => {});
      diag.savedFiles.push(shotF);
      console.log("✅ 스크린샷 저장 완료");
    } catch (e) { 
      console.warn("❌ 스크린샷 저장 실패:", e?.message || e); 
    }

    diag.ok = true;
    diag.steps.push("done");
    diag.durationMs = Date.now() - t0;
    console.log("🎉 크롤링 완료:", diag.durationMs + "ms");
    return res.status(200).json(diag);
  } catch (err) {
    diag.ok = false;
    diag.error = String(err?.message || err);
    diag.errorDetails = {
      message: err?.message || "Unknown error",
      stack: err?.stack || null,
      name: err?.name || "Error"
    };
    diag.steps.push("catch");
    diag.durationMs = Date.now() - t0;
    console.error("❌ EXTRACT ERROR:", err);
    // always respond 200 with diagnostics (no 500) to preserve logs
    return res.status(200).json(diag);
  } finally {
    try { await page?.close(); } catch {}
    try { await browser?.close(); } catch {}
    console.log("🔒 브라우저 종료 완료");
  }
});

// server listen
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Playwright 크롤러 서버 실행 중`);
  console.log(`📍 포트: ${PORT}`);
  console.log(`📁 디버그 디렉토리: ${OUTDIR}`);
  console.log(`🌍 환경: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📦 빌드 경로: ${buildPath}`);
  console.log(`✅ 서버 준비 완료!`);
});