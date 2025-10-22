// server/index.js
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(cors());
app.use(express.json());

// API 라우트를 먼저 정의
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// 네이버 스마트스토어 상품 데이터 추출 API
app.post('/api/extract', async (req, res) => {
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
    
    // Axios로 HTML 가져오기
    console.log('📡 HTTP 요청 시작...');
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.8,en-US;q=0.5,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 30000
    });
    
    console.log('✅ HTML 응답 받음, 크기:', response.data.length);
    
    // Cheerio로 HTML 파싱
    const $ = cheerio.load(response.data);
    console.log('🔍 HTML 파싱 완료');
    
    // 상품 정보 추출
    const extractedData = {
      product: {},
      reviews: [],
      qa: []
    };
    
    // 상품명 추출
    const nameSelectors = [
      'h1',
      '[data-testid="product-title"]',
      '.product_title',
      '.productName',
      '.goods_name',
      '.product_name',
      '.product_title_text',
      '.product_name_text'
    ];
    
    for (const selector of nameSelectors) {
      const element = $(selector).first();
      if (element.length && element.text().trim()) {
        extractedData.product.name = element.text().trim();
        console.log('✅ 상품명 추출:', extractedData.product.name);
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
      '.product_price_text'
    ];
    
    for (const selector of priceSelectors) {
      const element = $(selector).first();
      if (element.length && element.text().trim()) {
        extractedData.product.price = element.text().trim();
        console.log('✅ 가격 추출:', extractedData.product.price);
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
      '.product_detail'
    ];
    
    for (const selector of summarySelectors) {
      const element = $(selector).first();
      if (element.length && element.text().trim()) {
        extractedData.product.summary = element.text().trim();
        console.log('✅ 요약 추출:', extractedData.product.summary.substring(0, 100) + '...');
        break;
      }
    }
    
    // 페이지 제목도 상품명으로 사용 (백업)
    if (!extractedData.product.name) {
      const title = $('title').text();
      if (title) {
        extractedData.product.name = title;
        console.log('✅ 제목에서 상품명 추출:', title);
      }
    }
    
    console.log('🧪 추출된 데이터:', extractedData);
    
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
      name: error.name,
      code: error.code
    });
    
    res.status(500).json({ 
      error: '데이터 추출 실패', 
      message: error.message,
      details: error.stack
    });
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

// 네이버 스마트스토어 상품 데이터 추출 함수
async function extractNaverSmartStoreData(url) {
  console.log('🚀 네이버 스마트스토어 데이터 추출 시작:', url);
  
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--disable-gpu',
      '--memory-pressure-off',
      '--max_old_space_size=4096'
    ]
  });
  
  const page = await browser.newPage();
  
  // User-Agent 설정
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  // 뷰포트 설정
  await page.setViewport({ width: 1920, height: 1080 });
  
  const result = {
    product: {},
    reviews: [],
    qa: []
  };
  
  try {
    console.log('📄 페이지 로딩 중...');
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    
    // 상품 기본 정보 추출
    console.log('🛍️ 상품 정보 추출 중...');
    try {
      await page.waitForSelector('h1, [data-testid="product-title"], .product_title', { timeout: 10000 });
      
      result.product = await page.evaluate(() => {
        const product = {};
        
        // 상품명 추출
        const nameSelectors = [
          'h1',
          '[data-testid="product-title"]',
          '.product_title',
          '.productName',
          '.goods_name'
        ];
        
        for (const selector of nameSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent.trim()) {
            product.name = element.textContent.trim();
            break;
          }
        }
        
        // 가격 추출
        const priceSelectors = [
          '.price',
          '.product_price',
          '.goods_price',
          '[data-testid="price"]',
          '.price_value'
        ];
        
        for (const selector of priceSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent.trim()) {
            product.price = element.textContent.trim();
            break;
          }
        }
        
        // 요약 정보 추출
        const summarySelectors = [
          '.product_summary',
          '.goods_summary',
          '.product_description',
          '.goods_description'
        ];
        
        for (const selector of summarySelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent.trim()) {
            product.summary = element.textContent.trim();
            break;
          }
        }
        
        return product;
      });
      
      console.log('✅ 상품 정보 추출 완료:', result.product);
    } catch (error) {
      console.log('⚠️ 상품 정보 추출 실패:', error.message);
    }
    
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
        'a:contains("리뷰")'
      ];
      
      let reviewTabClicked = false;
      for (const selector of reviewTabSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 3000 });
          await page.click(selector);
          reviewTabClicked = true;
          console.log('✅ 리뷰 탭 클릭 성공');
          break;
        } catch (e) {
          continue;
        }
      }
      
      if (reviewTabClicked) {
        await page.waitForTimeout(2000);
        
        // 정렬 기준을 '최신순'으로 변경
        try {
          const sortSelectors = [
            'select[name="sort"]',
            '.sort_select',
            '.review_sort',
            'select:contains("최신순")'
          ];
          
          for (const selector of sortSelectors) {
            try {
              await page.waitForSelector(selector, { timeout: 3000 });
              await page.select(selector, 'latest');
              console.log('✅ 리뷰 정렬을 최신순으로 변경');
              break;
            } catch (e) {
              continue;
            }
          }
        } catch (error) {
          console.log('⚠️ 리뷰 정렬 변경 실패:', error.message);
        }
        
        // 리뷰 스크롤하여 더 많은 리뷰 로드
        console.log('📜 리뷰 스크롤하여 추가 로드 중...');
        for (let i = 0; i < 5; i++) {
          await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
          });
          await page.waitForTimeout(1000);
        }
        
        // 리뷰 데이터 추출
        result.reviews = await page.evaluate(() => {
          const reviews = [];
          const reviewSelectors = [
            '.review_item',
            '.review_list li',
            '.review_content',
            '[data-testid="review"]'
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
          
          return reviews;
        });
        
        console.log(`✅ 리뷰 ${result.reviews.length}개 추출 완료`);
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
        'a:contains("문의")'
      ];
      
      let qaTabClicked = false;
      for (const selector of qaTabSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 3000 });
          await page.click(selector);
          qaTabClicked = true;
          console.log('✅ Q&A 탭 클릭 성공');
          break;
        } catch (e) {
          continue;
        }
      }
      
      if (qaTabClicked) {
        await page.waitForTimeout(2000);
        
        // Q&A 데이터 추출
        result.qa = await page.evaluate(() => {
          const qaList = [];
          const qaSelectors = [
            '.qa_item',
            '.qa_list li',
            '.qa_content',
            '[data-testid="qa"]'
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
          
          return qaList;
        });
        
        console.log(`✅ Q&A ${result.qa.length}개 추출 완료`);
      }
    } catch (error) {
      console.log('⚠️ Q&A 데이터 추출 실패:', error.message);
    }
    
  } catch (error) {
    console.error('❌ 데이터 추출 중 오류 발생:', error);
    throw error;
  } finally {
    await browser.close();
  }
  
  return result;
}

// JSON 파일 저장 함수
function saveDataToFile(data, filename = 'data.json') {
  try {
    const filePath = path.join(process.cwd(), filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`💾 데이터가 ${filename} 파일에 저장되었습니다.`);
    return filePath;
  } catch (error) {
    console.error('❌ 파일 저장 실패:', error);
    throw error;
  }
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`📝 사용법: POST /api/extract with body: {"url": "네이버스마트스토어URL"}`);
});