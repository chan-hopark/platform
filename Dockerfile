# Node.js 20 기반 Dockerfile
FROM node:20-slim

# 시스템 의존성 설치
RUN apt-get update && apt-get install -y \
    # Playwright 실행에 필요한 의존성
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxss1 \
    libasound2 \
    libgtk-3-0 \
    libx11-xcb1 \
    libxcb-dri3-0 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxss1 \
    libasound2 \
    # 폰트 지원
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    # 기타 유틸리티
    wget \
    gnupg \
    ca-certificates \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# 작업 디렉토리 설정
WORKDIR /app

# package.json과 package-lock.json 복사
COPY package*.json ./

# Node.js 의존성 설치
RUN npm ci --production=false

# Playwright 브라우저 설치
RUN npx playwright install chromium --with-deps

# 소스 코드 복사
COPY . .

# 빌드 (프론트엔드가 있는 경우)
RUN npm run build || echo "No build script found, skipping..."

# 포트 노출
EXPOSE 3000

# 환경변수 설정
ENV NODE_ENV=production
ENV PORT=3000
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# 헬스체크 추가
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# 서버 시작
CMD ["npm", "start"]