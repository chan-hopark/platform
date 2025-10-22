import express from "express";
import cors from "cors";
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// 프론트엔드 정적 파일 서빙
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "frontend", "build")));
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "build", "index.html"));
});

// health check
app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// 안전한 $eval
async function $text(frame, selector) {
  try {
    await frame.waitForSelector(selector, { timeout: 3000 });
    return await frame.$eval(selector, (el) => el.textContent.trim());
  } catch {
    return null;
  }
}

// 크롤링 API
app.post("/api/extract", async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(200).json({ ok: false, reason: "NO_URL" });

  let browser, page;
  const diag = {
    ok: false,
    inputUrl: url,
    finalUrl: null,
    httpStatus: null,
    product: { name: null, price: null, image: null },
    reviews: null,
    qna: null,
    frames: [],
    errors: []
  };

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116 Safari/537.36",
      locale: "ko-KR",
      timezoneId: "Asia/Seoul"
    });
    page = await context.newPage();

    const resp = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });
    diag.httpStatus = resp ? resp.status() : null;
    diag.finalUrl = page.url();

    // 메타태그 기반 추출
    diag.product.name =
      (await page
        .locator('meta[property="og:title"]')
        .getAttribute("content")
        .catch(() => null)) || null;
    diag.product.price =
      (await page
        .locator('meta[property="product:price:amount"]')
        .getAttribute("content")
        .catch(() => null)) || null;
    diag.product.image =
      (await page
        .locator('meta[property="og:image"]')
        .getAttribute("content")
        .catch(() => null)) || null;

    // 프레임 탐지 및 리뷰/Q&A 추출
    for (const f of page.frames()) {
      diag.frames.push({ url: f.url().slice(0, 150), name: f.name() });

      if (f.url().includes("review")) {
        diag.reviews =
          (await $text(f, ".review_tab_count")) ||
          (await $text(f, ".review-count")) ||
          (await $text(f, ".count_review"));
      }

      if (f.url().includes("qna")) {
        diag.qna =
          (await $text(f, ".qna_tab_count")) ||
          (await $text(f, ".qna-count")) ||
          (await $text(f, ".count_qna"));
      }
    }

    diag.ok = true;
    return res.json(diag);
  } catch (err) {
    diag.ok = false;
    diag.errors.push(err.message);
    return res.json(diag);
  } finally {
    try {
      await page?.close();
    } catch {}
    try {
      await browser?.close();
    } catch {}
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on :${PORT}`);
});
