// api/extract.js - Railway용 Puppeteer 기반 API
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  console.log('🚀 네이버 스마트스토어 데이터 추출 시작:', url);

  let browser;
  try {
    // Puppeteer 브라우저 실행 (Railway Pro 환경에 최적화)
    browser = await puppeteer.launch({
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

    // 1. 페이지 로딩
    console.log('📄 페이지 로딩 중...');
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

    // 2. 상품 기본 정보 추출
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

    // 3. 리뷰 데이터 추출
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
        
        // 리뷰 스크롤하여 더 많은 리뷰 로드
        console.log('📜 리뷰 스크롤하여 추가 로드 중...');
        for (let i = 0; i < 3; i++) {
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

    // 4. Q&A 데이터 추출
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

    // 5. JSON 파일로 저장
    const jsonData = JSON.stringify(result, null, 2);
    const filePath = path.join(process.cwd(), 'data.json');
    
    try {
      fs.writeFileSync(filePath, jsonData, 'utf8');
      console.log('💾 JSON 파일 저장 완료');
    } catch (error) {
      console.log('⚠️ JSON 파일 저장 실패:', error.message);
    }

    console.log('🎉 데이터 추출 완료!');
    return res.status(200).json({
      success: true,
      message: '데이터 추출 완료',
      data: result,
      stats: {
        product: result.product.name ? '추출됨' : '실패',
        reviews: `${result.reviews.length}개`,
        qa: `${result.qa.length}개`
      }
    });

  } catch (error) {
    console.error('❌ 크롤링 중 오류 발생:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}