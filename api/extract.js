// api/extract.js - Vercel 서버리스 함수 (Cheerio + Node-fetch 사용)
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import fs from 'fs';

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

  try {
    const result = {
      product: {},
      reviews: [],
      qa: []
    };

    // 1. 페이지 HTML 가져오기
    console.log('📄 페이지 로딩 중...');
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.8,en-US;q=0.5,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // 2. 상품 기본 정보 추출
    console.log('🛍️ 상품 정보 추출 중...');
    try {
      // 상품명 추출
      const nameSelectors = [
        'h1',
        '[data-testid="product-title"]',
        '.product_title',
        '.productName',
        '.prd_name',
        '.product_name',
        '.goods_name'
      ];
      
      for (const selector of nameSelectors) {
        const element = $(selector).first();
        if (element.length && element.text().trim()) {
          result.product.name = element.text().trim();
          break;
        }
      }

      // 가격 추출
      const priceSelectors = [
        '.price',
        '.product_price',
        '[data-testid="price"]',
        '.prd_price',
        '.sale_price',
        '.goods_price',
        '.price_value'
      ];
      
      for (const selector of priceSelectors) {
        const element = $(selector).first();
        if (element.length && element.text().trim()) {
          result.product.price = element.text().trim();
          break;
        }
      }

      // 요약 설명 추출
      const summarySelectors = [
        '.product_summary',
        '.prd_summary',
        '.product_description',
        '.prd_description',
        '.goods_summary',
        '.product_info'
      ];
      
      for (const selector of summarySelectors) {
        const element = $(selector).first();
        if (element.length && element.text().trim()) {
          result.product.summary = element.text().trim();
          break;
        }
      }

      console.log('✅ 상품 정보 추출 완료:', result.product.name);
    } catch (error) {
      console.log('⚠️ 상품 정보 추출 실패:', error.message);
    }

    // 3. 리뷰 데이터 추출 (페이지에 있는 리뷰들)
    console.log('📝 리뷰 데이터 추출 중...');
    try {
      const reviewSelectors = [
        '.review_item',
        '.review-list-item',
        '[data-testid*="review"]',
        '.review',
        '.review_list .item'
      ];

      for (const selector of reviewSelectors) {
        $(selector).each((i, element) => {
          try {
            const $review = $(element);
            const author = $review.find('.review_author, .author, .reviewer_name, .user_name').text().trim();
            const rating = $review.find('.rating, .star_rating, .review_rating, .score').text().trim();
            const date = $review.find('.review_date, .date, .review_time, .created_at').text().trim();
            const content = $review.find('.review_content, .content, .review_text, .comment').text().trim();
            
            if (author || content) {
              result.reviews.push({ author, rating, date, content });
            }
          } catch (e) {
            // 개별 리뷰 추출 실패는 무시
          }
        });
      }

      console.log(`✅ 리뷰 ${result.reviews.length}개 추출 완료`);
    } catch (error) {
      console.log('⚠️ 리뷰 추출 실패:', error.message);
    }

    // 4. Q&A 데이터 추출 (페이지에 있는 Q&A들)
    console.log('❓ Q&A 데이터 추출 중...');
    try {
      const qaSelectors = [
        '.qa_item',
        '.qa-list-item',
        '[data-testid*="qa"]',
        '.qa',
        '.question_answer'
      ];

      for (const selector of qaSelectors) {
        $(selector).each((i, element) => {
          try {
            const $qa = $(element);
            const question = $qa.find('.question, .qa_question, .q_text, .q_title').text().trim();
            const answer = $qa.find('.answer, .qa_answer, .a_text, .a_content').text().trim();
            
            if (question) {
              result.qa.push({ question, answer });
            }
          } catch (e) {
            // 개별 Q&A 추출 실패는 무시
          }
        });
      }

      console.log(`✅ Q&A ${result.qa.length}개 추출 완료`);
    } catch (error) {
      console.log('⚠️ Q&A 추출 실패:', error.message);
    }

    // 5. JSON 파일로 저장 (Vercel에서는 /tmp 디렉토리 사용)
    const jsonData = JSON.stringify(result, null, 2);
    const filePath = '/tmp/data.json';
    
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
  }
}