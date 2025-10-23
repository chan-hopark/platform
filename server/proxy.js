// proxy.js - Railway에서 네이버 접근을 위한 프록시 서버
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import cors from "cors";

const app = express();
app.use(cors());

// 네이버 스마트스토어 프록시 설정
app.use('/naver', createProxyMiddleware({
  target: 'https://smartstore.naver.com',
  changeOrigin: true,
  pathRewrite: {
    '^/naver': ''
  },
  onProxyReq: (proxyReq, req, res) => {
    // 원본 요청의 헤더 유지
    if (req.headers.cookie) {
      proxyReq.setHeader('cookie', req.headers.cookie);
    }
    if (req.headers['user-agent']) {
      proxyReq.setHeader('user-agent', req.headers['user-agent']);
    }
    if (req.headers['accept-language']) {
      proxyReq.setHeader('accept-language', req.headers['accept-language']);
    }
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Proxy error', message: err.message });
  }
}));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🔄 Proxy server running on port ${PORT}`);
});
