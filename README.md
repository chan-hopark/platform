# 네이버 스마트스토어 크롤러

네이버 스마트스토어 상품 정보를 추출하는 웹 크롤러입니다. 상품 상세 정보, 리뷰, Q&A를 자동으로 수집합니다.

## 🚀 주요 기능

- **상품 정보 추출**: 상품명, 가격, 브랜드, 카테고리, 상세 설명
- **리뷰 수집**: 최신 리뷰 20개 자동 수집
- **Q&A 수집**: 최신 Q&A 20개 자동 수집
- **실시간 디버깅**: API 호출 상태 및 오류 정보 표시
- **캐시 시스템**: 60초 메모리 캐시로 성능 최적화

## 🛠️ 기술 스택

- **Backend**: Node.js, Express.js, Axios
- **Frontend**: React, Vite, Tailwind CSS
- **Deployment**: Railway

## 📋 사전 요구사항

- Node.js 18+
- npm 또는 yarn

## 🔧 설치 및 설정

### 1. 저장소 클론 및 의존성 설치

```bash
git clone <repository-url>
cd platform
npm install
```

### 2. 환경변수 설정

`.env` 파일을 생성하고 다음 변수들을 설정하세요:

```bash
# 네이버 쿠키 (필수)
NAVER_COOKIE=NNB=PYTKL72IWVAGQ; NID_AUT=...; NID_SES=...; (실제 쿠키 값)

# 네이버 User-Agent
NAVER_USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36

# 네이버 Accept 헤더
NAVER_ACCEPT=application/json, text/plain, */*

# 서버 설정
PORT=3000
NODE_ENV=development
```

### 3. 쿠키 수집 방법

#### Chrome DevTools를 사용한 쿠키 수집:

1. **네이버 스마트스토어 상품 페이지 열기**
   ```
   https://smartstore.naver.com/브랜드명/products/상품번호
   ```

2. **F12 키를 눌러 개발자 도구 열기**

3. **Network 탭으로 이동**

4. **XHR/Fetch 필터 선택**

5. **페이지 새로고침 (F5)**

6. **`/i/v2/...` 요청 찾기**
   - `channels/{channelId}/products/{productId}` 형태의 요청을 찾으세요

7. **Request Headers에서 Cookie 복사**
   ```
   Cookie: NNB=PYTKL72IWVAGQ; NID_AUT=...; NID_SES=...; (전체 문자열)
   ```

8. **User-Agent도 복사**
   ```
   User-Agent: Mozia/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...
   ```

9. **`.env` 파일에 붙여넣기**
   ```bash
   NAVER_COOKIE=복사한_쿠키_전체_문자열
   NAVER_USER_AGENT=복사한_User-Agent
   ```

### 4. 개발 서버 실행

```bash
# 프론트엔드 빌드
npm run build

# 개발 서버 실행
npm run dev
```

서버가 `http://localhost:3000`에서 실행됩니다.

## 🚀 Railway 배포

### 1. Railway 프로젝트 생성

1. [Railway](https://railway.app)에 로그인
2. "New Project" 클릭
3. "Deploy from GitHub repo" 선택
4. 저장소 연결

### 2. 환경변수 설정

Railway 대시보드에서 다음 환경변수들을 설정하세요:

```
NAVER_COOKIE=실제_쿠키_값
NAVER_USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36
NAVER_ACCEPT=application/json, text/plain, */*
NODE_ENV=production
```

### 3. 자동 배포

GitHub에 푸시하면 자동으로 배포됩니다.

## 📖 사용법

### 웹 인터페이스 사용

1. 브라우저에서 `http://localhost:3000` 접속
2. 네이버 스마트스토어 상품 URL 입력
3. "데이터 추출 시작" 버튼 클릭
4. 결과 확인

### API 직접 호출

```bash
curl -X POST http://localhost:3000/api/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://smartstore.naver.com/브랜드명/products/상품번호"}'
```

## 🔍 API 엔드포인트

### POST /api/extract

네이버 스마트스토어 상품 정보를 추출합니다.

**Request:**
```json
{
  "url": "https://smartstore.naver.com/브랜드명/products/상품번호"
}
```

**Response:**
```json
{
  "ok": true,
  "inputUrl": "https://smartstore.naver.com/...",
  "productId": "12021574074",
  "channelId": "2zNk2ugzaeDT8eZYx6PH9",
  "product": {
    "productName": "상품명",
    "salePrice": 29000,
    "brandName": "브랜드명",
    "categoryName": "카테고리",
    "detailContent": "<div>상세 설명 HTML</div>"
  },
  "reviews": [
    {
      "writer": { "name": "작성자" },
      "content": "리뷰 내용",
      "rating": 5,
      "createdAt": "2024-01-15"
    }
  ],
  "qnas": [
    {
      "question": "질문",
      "answer": "답변",
      "writer": { "name": "작성자" },
      "createdAt": "2024-01-15"
    }
  ],
  "debug": {
    "endpoints": [...],
    "errors": [...],
    "cacheHit": false
  },
  "durationMs": 1500
}
```

## ⚠️ 주의사항

### 쿠키 관리

- **쿠키 만료**: 네이버 쿠키는 일정 시간 후 만료됩니다
- **갱신 필요**: 401/403 오류 발생 시 쿠키를 다시 수집해야 합니다
- **보안**: 쿠키는 민감한 정보이므로 `.env` 파일을 Git에 커밋하지 마세요

### Rate Limiting

- **요청 제한**: 동일 URL에 대해 60초 캐시 적용
- **도메인 제한**: 5 req/sec 제한 권장
- **IP 차단 방지**: 과도한 요청으로 인한 IP 차단 주의

### 오류 처리

- **401/403**: 쿠키 만료 또는 권한 부족
- **404**: 엔드포인트 변경 가능성
- **네트워크 오류**: 타임아웃 또는 연결 실패

## 🐛 문제 해결

### 자주 발생하는 오류

1. **"쿠키 미설정" 오류**
   - `.env` 파일에 `NAVER_COOKIE` 설정 확인
   - Railway 환경변수 설정 확인

2. **"channelId 추출 실패" 오류**
   - 쿠키가 만료되었을 가능성
   - 최신 쿠키로 업데이트 필요

3. **"API 호출 실패" 오류**
   - 네이버 정책 변경 가능성
   - 엔드포인트 URL 확인 필요

### 디버깅

- 서버 콘솔에서 상세 로그 확인
- 프론트엔드 디버그 정보 확인
- Network 탭에서 실제 요청 확인

## 📝 라이선스

MIT License

## 🤝 기여

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📞 지원

문제가 발생하면 GitHub Issues에 등록해주세요.