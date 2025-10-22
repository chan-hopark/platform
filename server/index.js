import express from "express";
import cors from "cors";
import { chromium } from "playwright";
import fs from "fs";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

/** 환경 플래그 (Railway Variables에서 DEBUG=true 주면 디버그 확장) */
const DEBUG = String(process.env.DEBUG || "true").toLowerCase() === "true";

/** 선택: 스냅샷 저장 경로 */
const SNAP_DIR = "/app/tmp-snaps";
if (DEBUG) {
  try { fs.mkdirSync(SNAP_DIR, { recursive: true }); } catch {}
}

/** 유틸: 안전한 $eval */
async function $text(pageOrFrame, selector) {
  try {
    await pageOrFrame.waitForSelector(selector, { timeout: 5000 });
    return await pageOrFrame.$eval(selector, el => el.textContent?.trim() || null);
  } catch { return null; }
}
async function $meta(page, prop) {
  try {
    const h = await page.locator(`meta[property="${prop}"]`).getAttribute("content");
    return h || null;
  } catch { return null; }
}

/** /health */
app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

/** 메인 */
app.post("/api/extract", async (req, res) => {
  const t0 = Date.now();
  const { url } = req.body || {};
  if (!url) return res.status(200).json({ ok: false, reason: "NO_URL" });

  let browser, page;
  /** 디버그 수집 객체 (응답으로 그대로 내려줌) */
  const diag = {
    ok: false,
    inputUrl: url,
    finalUrl: null,
    httpStatusHint: null,
    title: null,
    metas: {},
    product: { name: null, price: null, image: null },
    frames: [],
    networkSamples: [],
    console: [],
    pageErrors: [],
    requestFailed: [],
    steps: [],
    durationMs: null,
    snapFiles: [],
  };

  try {
    diag.steps.push("launch");
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116 Safari/537.36",
      locale: "ko-KR",
      timezoneId: "Asia/Seoul",
      extraHTTPHeaders: {
        "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "sec-ch-ua-platform": "Windows",
        "upgrade-insecure-requests": "1",
        referer: "https://search.naver.com/",
      },
    });

    page = await context.newPage();

    // 이벤트 후킹 (디버그)
    page.on("console", (m) => {
      const msg = `[${m.type()}] ${m.text()}`;
      if (diag.console.length < 50) diag.console.push(msg);
      if (DEBUG) console.log("CONSOLE:", msg);
    });
    page.on("pageerror", (err) => {
      diag.pageErrors.push(String(err));
      if (DEBUG) console.log("PAGEERROR:", err);
    });
    page.on("requestfailed", (req) => {
      diag.requestFailed.push({ url: req.url(), err: req.failure()?.errorText });
      if (DEBUG) console.log("REQFAILED:", req.url(), req.failure()?.errorText);
    });

    // 네트워크 샘플 수집(과도 방지)
    page.on("response", async (resp) => {
      try {
        const u = resp.url();
        if (/review|qna|api|graphql|product|goods|detail/i.test(u)) {
          const st = resp.status();
          if (diag.networkSamples.length < 20) {
            diag.networkSamples.push({ url: u.slice(0, 180), status: st });
          }
        }
      } catch {}
    });

    diag.steps.push("goto");
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    diag.httpStatusHint = resp ? resp.status() : null;

    // 네트워크 안정화 대기
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    diag.finalUrl = page.url();

    // 제목/메타 우선 추출 (iframe 영향 없음 → 매우 안정적)
    diag.steps.push("read-meta");
    diag.title = await page.title().catch(() => null);
    diag.metas.ogTitle = await $meta(page, "og:title");
    diag.metas.ogImage = await $meta(page, "og:image");
    diag.metas.priceAmount = await $meta(page, "product:price:amount");

    diag.product.name = diag.metas.ogTitle || diag.title || null;
    diag.product.price = diag.metas.priceAmount || null;
    diag.product.image = diag.metas.ogImage || null;

    // 프레임 조사
    diag.steps.push("scan-frames");
    const frames = page.frames();
    for (const f of frames) {
      const info = {
        url: f.url().slice(0, 200),
        name: f.name() || null,
        title: null,
        reviewCount: null,
        qnaCount: null,
      };
      try {
        // 프레임 타이틀 추정
        info.title = await f.title?.().catch(() => null);
      } catch {}

      // 리뷰/Q&A 카운트 후보 셀렉터들 (필요시 추가)
      const reviewSelCandidates = [
        "button:has-text('리뷰') .count",
        "[data-test='REVIEW_COUNT']",
        ".review_tab_count, .review-count, .count_review",
      ];
      for (const sel of reviewSelCandidates) {
        const v = await $text(f, sel);
        if (v) { info.reviewCount = v; break; }
      }
      const qnaSelCandidates = [
        "button:has-text('문의') .count",
        "[data-test='QNA_COUNT']",
        ".qna_tab_count, .qna-count, .count_qna",
      ];
      for (const sel of qnaSelCandidates) {
        const v = await $text(f, sel);
        if (v) { info.qnaCount = v; break; }
      }

      diag.frames.push(info);
    }

    // 필요시 탭 클릭 시도 (리뷰 탭 → 최신순)
    diag.steps.push("try-click-tabs");
    try {
      const reviewTab =
        page.locator("button:has-text('리뷰'), a:has-text('리뷰'), [role='tab']:has-text('리뷰')");
      if (await reviewTab.count()) {
        await reviewTab.first().click({ trial: true }).catch(() => {});
        await reviewTab.first().click().catch(() => {});
        await page.waitForTimeout(1200);
      }
    } catch {}

    // 스냅샷 저장(디버그 시)
    if (DEBUG) {
      try {
        const snapBase = `${SNAP_DIR}/${Date.now()}`;
        await page.screenshot({ path: `${snapBase}.png`, fullPage: true }).catch(() => {});
        const html = await page.content();
        fs.writeFileSync(`${snapBase}.html`, html.slice(0, 2_000_000)); // 2MB 제한
        diag.snapFiles.push(`${snapBase}.png`, `${snapBase}.html`);
      } catch (e) {
        if (DEBUG) console.log("SNAP_ERR", e);
      }
    }

    // 성공/실패 기준
    diag.ok = true;
    diag.steps.push("done");
    diag.durationMs = Date.now() - t0;

    // 최종 응답 (null-safe)
    return res.status(200).json(diag);
  } catch (err) {
    diag.ok = false;
    diag.steps.push("catch");
    diag.durationMs = Date.now() - t0;
    diag.error = String(err?.message || err);
    if (DEBUG) console.error("FATAL", err);
    // 절대 500 안 보냄 — 디버그를 위해 200으로 상세 전달
    return res.status(200).json(diag);
  } finally {
    try { await page?.close(); } catch {}
    try { await browser?.close(); } catch {}
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on :${PORT} (DEBUG=${DEBUG})`);
});
