# 🛍️ 네이버 스마트스토어 크롤러

Railway에 배포된 Puppeteer 기반 네이버 스마트스토어 상품 데이터 추출 서비스입니다.

## 🚀 기능

- **상품 정보 추출**: 상품명, 가격, 요약 정보
- **리뷰 데이터 추출**: 고객 리뷰 및 평점
- **Q&A 데이터 추출**: 상품 문의 및 답변
- **웹 인터페이스**: 사용자 친화적인 UI 제공

## 🌐 배포 URL

- **Railway**: `https://platform-production-865a.up.railway.app`
- **API 엔드포인트**: `/api/extract`, `/api/health`, `/api/data`

## 🛠️ 기술 스택

- **Backend**: Node.js, Express, Puppeteer
- **Frontend**: HTML, CSS, JavaScript
- **Deployment**: Railway
- **Database**: JSON 파일 저장

## 📋 사용법

1. 웹 브라우저에서 배포 URL 접속
2. 네이버 스마트스토어 상품 URL 입력
3. "데이터 추출 시작" 버튼 클릭
4. 추출된 데이터 확인

## 🔧 로컬 개발

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build

# 프로덕션 실행
npm start
```

## 📁 프로젝트 구조

```
├── server/           # Express 서버 코드
├── public/           # 정적 파일 (웹 인터페이스)
├── api/             # API 엔드포인트
├── package.json     # 프로젝트 설정
└── README.md        # 프로젝트 문서
```

## 🚀 배포

Railway에 자동 배포되도록 설정되어 있습니다.
GitHub에 푸시하면 자동으로 재배포됩니다.

## 📄 라이선스

MIT License
