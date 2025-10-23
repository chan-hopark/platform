#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
네이버 스마트스토어 상품 정보 완전 크롤러
URL에서 productId와 channelId를 추출하여 API 호출
"""

import requests
import json
import re
from bs4 import BeautifulSoup
from urllib.parse import urlparse
import time

class SmartStoreCrawler:
    def __init__(self):
        self.session = requests.Session()
        self.setup_headers()
    
    def setup_headers(self):
        """기본 헤더 설정"""
        self.session.headers.update({
            "accept": "application/json, text/plain, */*",
            "accept-encoding": "gzip, deflate, br, zstd",
            "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
            "x-client-version": "20251016170128",
        })
    
    def extract_product_id(self, url):
        """URL에서 productId 추출"""
        try:
            # /products/{숫자} 패턴 매칭
            pattern = r'/products/(\d+)'
            match = re.search(pattern, url)
            if match:
                return match.group(1)
            return None
        except Exception as e:
            print(f"❌ productId 추출 실패: {e}")
            return None
    
    def extract_channel_id_from_html(self, url):
        """HTML에서 channelId 추출"""
        try:
            print("🔍 HTML에서 channelId 추출 중...")
            
            # HTML 페이지 요청
            response = self.session.get(url)
            if response.status_code != 200:
                print(f"❌ HTML 페이지 요청 실패: {response.status_code}")
                return None
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # 방법 1: script 태그에서 channelId 찾기
            scripts = soup.find_all('script')
            for script in scripts:
                if script.string:
                    # /i/v2/channels/{channelId}/products/{productId} 패턴 찾기
                    pattern = r'/i/v2/channels/([^/]+)/products/(\d+)'
                    match = re.search(pattern, script.string)
                    if match:
                        channel_id = match.group(1)
                        print(f"✅ script 태그에서 channelId 발견: {channel_id}")
                        return channel_id
            
            # 방법 2: meta 태그에서 찾기
            meta_tags = soup.find_all('meta')
            for meta in meta_tags:
                content = meta.get('content', '')
                if 'channel' in content.lower():
                    pattern = r'channels/([^/]+)'
                    match = re.search(pattern, content)
                    if match:
                        channel_id = match.group(1)
                        print(f"✅ meta 태그에서 channelId 발견: {channel_id}")
                        return channel_id
            
            # 방법 3: data 속성에서 찾기
            elements = soup.find_all(attrs={'data-channel-id': True})
            if elements:
                channel_id = elements[0]['data-channel-id']
                print(f"✅ data 속성에서 channelId 발견: {channel_id}")
                return channel_id
            
            print("⚠️ HTML에서 channelId를 찾을 수 없습니다.")
            return None
            
        except Exception as e:
            print(f"❌ channelId 추출 실패: {e}")
            return None
    
    def get_product_info(self, channel_id, product_id):
        """상품 정보 API 호출"""
        try:
            print("🛍️ 상품 정보 API 호출 중...")
            
            api_url = f"https://smartstore.naver.com/i/v2/channels/{channel_id}/products/{product_id}?withWindow=false"
            response = self.session.get(api_url)
            
            if response.status_code == 200:
                data = response.json()
                return data.get('product', {})
            else:
                print(f"❌ 상품 정보 API 호출 실패: {response.status_code}")
                return {}
                
        except Exception as e:
            print(f"❌ 상품 정보 API 오류: {e}")
            return {}
    
    def get_reviews(self, product_id):
        """리뷰 API 호출"""
        try:
            print("⭐ 리뷰 정보 API 호출 중...")
            
            # 리뷰 API URL (실제 네트워크 탭에서 확인한 endpoint 사용)
            reviews_url = f"https://smartstore.naver.com/i/v2/reviews/{product_id}"
            params = {
                'page': 1,
                'size': 10,
                'sort': 'NEWEST'
            }
            
            response = self.session.get(reviews_url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                return data.get('reviews', [])
            else:
                print(f"❌ 리뷰 API 호출 실패: {response.status_code}")
                return []
                
        except Exception as e:
            print(f"❌ 리뷰 API 오류: {e}")
            return []
    
    def get_qnas(self, product_id):
        """Q&A API 호출"""
        try:
            print("❓ Q&A 정보 API 호출 중...")
            
            # Q&A API URL (실제 네트워크 탭에서 확인한 endpoint 사용)
            qna_url = f"https://smartstore.naver.com/i/v2/qnas/{product_id}"
            params = {
                'page': 1,
                'size': 10,
                'sort': 'NEWEST'
            }
            
            response = self.session.get(qna_url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                return data.get('qnas', [])
            else:
                print(f"❌ Q&A API 호출 실패: {response.status_code}")
                return []
                
        except Exception as e:
            print(f"❌ Q&A API 오류: {e}")
            return []
    
    def format_price(self, price):
        """가격 포맷팅"""
        if isinstance(price, (int, float)):
            return f"{price:,}원"
        return str(price)
    
    def format_html_content(self, html_content):
        """HTML 내용 포맷팅"""
        if not html_content:
            return "상세 정보 없음"
        
        # HTML 태그 제거하고 텍스트만 추출
        soup = BeautifulSoup(html_content, 'html.parser')
        text = soup.get_text()
        
        # 너무 긴 경우 잘라내기
        if len(text) > 500:
            text = text[:500] + "..."
        
        return text
    
    def display_results(self, product_info, reviews, qnas):
        """결과 화면 출력"""
        print("\n" + "="*80)
        print("🛍️ 네이버 스마트스토어 상품 정보")
        print("="*80)
        
        # 상품 기본 정보
        print(f"\n📦 상품명: {product_info.get('productName', '정보 없음')}")
        print(f"💰 가격: {self.format_price(product_info.get('salePrice', '정보 없음'))}")
        print(f"🏷️ 브랜드: {product_info.get('brandName', '정보 없음')}")
        print(f"📂 카테고리: {product_info.get('categoryName', '정보 없음')}")
        
        # 상세 정보
        detail_content = product_info.get('detailContent', '')
        if detail_content:
            print(f"\n📄 상세페이지 내용:")
            print("-" * 50)
            print(self.format_html_content(detail_content))
            print("-" * 50)
        else:
            print("\n📄 상세페이지: 정보 없음")
        
        # 리뷰 정보
        if reviews:
            print(f"\n⭐ 리뷰 ({len(reviews)}개):")
            print("-" * 50)
            for i, review in enumerate(reviews[:10], 1):
                author = review.get('author', {}).get('name', '익명')
                content = review.get('content', '')
                rating = review.get('rating', 0)
                date = review.get('createdAt', '')
                
                print(f"{i}. [{rating}점] {author}")
                print(f"   내용: {content[:100]}{'...' if len(content) > 100 else ''}")
                print(f"   날짜: {date}")
                print()
        else:
            print("\n⭐ 리뷰: 정보 없음")
        
        # Q&A 정보
        if qnas:
            print(f"\n❓ Q&A ({len(qnas)}개):")
            print("-" * 50)
            for i, qna in enumerate(qnas[:10], 1):
                question = qna.get('question', '')
                answer = qna.get('answer', '')
                author = qna.get('author', {}).get('name', '익명')
                date = qna.get('createdAt', '')
                
                print(f"{i}. Q: {question[:100]}{'...' if len(question) > 100 else ''}")
                if answer:
                    print(f"   A: {answer[:100]}{'...' if len(answer) > 100 else ''}")
                print(f"   작성자: {author}, 날짜: {date}")
                print()
        else:
            print("\n❓ Q&A: 정보 없음")
        
        print("="*80)
    
    def crawl(self, url):
        """메인 크롤링 함수"""
        try:
            print("🚀 네이버 스마트스토어 크롤링 시작...")
            print(f"📍 URL: {url}")
            
            # 1. productId 추출
            product_id = self.extract_product_id(url)
            if not product_id:
                print("❌ productId 추출 실패")
                return
            
            print(f"✅ productId: {product_id}")
            
            # 2. channelId 추출
            channel_id = self.extract_channel_id_from_html(url)
            if not channel_id:
                print("❌ channelId 추출 실패")
                return
            
            print(f"✅ channelId: {channel_id}")
            
            # 3. API 호출
            product_info = self.get_product_info(channel_id, product_id)
            reviews = self.get_reviews(product_id)
            qnas = self.get_qnas(product_id)
            
            # 4. 결과 출력
            self.display_results(product_info, reviews, qnas)
            
            # 5. JSON 파일로 저장
            result = {
                'product': product_info,
                'reviews': reviews,
                'qnas': qnas,
                'crawled_at': time.strftime('%Y-%m-%d %H:%M:%S')
            }
            
            filename = f"smartstore_{product_id}_full_data.json"
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            print(f"\n💾 전체 데이터가 '{filename}' 파일로 저장되었습니다.")
            
        except Exception as e:
            print(f"❌ 크롤링 오류: {e}")

def main():
    """메인 함수"""
    print("="*80)
    print("🛍️ 네이버 스마트스토어 완전 크롤러")
    print("="*80)
    print("📝 사용법: 네이버 스마트스토어 상품 URL을 입력하세요")
    print("   예시: https://smartstore.naver.com/miliving/products/10037442277")
    print("="*80)
    
    # URL 입력
    url = input("\n🔗 네이버 스마트스토어 상품 URL을 입력하세요: ").strip()
    
    if not url:
        print("❌ URL이 입력되지 않았습니다.")
        return
    
    if not url.startswith("https://smartstore.naver.com/"):
        print("❌ 올바른 네이버 스마트스토어 URL이 아닙니다.")
        return
    
    # 크롤링 실행
    crawler = SmartStoreCrawler()
    crawler.crawl(url)
    
    print("\n✅ 크롤링 완료!")

if __name__ == "__main__":
    main()
