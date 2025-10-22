// server/index.js - Railway 환경 최적화 네이버 스마트스토어 크롤러
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
      return res.status(400).json({ 
        success: false,
        error: 'URL이 필요합니다.' 
      });
    }
    
    if (!url.includes('smartstore.naver.com')) {
      console.log('❌ 잘못된 URL:', url);
      return res.status(400).json({ 
        success: false,
        error: '네이버 스마트스토어 URL만 지원됩니다.' 
      });
    }
    
    console.log('🔍 추출 요청 받음:', url);
    
    // Railway 환경 최적화된 Playwright 브라우저 실행
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
        '--single-process'
      ]
    });
    
    console.log('✅ 브라우저 실행 성공');
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul'
    });
    
    const page = await context.newPage();
    console.log('📄 새 페이지 생성');
    
    // 봇 탐지 우회 설정
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });
    
    // 페이지 로딩
    console.log('📡 페이지 로딩 중...');
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    console.log('✅ 페이지 로딩 완료');
    
    // 상품 정보가 로딩될 때까지 대기
    console.log('⏳ 상품 정보 로딩 대기 중...');
    try {
      // 네이버 스마트스토어 실제 셀렉터들로 대기
      await page.waitForSelector('h3, h1, [data-testid="product-title"], .product_title', { timeout: 15000 });
      console.log('✅ 상품 정보 로딩 완료');
    } catch (error) {
      console.log('⚠️ 상품 정보 로딩 대기 실패, 계속 진행');
    }
    
    // 추가 대기 시간
    await page.waitForTimeout(3000);
    
    // 상품 정보 추출
    console.log('🛍️ 상품 정보 추출 중...');
    
    const extractedData = await page.evaluate(() => {
      const result = {
        product: {
          name: '',
          price: '',
          summary: ''
        },
        reviews: [],
        qa: [],
        stats: {
          reviewCount: 0,
          qaCount: 0
        }
      };
      
      // 상품명 추출 (네이버 스마트스토어 실제 셀렉터들)
      const nameSelectors = [
        'h3._1SY6k',  // 네이버 메인 상품명 셀렉터
        'h1._2XqUq',  // 네이버 대체 상품명 셀렉터
        'h1',
        'h3',
        '[data-testid="product-title"]',
        '.product_title',
        '.productName',
        '.goods_name',
        '.product_name',
        '.product_title_text',
        '.product_name_text'
      ];
      
      for (const selector of nameSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          result.product.name = element.textContent.trim();
          break;
        }
      }
      
      // 가격 추출 (네이버 스마트스토어 실제 셀렉터들)
      const priceSelectors = [
        '._1LY7DqC',  // 네이버 메인 가격 셀렉터
        '._2XqUq',    // 네이버 대체 가격 셀렉터
        '.price',
        '.product_price',
        '.goods_price',
        '[data-testid="price"]',
        '.price_value',
        '.price_text',
        '.price_number',
        '.product_price_text',
        '.price_area .price',
        '.product_price_area .price'
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
    
    console.log('✅ 기본 상품 정보 추출 완료:', extractedData);
    
    // 리뷰 탭 클릭 및 데이터 추출
    console.log('⭐ 리뷰 데이터 추출 중...');
    try {
      // 리뷰 탭 찾기 및 클릭
      const reviewTabSelectors = [
        'a[href*="review"]',
        'button[data-tab="review"]',
        '.tab_review',
        '.review_tab',
        'li:contains("리뷰")',
        'a:contains("리뷰")',
        '[data-testid="review-tab"]'
      ];
      
      let reviewTabClicked = false;
      for (const selector of reviewTabSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await element.click();
            reviewTabClicked = true;
            console.log('✅ 리뷰 탭 클릭 성공');
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (reviewTabClicked) {
        await page.waitForTimeout(2000);
        
        // 리뷰 개수 및 데이터 추출
        const reviewData = await page.evaluate(() => {
          const reviews = [];
          const reviewSelectors = [
            '.review_item',
            '.review_list li',
            '.review_content',
            '[data-testid="review"]',
            '.review_list .review_item'
          ];
          
          let reviewElements = [];
          for (const selector of reviewSelectors) {
            reviewElements = document.querySelectorAll(selector);
            if (reviewElements.length > 0) break;
          }
          
          reviewElements.forEach(element => {
            try {
              const author = element.querySelector('.review_author, .author, .reviewer')?.textContent?.trim() || '';
              const rating = element.querySelector('.rating, .star_rating, .review_rating')?.textContent?.trim() || '';
              const date = element.querySelector('.review_date, .date, .review_time')?.textContent?.trim() || '';
              const content = element.querySelector('.review_content, .content, .review_text')?.textContent?.trim() || '';
              
              if (content) {
                reviews.push({ author, rating, date, content });
              }
            } catch (e) {
              // 개별 리뷰 추출 실패 시 무시
            }
          });
          
          return {
            reviews,
            count: reviews.length
          };
        });
        
        extractedData.reviews = reviewData.reviews;
        extractedData.stats.reviewCount = reviewData.count;
        console.log(`✅ 리뷰 ${reviewData.count}개 추출 완료`);
      }
    } catch (error) {
      console.log('⚠️ 리뷰 데이터 추출 실패:', error.message);
    }
    
    // Q&A 탭 클릭 및 데이터 추출
    console.log('❓ Q&A 데이터 추출 중...');
    try {
      // Q&A 탭 찾기 및 클릭
      const qaTabSelectors = [
        'a[href*="qa"]',
        'button[data-tab="qa"]',
        '.tab_qa',
        '.qa_tab',
        'li:contains("Q&A")',
        'a:contains("Q&A")',
        'a:contains("문의")',
        '[data-testid="qa-tab"]'
      ];
      
      let qaTabClicked = false;
      for (const selector of qaTabSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await element.click();
            qaTabClicked = true;
            console.log('✅ Q&A 탭 클릭 성공');
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (qaTabClicked) {
        await page.waitForTimeout(2000);
        
        // Q&A 데이터 추출
        const qaData = await page.evaluate(() => {
          const qaList = [];
          const qaSelectors = [
            '.qa_item',
            '.qa_list li',
            '.qa_content',
            '[data-testid="qa"]',
            '.qa_list .qa_item'
          ];
          
          let qaElements = [];
          for (const selector of qaSelectors) {
            qaElements = document.querySelectorAll(selector);
            if (qaElements.length > 0) break;
          }
          
          qaElements.forEach(element => {
            try {
              const question = element.querySelector('.question, .qa_question, .q_text')?.textContent?.trim() || '';
              const answer = element.querySelector('.answer, .qa_answer, .a_text')?.textContent?.trim() || '';
              
              if (question) {
                qaList.push({ question, answer });
              }
            } catch (e) {
              // 개별 Q&A 추출 실패 시 무시
            }
          });
          
          return {
            qa: qaList,
            count: qaList.length
          };
        });
        
        extractedData.qa = qaData.qa;
        extractedData.stats.qaCount = qaData.count;
        console.log(`✅ Q&A ${qaData.count}개 추출 완료`);
      }
    } catch (error) {
      console.log('⚠️ Q&A 데이터 추출 실패:', error.message);
    }
    
    console.log('🧪 최종 추출된 데이터:', extractedData);
    
    // 응답 데이터
    const apiResponse = {
      success: true,
      message: '데이터 추출이 완료되었습니다.',
      data: extractedData,
      stats: {
        product: extractedData.product.name ? '추출됨' : '추출 실패',
        reviews: `${extractedData.stats.reviewCount}개`,
        qa: `${extractedData.stats.qaCount}개`
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
      success: false,
      error: '데이터 추출 실패',
      details: error.message
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
      return res.status(404).json({ 
        success: false,
        error: '저장된 데이터가 없습니다.' 
      });
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json({ success: true, data });
    
  } catch (error) {
    console.error('❌ 데이터 조회 오류:', error);
    res.status(500).json({ 
      success: false,
      error: '데이터 조회 실패',
      details: error.message 
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