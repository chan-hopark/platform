# 🖥️ GitHub Desktop으로 코드 업로드 가이드

GitHub Desktop을 사용하여 코드를 GitHub에 업로드하는 방법입니다.

## 📥 1단계: GitHub Desktop 설치

1. [GitHub Desktop 다운로드](https://desktop.github.com/)
2. 설치 후 GitHub 계정으로 로그인
3. "Sign in to GitHub.com" 선택

## 🔧 2단계: 로컬 저장소 생성

### 2.1 GitHub Desktop에서 새 저장소 생성
1. GitHub Desktop 실행
2. "File" → "New repository" 클릭
3. **Repository name**: `naver-smartstore-crawler`
4. **Local path**: 원하는 폴더 경로 선택
5. **Description**: "네이버 스마트스토어 크롤러 (Railway 배포용)"
6. **Public** 선택 (무료 사용)
7. "Create repository" 클릭

### 2.2 기존 프로젝트 폴더 연결
만약 이미 프로젝트 폴더가 있다면:
1. "File" → "Add local repository" 클릭
2. "Choose..." 버튼으로 프로젝트 폴더 선택
3. "Add repository" 클릭

## 📤 3단계: 코드 커밋 및 푸시

### 3.1 변경사항 확인
- GitHub Desktop 좌측에 변경된 파일들이 표시됩니다
- 각 파일 옆의 체크박스를 선택하여 커밋할 파일 선택

### 3.2 첫 번째 커밋
1. 하단 "Summary"에 커밋 메시지 입력:
   ```
   Initial commit: Railway 배포용 Puppeteer 크롤러
   ```
2. "Commit to main" 클릭

### 3.3 GitHub에 푸시
1. "Publish repository" 클릭 (첫 푸시인 경우)
2. 또는 "Push origin" 클릭 (이미 푸시된 경우)

## 🔄 4단계: Vercel과 Railway 연결

### 4.1 Vercel 연결 (기존 방식 유지)
1. [Vercel.com](https://vercel.com) 로그인
2. "New Project" 클릭
3. GitHub 저장소 선택
4. "Deploy" 클릭

### 4.2 Railway 연결 (새로운 방식)
1. [Railway.app](https://railway.app) 로그인
2. "New Project" 클릭
3. "Deploy from GitHub repo" 선택
4. 같은 GitHub 저장소 선택
5. "Deploy Now" 클릭

## 🎯 5단계: 두 플랫폼 동시 사용

### 5.1 배포 URL 확인
- **Vercel**: `https://your-project.vercel.app`
- **Railway**: `https://your-project.railway.app`

### 5.2 코드 변경 시 자동 배포
1. GitHub Desktop에서 코드 수정
2. 커밋 및 푸시
3. **Vercel과 Railway 모두 자동으로 재배포됨**

## 🔧 6단계: 플랫폼별 설정

### 6.1 Vercel 설정 (기존)
- `vercel.json` 파일이 있으면 Vercel 설정 사용
- 없으면 기본 설정으로 동작

### 6.2 Railway 설정 (새로운)
- `railway.json`, `Procfile`, `nixpacks.toml` 파일 사용
- Puppeteer 최적화 설정 포함

## 💡 7단계: 실용적인 사용법

### 7.1 개발 단계별 배포
```
로컬 개발 → GitHub 푸시 → 자동 배포
├── Vercel (빠른 테스트용)
└── Railway (Puppeteer 최적화)
```

### 7.2 A/B 테스트
- **Vercel**: Cheerio 기반 (빠르지만 제한적)
- **Railway**: Puppeteer 기반 (느리지만 정확)

### 7.3 비용 최적화
- **Vercel**: 서버리스 함수 (요청당 과금)
- **Railway**: 서버 기반 (시간당 과금)

## 🚨 주의사항

### 7.1 충돌 방지
- 두 플랫폼 모두 같은 GitHub 저장소 사용
- 코드 변경 시 두 플랫폼 모두 영향받음
- 필요시 브랜치를 나누어 관리

### 7.2 환경 변수
- **Vercel**: Vercel 대시보드에서 설정
- **Railway**: Railway 대시보드에서 설정
- 각각 독립적으로 관리

## 🎉 완료!

이제 하나의 GitHub 저장소로 두 개의 배포 플랫폼을 동시에 사용할 수 있습니다!

### 📋 체크리스트
- [ ] GitHub Desktop 설치 및 로그인
- [ ] 로컬 저장소 생성 또는 연결
- [ ] 코드 커밋 및 푸시
- [ ] Vercel 프로젝트 연결
- [ ] Railway 프로젝트 연결
- [ ] 두 플랫폼 모두 정상 배포 확인
