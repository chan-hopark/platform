#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
네이버 스마트스토어 상품 상세 데이터 크롤러
"""

import requests
import json

def crawl_smartstore_product():
    """
    네이버 스마트스토어 상품 상세 데이터를 가져오는 함수
    """
    
    # 요청 URL
    url = "https://smartstore.naver.com/i/v2/channels/2zNk2ugzaeDT8eZYx6PH9/products/12021574074?withWindow=false"
    
    # 요청 헤더
    headers = {
        "accept": "application/json, text/plain, */*",
        "accept-encoding": "gzip, deflate, br, zstd",
        "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "content-type": "application/json",
        "referer": "https://smartstore.naver.com/nakedorigin/products/12021574074",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        "x-client-version": "20251016170128",
        "cookie": "NNB=PYTKL72IWVAGQ; ... (생략, 내가 네트워크탭에서 추출한 값 그대로 넣을거임)",
    }
    
    try:
        print("🚀 네이버 스마트스토어 상품 데이터 요청 중...")
        print(f"📍 URL: {url}")
        
        # GET 요청 보내기
        response = requests.get(url, headers=headers)
        
        # 응답 상태 코드 확인
        print(f"📊 응답 상태 코드: {response.status_code}")
        
        if response.status_code == 200:
            # JSON 응답 파싱
            data = response.json()
            
            print("\n✅ 요청 성공!")
            print("=" * 50)
            
            # 최상위 필드 출력
            print("📋 응답 데이터 최상위 필드:")
            print(f"   {list(data.keys())}")
            
            # 상품명과 가격 출력
            print("\n🛍️ 상품 정보:")
            try:
                product_name = data.get("product", {}).get("productName", "상품명 없음")
                sale_price = data.get("product", {}).get("salePrice", "가격 없음")
                
                print(f"   상품명: {product_name}")
                print(f"   가격: {sale_price}")
            except Exception as e:
                print(f"   상품 정보 추출 실패: {e}")
            
            # 전체 응답 데이터 구조 확인
            print("\n📄 전체 응답 데이터 구조:")
            print(f"   응답 데이터 타입: {type(data)}")
            print(f"   응답 데이터 크기: {len(str(data))} 문자")
            
            # JSON 응답을 파일로 저장 (선택사항)
            with open("smartstore_response.json", "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"   📁 응답 데이터가 'smartstore_response.json' 파일로 저장되었습니다.")
            
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

if __name__ == "__main__":
    print("=" * 60)
    print("🛍️ 네이버 스마트스토어 상품 크롤러")
    print("=" * 60)
    
    crawl_smartstore_product()
    
    print("\n" + "=" * 60)
    print("✅ 크롤링 완료!")
    print("=" * 60)
