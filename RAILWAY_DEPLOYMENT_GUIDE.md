# 🚀 Railway 배포 가이드

Railway를 처음 사용하는 초보자를 위한 상세한 배포 가이드입니다.

## 📋 사전 준비사항

1. **GitHub 계정** (코드를 저장하기 위해 필요)
2. **Railway 계정** (무료로 가입 가능)
3. **Git 설치** (코드 버전 관리용)

## 🔧 1단계: GitHub에 코드 업로드

### 1.1 GitHub 저장소 생성
1. [GitHub.com](https://github.com)에 로그인
2. 우측 상단 "+" 버튼 클릭 → "New repository" 선택
3. Repository name: `naver-smartstore-crawler` (또는 원하는 이름)
4. "Public" 선택 (무료 사용을 위해)
5. "Create repository" 클릭

### 1.2 로컬 코드를 GitHub에 업로드
```bash
# 프로젝트 폴더에서 실행
git init
git add .
git commit -m "Initial commit: Railway 배포용 Puppeteer 크롤러"
git branch -M main
git remote add origin https://github.com/당신의사용자명/naver-smartstore-crawler.git
git push -u origin main
```

## 🚂 2단계: Railway 계정 생성 및 프로젝트 연결

### 2.1 Railway 계정 생성
1. [Railway.app](https://railway.app) 방문
2. "Start a New Project" 클릭
3. "Login with GitHub" 선택
4. GitHub 계정으로 로그인 및 권한 허용

### 2.2 새 프로젝트 생성
1. Railway 대시보드에서 "New Project" 클릭
2. "Deploy from GitHub repo" 선택
3. 방금 만든 GitHub 저장소 선택
4. "Deploy Now" 클릭

## ⚙️ 3단계: Railway 설정

### 3.1 환경 변수 설정 (필요시)
Railway 대시보드에서:
1. 프로젝트 클릭
2. "Variables" 탭 선택
3. 필요한 환경 변수 추가:
   ```
   NODE_ENV=production
   PORT=3000
   ```

### 3.2 도메인 설정
1. "Settings" 탭에서 "Domains" 섹션 찾기
2. "Generate Domain" 클릭하여 무료 도메인 생성
3. 생성된 도메인 복사 (예: `https://your-app-name.railway.app`)

## 🎯 4단계: 배포 확인

### 4.1 배포 상태 확인
- Railway 대시보드에서 "Deployments" 탭 확인
- 초록색 체크마크가 나타나면 배포 성공

### 4.2 API 테스트
배포된 도메인으로 API 테스트:
```bash
# 헬스체크
curl https://your-app-name.railway.app/api/health

# 데이터 추출 테스트
curl -X POST https://your-app-name.railway.app/api/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://smartstore.naver.com/your-product-url"}'
```

## 🔍 5단계: 문제 해결

### 5.1 배포 실패 시
1. **로그 확인**: Railway 대시보드 → "Deployments" → 실패한 배포 클릭 → 로그 확인
2. **일반적인 문제들**:
   - `package.json`의 `start` 스크립트 확인
   - Node.js 버전 호환성 확인
   - Puppeteer 설치 문제

### 5.2 Puppeteer 관련 오류
Railway는 자동으로 Chromium을 설치하지만, 문제가 있다면:
1. `nixpacks.toml` 파일이 올바른지 확인
2. Railway 대시보드에서 "Redeploy" 클릭

### 5.3 메모리 부족 오류
Railway 무료 플랜의 메모리 제한으로 인한 문제:
1. Puppeteer 설정에서 `--single-process` 옵션 사용 (이미 적용됨)
2. 필요시 Railway Pro 플랜 업그레이드 고려

## 📊 6단계: 모니터링 및 관리

### 6.1 로그 모니터링
- Railway 대시보드 → "Deployments" → "View Logs"
- 실시간 로그 확인 가능

### 6.2 성능 모니터링
- Railway 대시보드에서 CPU, 메모리 사용량 확인
- 무료 플랜: 월 500시간, 1GB RAM 제한

### 6.3 자동 재배포
- GitHub에 코드 푸시 시 자동으로 재배포됨
- 수동 재배포: Railway 대시보드 → "Redeploy" 버튼

## 💡 7단계: 추가 팁

### 7.1 무료 플랜 제한사항
- **월 500시간** 사용 제한
- **1GB RAM** 제한
- **수면 모드**: 5분간 요청이 없으면 자동 수면
- **첫 요청 시 깨어나는 시간**: 약 30초

### 7.2 성능 최적화
- Puppeteer 브라우저 인스턴스 재사용 고려
- 불필요한 리소스 로딩 방지
- 타임아웃 설정 최적화

### 7.3 보안 고려사항
- CORS 설정 확인
- API 엔드포인트 보호
- Rate limiting 구현 고려

## 🆘 문제 해결 체크리스트

- [ ] GitHub 저장소가 올바르게 연결되었는가?
- [ ] `package.json`의 `start` 스크립트가 올바른가?
- [ ] Node.js 버전이 18.x 이상인가?
- [ ] Puppeteer가 올바르게 설치되었는가?
- [ ] Railway 환경 변수가 올바르게 설정되었는가?
- [ ] 도메인이 올바르게 생성되었는가?

## 📞 지원

문제가 지속되면:
1. Railway 공식 문서: [docs.railway.app](https://docs.railway.app)
2. Railway Discord 커뮤니티
3. GitHub Issues에 문제 보고

---

**축하합니다! 🎉** Railway에 성공적으로 배포되었습니다!
