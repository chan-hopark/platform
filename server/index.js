// server/index.js - Railway 환경 최적화
import express from 'express';
import cors from 'cors';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(cors());
app.use(express.json());

// API 라우트를 먼저 정의
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// 네이버 스마트스토어 상품 데이터 추출 API
app.post('/api/extract', async (req, res) => {
  let browser = null;
  
  try {
    console.log('🚀 API 요청 시작');
    console.log('📝 요청 본문:', req.body);
    
    const { url } = req.body;
    
    if (!url) {
      console.log('❌ URL 누락');
      return res.status(400).json({ error: 'URL이 필요합니다.' });
    }
    
    if (!url.includes('smartstore.naver.com')) {
      console.log('❌ 잘못된 URL:', url);
      return res.status(400).json({ error: '네이버 스마트스토어 URL만 지원됩니다.' });
    }
    
    console.log('🔍 추출 요청 받음:', url);
    
    // Playwright 브라우저 실행 (Railway 환경 최적화)
    console.log('🌐 Playwright 브라우저 실행 중...');
    browser = await chromium.launch({ 
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--memory-pressure-off',
        '--max_old_space_size=2048',
        '--single-process',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ]
    });
    
    console.log('✅ 브라우저 실행 성공');
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115 Safari/537.36',
      viewport: { width: 1280, height: 720 }
    });
    
    const page = await context.newPage();
    console.log('📄 새 페이지 생성');
    
    // 페이지 로딩 (동적 렌더링 대기)
    console.log('📡 페이지 로딩 중...');
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    console.log('✅ 페이지 로딩 완료');
    
    // JavaScript 렌더링 대기
    console.log('⏳ 동적 콘텐츠 렌더링 대기 중...');
    await page.waitForTimeout(3000);
    
    // 상품 정보 추출
    console.log('🛍️ 상품 정보 추출 중...');
    
    const extractedData = await page.evaluate(() => {
      const result = {
        product: {},
        reviews: [],
        qa: []
      };
      
      // 상품명 추출 (다양한 셀렉터 시도)
      const nameSelectors = [
        'h1',
        'h3._1SY6k',
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
        '.product_title_area h3'
      ];
      
      for (const selector of nameSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          result.product.name = element.textContent.trim();
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
        '.product_price_area'
      ];
      
      for (const selector of priceSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          result.product.price = element.textContent.trim();
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
        '.product_description_text'
      ];
      
      for (const selector of summarySelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          result.product.summary = element.textContent.trim();
          break;
        }
      }
      
      // 페이지 제목도 상품명으로 사용 (백업)
      if (!result.product.name) {
        result.product.name = document.title || '상품명을 찾을 수 없습니다';
      }
      
      return result;
    });
    
    console.log('✅ 데이터 추출 완료:', extractedData);
    
    // 응답 데이터
    const apiResponse = {
      success: true,
      message: '데이터 추출이 완료되었습니다.',
      data: extractedData,
      stats: {
        product: extractedData.product.name ? '추출됨' : '추출 실패',
        reviews: `${extractedData.reviews.length}개`,
        qa: `${extractedData.qa.length}개`
      }
    };
    
    console.log('🎉 추출 완료:', apiResponse.stats);
    res.json(apiResponse);
    
  } catch (error) {
    console.error('❌ API 오류 상세:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    res.status(500).json({ 
      error: '데이터 추출 실패', 
      message: error.message,
      details: error.stack
    });
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log('🔒 브라우저 종료 완료');
      } catch (closeError) {
        console.error('❌ 브라우저 종료 오류:', closeError.message);
      }
    }
  }
});

// 추출된 데이터 조회 API
app.get('/api/data', (req, res) => {
  try {
    const filePath = path.join(process.cwd(), 'data.json');
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '저장된 데이터가 없습니다.' });
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json({ success: true, data });
    
  } catch (error) {
    console.error('❌ 데이터 조회 오류:', error);
    res.status(500).json({ 
      error: '데이터 조회 실패', 
      message: error.message 
    });
  }
});

// 정적 파일 서빙 (프론트엔드)
app.use(express.static(path.join(process.cwd(), 'public')));

// 모든 GET 요청을 index.html로 리다이렉트 (SPA 지원) - API 라우트 제외
app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`📝 사용법: POST /api/extract with body: {"url": "네이버스마트스토어URL"}`);
});