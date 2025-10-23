#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
네이버 스마트스토어 상품 상세 데이터 크롤러
URL에서 channelId와 productId를 추출하여 API 호출
"""

import requests
import json
import re

def extract_ids_from_url(url):
    """
    네이버 스마트스토어 URL에서 channelId와 productId를 추출하는 함수
    
    Args:
        url (str): 네이버 스마트스토어 상품 URL
        예: https://smartstore.naver.com/miliving/products/10037442277
    
    Returns:
        tuple: (channelId, productId) 또는 (None, None)
    """
    try:
        # URL 패턴 매칭
        # https://smartstore.naver.com/{channelId}/products/{productId}
        pattern = r'https://smartstore\.naver\.com/([^/]+)/products/(\d+)'
        match = re.search(pattern, url)
        
        if match:
            channel_id = match.group(1)
            product_id = match.group(2)
            return channel_id, product_id
        else:
            print("❌ URL 형식이 올바르지 않습니다.")
            print("   올바른 형식: https://smartstore.naver.com/{channelId}/products/{productId}")
            return None, None
            
    except Exception as e:
        print(f"❌ URL 파싱 오류: {e}")
        return None, None

def crawl_smartstore_product(url):
    """
    네이버 스마트스토어 상품 상세 데이터를 가져오는 함수
    
    Args:
        url (str): 네이버 스마트스토어 상품 URL
    """
    
    # URL에서 channelId와 productId 추출
    print("🔍 URL에서 channelId와 productId 추출 중...")
    channel_id, product_id = extract_ids_from_url(url)
    
    if not channel_id or not product_id:
        return
    
    print(f"✅ 추출 완료:")
    print(f"   channelId: {channel_id}")
    print(f"   productId: {product_id}")
    
    # API URL 생성
    api_url = f"https://smartstore.naver.com/i/v2/channels/{channel_id}/products/{product_id}?withWindow=false"
    print(f"📍 API URL: {api_url}")
    
    # 요청 헤더 (네트워크 탭에서 가져온 값)
    headers = {
        "accept": "application/json, text/plain, */*",
        "accept-encoding": "gzip, deflate, br, zstd",
        "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "content-type": "application/json",
        "referer": url,
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        "x-client-version": "20251016170128",
        "cookie": "NNB=PYTKL72IWVAGQ; ... (생략, 내가 네트워크탭에서 추출한 값 그대로 넣을거임)",
    }
    
    try:
        print("\n🚀 네이버 스마트스토어 상품 데이터 요청 중...")
        
        # GET 요청 보내기
        response = requests.get(api_url, headers=headers)
        
        # 응답 상태 코드 확인
        print(f"📊 응답 상태 코드: {response.status_code}")
        
        if response.status_code == 200:
            # JSON 응답 파싱
            data = response.json()
            
            print("\n✅ 요청 성공!")
            print("=" * 60)
            
            # 최상위 필드 출력
            print("📋 응답 데이터 최상위 필드:")
            print(f"   {list(data.keys())}")
            
            # 상품명과 가격 출력
            print("\n🛍️ 상품 정보:")
            try:
                product_name = data["product"]["productName"]
                sale_price = data["product"]["salePrice"]
                
                print(f"   상품명: {product_name}")
                print(f"   가격: {sale_price:,}원" if isinstance(sale_price, (int, float)) else f"   가격: {sale_price}")
                
                # 추가 상품 정보
                if "product" in data:
                    product = data["product"]
                    print(f"\n📄 추가 상품 정보:")
                    print(f"   브랜드: {product.get('brandName', '정보 없음')}")
                    print(f"   카테고리: {product.get('categoryName', '정보 없음')}")
                    print(f"   할인가: {product.get('salePrice', '정보 없음')}")
                    print(f"   정가: {product.get('price', '정보 없음')}")
                    print(f"   할인율: {product.get('discountRate', '정보 없음')}%")
                    
            except KeyError as e:
                print(f"   상품 정보 추출 실패: {e}")
                print(f"   사용 가능한 product 필드: {list(data.get('product', {}).keys())}")
            except Exception as e:
                print(f"   상품 정보 추출 실패: {e}")
            
            # 전체 응답 데이터 구조 확인
            print(f"\n📄 전체 응답 데이터 구조:")
            print(f"   응답 데이터 타입: {type(data)}")
            print(f"   응답 데이터 크기: {len(str(data))} 문자")
            
            # JSON 응답을 파일로 저장 (선택사항)
            filename = f"smartstore_{product_id}_response.json"
            with open(filename, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"   📁 응답 데이터가 '{filename}' 파일로 저장되었습니다.")
            
        else:
            print(f"❌ 요청 실패: HTTP {response.status_code}")
            print(f"   응답 내용: {response.text}")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ 네트워크 오류: {e}")
    except json.JSONDecodeError as e:
        print(f"❌ JSON 파싱 오류: {e}")
        print(f"   응답 내용: {response.text[:500]}...")
    except Exception as e:
        print(f"❌ 예상치 못한 오류: {e}")

def main():
    """
    메인 함수
    """
    print("=" * 70)
    print("🛍️ 네이버 스마트스토어 상품 크롤러")
    print("=" * 70)
    print("📝 사용법: 네이버 스마트스토어 상품 URL을 입력하세요")
    print("   예시: https://smartstore.naver.com/miliving/products/10037442277")
    print("=" * 70)
    
    # URL 입력받기
    url = input("\n🔗 네이버 스마트스토어 상품 URL을 입력하세요: ").strip()
    
    if not url:
        print("❌ URL이 입력되지 않았습니다.")
        return
    
    if not url.startswith("https://smartstore.naver.com/"):
        print("❌ 올바른 네이버 스마트스토어 URL이 아닙니다.")
        print("   올바른 형식: https://smartstore.naver.com/{channelId}/products/{productId}")
        return
    
    print(f"\n📍 입력된 URL: {url}")
    
    # 크롤링 실행
    crawl_smartstore_product(url)
    
    print("\n" + "=" * 70)
    print("✅ 크롤링 완료!")
    print("=" * 70)

if __name__ == "__main__":
    main()