// puppeteer-crawler.js - Railway에서 Puppeteer를 사용한 크롤링
import puppeteer from 'puppeteer';

export async function crawlWithPuppeteer(url) {
  let browser = null;
  
  try {
    console.log("🤖 Puppeteer로 크롤링 시작...");
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ]
    });
    
    const page = await browser.newPage();
    
    // User-Agent 설정
    await page.setUserAgent(process.env.NAVER_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // 쿠키 설정
    if (process.env.NAVER_COOKIE) {
      const cookies = process.env.NAVER_COOKIE.split(';').map(cookie => {
        const [name, value] = cookie.trim().split('=');
        return { name, value, domain: '.naver.com' };
      });
      await page.setCookie(...cookies);
    }
    
    // 페이지 로드
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // 데이터 추출
    const data = await page.evaluate(() => {
      // 여기에 데이터 추출 로직
      return {
        title: document.title,
        url: window.location.href
      };
    });
    
    return data;
    
  } catch (error) {
    console.error("Puppeteer 크롤링 오류:", error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
