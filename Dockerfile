# 쿠팡 상품 크롤러 Dockerfile
FROM node:20-slim

# 기본 유틸리티 설치
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# 작업 디렉토리 설정
WORKDIR /app

# package.json과 package-lock.json 복사
COPY package*.json ./

# Node.js 의존성 설치
RUN npm ci --production=false

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