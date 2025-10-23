import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

// 헬스 체크 엔드포인트
app.get("/health", (req, res) => {
  res.json({ success: true, message: "Server is running" });
});

// channelId 추출 함수
async function extractChannelId(productUrl, cookies) {
  const debugLogs = []; // 단계별 로그 저장

  try {
    debugLogs.push("🔍 channelId 추출 시작...");

    // productId 추출
    const productIdMatch = productUrl.match(/products\/(\d+)/);
    if (!productIdMatch) {
      debugLogs.push("❌ productId 추출 실패");
      return { success: false, channelId: null, logs: debugLogs };
    }
    const productId = productIdMatch[1];
    debugLogs.push(`✅ productId 추출 성공: ${productId}`);

    // 1차 시도: API 직접 호출
    const apiUrl = `https://smartstore.naver.com/i/v2/products/${productId}`;
    debugLogs.push(`🔄 1차 시도: API 호출 (${apiUrl})`);

    const headers = {
      accept: "application/json, text/plain, */*",
      "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      "content-type": "application/json",
      cookie: cookies || "",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };

    const response = await fetch(apiUrl, { headers });
    debugLogs.push(`📊 API 응답 상태: ${response.status}`);

    if (response.ok) {
      const data = await response.json();
      debugLogs.push(`📄 API 응답 키들: ${Object.keys(data).join(", ")}`);

      // 다양한 경로에서 channelId 시도
      const candidates = [
        data?.channel?.channelUid,
        data?.channel?.channelNo,
        data?.channel?.id,
      ].filter(Boolean);

      if (candidates.length > 0) {
        debugLogs.push(`✅ API에서 channelId 발견: ${candidates[0]}`);
        return { success: true, channelId: candidates[0], logs: debugLogs };
      }
    } else {
      debugLogs.push("❌ API 호출 실패");
    }

    // 2차 시도: HTML에서 추출
    debugLogs.push("🔄 2차 시도: HTML 파싱");

    const htmlRes = await fetch(productUrl, { headers });
    const html = await htmlRes.text();

    const regexPatterns = [
      /"channelNo":"([^"]+)"/,
      /"channelUid":"([^"]+)"/,
      /"channel":{"id":"([^"]+)"/,
    ];

    for (const regex of regexPatterns) {
      const match = html.match(regex);
      if (match) {
        debugLogs.push(`✅ HTML에서 channelId 발견 (${regex}): ${match[1]}`);
        return { success: true, channelId: match[1], logs: debugLogs };
      }
    }

    // 3차 시도: URL 기반 추출
    debugLogs.push("🔄 3차 시도: URL 파싱");

    const urlMatch = productUrl.match(/channels\/([^/]+)/);
    if (urlMatch) {
      debugLogs.push(`✅ URL에서 channelId 발견: ${urlMatch[1]}`);
      return { success: true, channelId: urlMatch[1], logs: debugLogs };
    }

    debugLogs.push("❌ 모든 방법으로 실패");
    return { success: false, channelId: null, logs: debugLogs };
  } catch (error) {
    debugLogs.push(`❌ 에러 발생: ${error.message}`);
    return { success: false, channelId: null, logs: debugLogs };
  }
}

// API 엔드포인트
app.get("/extract", async (req, res) => {
  const { url } = req.query;
  const cookies = process.env.NAVER_COOKIE;

  if (!url) {
    return res
      .status(400)
      .json({ success: false, message: "❌ url 파라미터가 필요합니다." });
  }

  const result = await extractChannelId(url, cookies);
  res.json(result);
});

// 서버 실행
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
