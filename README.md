# 🛍️ 네이버 스마트스토어 크롤러

Railway에 배포된 Playwright 기반 네이버 스마트스토어 상품 데이터 추출 서비스입니다.

## 🚀 기능

- **상품 정보 추출**: 상품명, 가격, 요약 정보, 이미지
- **iframe 처리**: 네이버 스마트스토어의 iframe 내부 상품 정보 추출
- **상세 로깅**: 크롤링 과정의 단계별 로그 및 디버깅 정보
- **React UI**: 현대적인 사용자 인터페이스
- **에러 처리**: 상세한 오류 정보 및 디버깅 데이터 제공

## 🌐 배포 URL

- **Railway**: `https://platform-production-865a.up.railway.app`
- **API 엔드포인트**: `/api/extract`, `/api/health`

## 🛠️ 기술 스택

- **Backend**: Node.js, Express, Playwright
- **Frontend**: React, Vite, Tailwind CSS
- **Deployment**: Railway
- **Build**: Vite 빌드 시스템

## 📋 사용법

1. 웹 브라우저에서 배포 URL 접속
2. 네이버 스마트스토어 상품 URL 입력
3. "데이터 추출 시작" 버튼 클릭
4. 추출된 데이터 및 iframe 정보 확인

## 🔧 로컬 개발

```bash
# 의존성 설치
npm install

# Playwright 브라우저 설치
npx playwright install --with-deps

# 프론트엔드 빌드
npm run build

# 개발 서버 실행 (헤드리스 모드)
npm run dev

# 프로덕션 실행
npm start
```

## 🚀 Railway 배포

Railway에 자동 배포되도록 설정되어 있습니다:
- `railway.json`에서 빌드 과정 설정
- 프론트엔드 빌드 후 Express 서버 실행
- Playwright 브라우저 자동 설치

## 🔍 디버깅 기능

- **상세 로그**: 각 단계별 진행 상황 출력
- **iframe 스캔**: 모든 iframe 내부 콘텐츠 분석
- **에러 디테일**: 실패 시 상세한 오류 정보 제공
- **HTML/스크린샷 저장**: 디버깅용 파일 자동 저장

## 📁 프로젝트 구조

```
├── server/           # Express 서버 코드
├── components/       # React 컴포넌트
├── src/             # React 앱 소스
├── dist/            # 빌드된 프론트엔드 (자동 생성)
├── package.json     # 프로젝트 설정
├── vite.config.js   # Vite 설정
├── tailwind.config.js # Tailwind CSS 설정
└── railway.json     # Railway 배포 설정
```

## 🐛 문제 해결

### 프론트엔드가 보이지 않는 경우
```bash
npm run build
```

### 크롤링 실패 시
- 로그에서 iframe 정보 확인
- `errorDetails` 필드에서 상세 오류 확인
- 네트워크 탭에서 API 응답 확인

## 📄 라이선스

MIT License
