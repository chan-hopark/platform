// server/index.js - Railway 환경 최적화 네이버 스마트스토어 크롤러 (Meta 태그 + iframe 처리)
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
    
    // 추가 대기 시간 (동적 콘텐츠 로딩)
    await page.waitForTimeout(3000);
    
    // 기본 응답 구조 초기화
    const extractedData = {
      product: {
        name: null,
        price: null,
        summary: null,
        thumbnail: null
      },
      reviews: [],
      qa: [],
      stats: {
        reviewCount: 0,
        qaCount: 0
      }
    };
    
    // 1. Meta 태그 기반 상품 정보 추출
    console.log('🛍️ Meta 태그 기반 상품 정보 추출 중...');
    try {
      const metaData = await page.evaluate(() => {
        const result = {
          name: null,
          price: null,
          summary: null,
          thumbnail: null
        };
        
        // 상품명: meta[property="og:title"]
        const titleMeta = document.querySelector('meta[property="og:title"]');
        if (titleMeta) {
          result.name = titleMeta.getAttribute('content') || null;
        }
        
        // 가격: meta[property="product:price:amount"]
        const priceMeta = document.querySelector('meta[property="product:price:amount"]');
        if (priceMeta) {
          result.price = priceMeta.getAttribute('content') || null;
        }
        
        // 썸네일: meta[property="og:image"]
        const imageMeta = document.querySelector('meta[property="og:image"]');
        if (imageMeta) {
          result.thumbnail = imageMeta.getAttribute('content') || null;
        }
        
        // 요약: meta[property="og:description"]
        const descMeta = document.querySelector('meta[property="og:description"]');
        if (descMeta) {
          result.summary = descMeta.getAttribute('content') || null;
        }
        
        // 백업: 페이지 제목
        if (!result.name) {
          result.name = document.title || null;
        }
        
        return result;
      });
      
      extractedData.product = metaData;
      console.log('✅ Meta 태그 기반 상품 정보 추출 완료:', metaData);
      
    } catch (error) {
      console.log('⚠️ Meta 태그 추출 실패:', error.message);
    }
    
    // 2. iframe 처리로 리뷰 데이터 추출
    console.log('⭐ iframe 기반 리뷰 데이터 추출 중...');
    try {
      // 모든 iframe 확인
      const frames = page.frames();
      console.log(`📋 총 ${frames.length}개의 iframe 발견`);
      
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        try {
          console.log(`🔍 iframe ${i} 확인 중...`);
          
          // iframe 내부에서 리뷰 관련 셀렉터 찾기
          const reviewData = await frame.evaluate(() => {
            const reviews = [];
            const reviewSelectors = [
              '.review_item',
              '.review_list li',
              '.review_content',
              '[data-testid="review"]',
              '.review_list .review_item',
              '.review_item_list li',
              '.review_list_item'
            ];
            
            let reviewElements = [];
            for (const selector of reviewSelectors) {
              reviewElements = document.querySelectorAll(selector);
              if (reviewElements.length > 0) {
                console.log(`리뷰 셀렉터 발견: ${selector} (${reviewElements.length}개)`);
                break;
              }
            }
            
            reviewElements.forEach(element => {
              try {
                const author = element.querySelector('.review_author, .author, .reviewer, .user_name')?.textContent?.trim() || '';
                const rating = element.querySelector('.rating, .star_rating, .review_rating, .score')?.textContent?.trim() || '';
                const date = element.querySelector('.review_date, .date, .review_time, .created_at')?.textContent?.trim() || '';
                const content = element.querySelector('.review_content, .content, .review_text, .review_comment')?.textContent?.trim() || '';
                
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
          
          if (reviewData.reviews.length > 0) {
            extractedData.reviews = reviewData.reviews;
            extractedData.stats.reviewCount = reviewData.count;
            console.log(`✅ iframe ${i}에서 리뷰 ${reviewData.count}개 추출 완료`);
            break; // 리뷰를 찾았으면 중단
          }
          
        } catch (frameError) {
          console.log(`⚠️ iframe ${i} 처리 실패:`, frameError.message);
          continue;
        }
      }
      
      if (extractedData.stats.reviewCount === 0) {
        console.log('⚠️ 리뷰 데이터를 찾을 수 없습니다');
      }
      
    } catch (error) {
      console.log('⚠️ 리뷰 데이터 추출 실패:', error.message);
    }
    
    // 3. iframe 처리로 Q&A 데이터 추출
    console.log('❓ iframe 기반 Q&A 데이터 추출 중...');
    try {
      // 모든 iframe 확인
      const frames = page.frames();
      
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        try {
          console.log(`🔍 iframe ${i} Q&A 확인 중...`);
          
          // iframe 내부에서 Q&A 관련 셀렉터 찾기
          const qaData = await frame.evaluate(() => {
            const qaList = [];
            const qaSelectors = [
              '.qa_item',
              '.qa_list li',
              '.qa_content',
              '[data-testid="qa"]',
              '.qa_list .qa_item',
              '.qa_item_list li',
              '.qa_list_item'
            ];
            
            let qaElements = [];
            for (const selector of qaSelectors) {
              qaElements = document.querySelectorAll(selector);
              if (qaElements.length > 0) {
                console.log(`Q&A 셀렉터 발견: ${selector} (${qaElements.length}개)`);
                break;
              }
            }
            
            qaElements.forEach(element => {
              try {
                const question = element.querySelector('.question, .qa_question, .q_text, .qa_q')?.textContent?.trim() || '';
                const answer = element.querySelector('.answer, .qa_answer, .a_text, .qa_a')?.textContent?.trim() || '';
                
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
          
          if (qaData.qa.length > 0) {
            extractedData.qa = qaData.qa;
            extractedData.stats.qaCount = qaData.count;
            console.log(`✅ iframe ${i}에서 Q&A ${qaData.count}개 추출 완료`);
            break; // Q&A를 찾았으면 중단
          }
          
        } catch (frameError) {
          console.log(`⚠️ iframe ${i} Q&A 처리 실패:`, frameError.message);
          continue;
        }
      }
      
      if (extractedData.stats.qaCount === 0) {
        console.log('⚠️ Q&A 데이터를 찾을 수 없습니다');
      }
      
    } catch (error) {
      console.log('⚠️ Q&A 데이터 추출 실패:', error.message);
    }
    
    console.log('🧪 최종 추출된 데이터:', extractedData);
    
    // 성공 응답 (데이터가 없어도 200 응답)
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
    
    // 에러가 발생해도 200 응답으로 JSON 반환
    res.json({ 
      success: false,
      error: '데이터 추출 실패',
      details: error.message,
      data: {
        product: { name: null, price: null, summary: null, thumbnail: null },
        reviews: [],
        qa: [],
        stats: { reviewCount: 0, qaCount: 0 }
      }
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