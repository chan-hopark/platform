# 쿠팡 상품 크롤러 Dockerfile
FROM node:20-slim

# 기본 유틸리티 및 Playwright 의존성 설치
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    ca-certificates \
    build-essential \
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

# 서버 시작
CMD ["npm", "start"]