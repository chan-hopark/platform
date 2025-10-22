// crawlSmartStore.js
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

async function scrapeSmartStore(url) {
  let browser = null;
  
  try {
    console.log('🚀 네이버 스마트스토어 크롤링 시작:', url);
    
    // Playwright 브라우저 실행 (Railway 환경 최적화)
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
    
    // 상세페이지 캡처 (디버깅용)
    try {
      await page.screenshot({ 
        path: "smartstore_detail.png", 
        fullPage: true 
      });
      console.log('📸 스크린샷 저장 완료');
    } catch (screenshotError) {
      console.log('⚠️ 스크린샷 저장 실패:', screenshotError.message);
    }
    
    // HTML 저장 (디버깅용)
    try {
      const html = await page.content();
      fs.writeFileSync("smartstore.html", html);
      console.log('💾 HTML 저장 완료');
    } catch (htmlError) {
      console.log('⚠️ HTML 저장 실패:', htmlError.message);
    }
    
    return extractedData;
    
  } catch (error) {
    console.error('❌ 크롤링 오류:', error);
    throw error;
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
}

// 테스트 실행
if (import.meta.url === `file://${process.argv[1]}`) {
  const testUrl = "https://smartstore.naver.com/miliving/products/10037442277";
  scrapeSmartStore(testUrl)
    .then(result => {
      console.log('🎉 크롤링 결과:', result);
    })
    .catch(error => {
      console.error('❌ 크롤링 실패:', error);
    });
}

export default scrapeSmartStore;
