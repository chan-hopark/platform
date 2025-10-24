# 네이버 스마트스토어 & 쿠팡 크롤러 배포 가이드

## 🚀 Railway 배포 가이드

### 1. 필수 환경 변수 설정

Railway Variables 탭에서 다음 환경 변수를 설정하세요:

```bash
# 네이버 쿠키 (필수)
NAVER_COOKIE=your_cookie_here

# User-Agent (필수)
NAVER_USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36

# Accept 헤더 (선택사항)
NAVER_ACCEPT=application/json, text/plain, */*

# Accept-Language (선택사항)
NAVER_ACCEPT_LANGUAGE=ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7

# Node.js 환경
NODE_ENV=production
```

### 2. 쿠키 수집 방법

#### 네이버 쿠키 수집:
1. Chrome에서 네이버 스마트스토어 상품 페이지 열기
2. F12 → Network 탭 열기
3. XHR/Fetch 필터 적용
4. `/i/v2/...` 요청 찾기
5. Request Headers의 `Cookie` 전체 문자열 복사
6. Railway Variables의 `NAVER_COOKIE`에 붙여넣기

#### User-Agent 수집:
1. 같은 Network 탭에서
2. Request Headers의 `User-Agent` 값 복사
3. Railway Variables의 `NAVER_USER_AGENT`에 붙여넣기

### 3. 배포 설정

#### Railway.json 설정:
```json
{
  "build": {
    "builder": "DOCKERFILE"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5
  },
  "environments": {
    "production": {
      "variables": {
        "NODE_ENV": "production",
        "NODE_VERSION": "20.0.0"
      }
    }
  }
}
```

#### Dockerfile 설정:
- Node.js 20 기반
- Playwright Chromium 자동 설치
- 필요한 시스템 의존성 포함

### 4. 배포 후 확인사항

#### Health Check:
```bash
curl https://your-app.railway.app/api/health
```

응답 예시:
```json
{
  "status": "ok",
  "timestamp": "2025-01-24T02:00:00.000Z",
  "environment": "production",
  "port": 3000,
  "nodeVersion": "v20.0.0",
  "cookie": {
    "hasCookie": true,
    "cookieLength": 1234,
    "lastUpdate": "2025-01-24T01:30:00.000Z",
    "timeSinceLastUpdate": 30,
    "updateCount": 5,
    "isUpdating": false,
    "lastError": null
  },
  "polyfills": {
    "file": true,
    "blob": true,
    "formData": true
  }
}
```

## 🔧 문제 해결 가이드

### 502 Bad Gateway 에러

#### 원인 1: Node.js 버전 문제
```bash
# 해결: Node.js 20 사용 확인
node --version  # v20.x.x 확인
```

#### 원인 2: undici 모듈 충돌
```bash
# 해결: undici 완전 제거
npm uninstall undici
npm install
```

#### 원인 3: Playwright 브라우저 미설치
```bash
# 해결: Playwright 브라우저 설치
npx playwright install chromium --with-deps
```

#### 원인 4: 포트 바인딩 문제
```javascript
// server/index.js에서 확인
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중`);
});
```

### channelId 추출 실패

#### 원인 1: 쿠키 만료
```bash
# 해결: 쿠키 갱신
# Railway Variables에서 NAVER_COOKIE 업데이트
```

#### 원인 2: User-Agent 차단
```bash
# 해결: 최신 User-Agent 사용
# Chrome DevTools에서 최신 User-Agent 복사
```

#### 원인 3: API 엔드포인트 변경
```bash
# 해결: Network 탭에서 최신 API 경로 확인
# /i/v2/channels/{channelId}/products/{productId} 패턴 확인
```

### 쿠키 자동 갱신 실패

#### 원인 1: 퀴즈/캡챠 감지
```javascript
// 자동 해결 시도 (이미 구현됨)
// 퀴즈 감지 시 자동으로 해결 시도
```

#### 원인 2: 브라우저 실행 실패
```bash
# 해결: Playwright 의존성 재설치
npx playwright install chromium --with-deps
```

## 📊 모니터링

### 로그 확인
```bash
# Railway Deploy Logs에서 확인
- Node.js 버전
- Playwright 설치 상태
- 쿠키 갱신 상태
- API 호출 상태
```

### 성능 지표
- 응답 시간: < 10초
- 메모리 사용량: < 512MB
- 쿠키 갱신 주기: 6시간마다

## 🛠️ 개발 환경 설정

### 로컬 실행
```bash
# 의존성 설치
npm install

# Playwright 브라우저 설치
npx playwright install chromium --with-deps

# 환경 변수 설정
cp env.example .env
# .env 파일에 NAVER_COOKIE, NAVER_USER_AGENT 설정

# 개발 서버 실행
npm run dev
```

### 테스트
```bash
# Health Check
curl http://localhost:3000/api/health

# 데이터 추출 테스트
curl -X POST http://localhost:3000/api/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://smartstore.naver.com/example/products/123456"}'
```

## 🔄 자동화 기능

### 쿠키 자동 갱신
- 주기: 6시간마다
- 퀴즈 자동 해결
- User-Agent 로테이션
- 재시도 로직 (최대 3회)

### 캐싱
- 동일 URL: 60초 캐시
- 메모리 기반 캐시
- 자동 만료

### 에러 처리
- 401/403/429: 자동 쿠키 갱신
- 네트워크 오류: 재시도
- 상세한 디버그 로그

## 📝 API 사용법

### 네이버 스마트스토어
```bash
POST /api/extract
{
  "url": "https://smartstore.naver.com/store/products/123456"
}
```

### 쿠팡
```bash
POST /api/extract
{
  "url": "https://www.coupang.com/vp/products/123456"
}
```

### 응답 형식
```json
{
  "ok": true,
  "vendor": "naver",
  "productId": "123456",
  "channelId": "abc123",
  "product": {
    "name": "상품명",
    "price": 10000,
    "images": ["image1.jpg", "image2.jpg"],
    "description": "상품 설명"
  },
  "reviews": [...],
  "qnas": [...],
  "debug": {
    "steps": [...],
    "endpoints": [...],
    "errors": [...]
  }
}
```

## 🚨 주의사항

1. **쿠키 보안**: NAVER_COOKIE는 민감한 정보이므로 안전하게 관리
2. **Rate Limiting**: 과도한 요청 시 차단될 수 있음
3. **User-Agent**: 정기적으로 업데이트 필요
4. **모니터링**: 정기적으로 Health Check 확인

## 📞 지원

문제가 발생하면:
1. Railway Deploy Logs 확인
2. `/api/health` 엔드포인트 확인
3. 쿠키 및 User-Agent 갱신
4. 필요시 서버 재시작
