// components/HomePage.jsx
import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import SectionBox from './SectionBox';

const HomePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const open = (path) => navigate(path, { state: { backgroundLocation: location } });

  const extractData = async () => {
    if (!url) {
      alert('URL을 입력해주세요.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url })
      });

      const data = await response.json();

      if (data.ok) {
        setResult(data);
      } else {
        setError(data.error || '데이터 추출에 실패했습니다.');
      }
    } catch (error) {
      setError('서버와의 통신 중 오류가 발생했습니다: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="py-6">
      {/* 네이버 스마트스토어 크롤러 섹션 */}
      <div className="mb-8">
        <SectionBox className="p-8">
          <h2 className="text-2xl font-bold mb-6 text-center">🛍️ 네이버 스마트스토어 크롤러</h2>
          
          <div className="max-w-2xl mx-auto">
            <div className="mb-4">
              <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">
                네이버 스마트스토어 상품 URL:
              </label>
              <input
                type="url"
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://smartstore.naver.com/..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <button
              onClick={extractData}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? '데이터 추출 중...' : '데이터 추출 시작'}
            </button>
          </div>

          {loading && (
            <div className="mt-6 text-center text-gray-600">
              데이터를 추출하고 있습니다... 잠시만 기다려주세요.
            </div>
          )}

          {error && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <h3 className="text-red-800 font-semibold mb-2">❌ 오류 발생</h3>
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {result && (
            <div className="mt-6">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
                <h3 className="text-green-800 font-semibold mb-2">✅ 데이터 추출 완료!</h3>
                <p className="text-green-700">
                  <strong>상품명:</strong> {result.product?.name || '추출 실패'} | 
                  <strong> 가격:</strong> {result.product?.price || '추출 실패'}
                </p>
                {result.product?.summary && (
                  <p className="text-green-700 mt-2">
                    <strong>요약:</strong> {result.product.summary}
                  </p>
                )}
              </div>

              {result.frames && result.frames.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-semibold mb-2">🔍 발견된 iframe 정보:</h4>
                  <div className="space-y-2">
                    {result.frames.map((frame, index) => (
                      <div key={index} className="p-3 bg-gray-50 rounded border">
                        <p className="text-sm"><strong>iframe {index}:</strong> {frame.url}</p>
                        {frame.productData && (frame.productData.name || frame.productData.price) && (
                          <p className="text-sm text-green-600">
                            상품 정보 발견: {frame.productData.name || '이름 없음'} - {frame.productData.price || '가격 없음'}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.errorDetails && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                  <h4 className="font-semibold text-yellow-800">⚠️ 상세 오류 정보:</h4>
                  <p className="text-yellow-700 text-sm">{result.errorDetails.message}</p>
                </div>
              )}
            </div>
          )}
        </SectionBox>
      </div>

      {/* 기존 홈페이지 콘텐츠 */}
      <div className="grid grid-cols-12 gap-6 mt-6">
        {/* 좌측 카테고리 */}
        <SectionBox className="col-span-12 md:col-span-2 h-80 md:h-[420px] flex items-center justify-center">
          카테고리
        </SectionBox>

        {/* 메인 영역 */}
        <div className="col-span-12 md:col-span-8">
          <SectionBox className="h-64 md:h-[420px] flex items-center justify-center">
            메인 배너
          </SectionBox>
        </div>

        {/* 우측 사이드 배너 */}
        <SectionBox className="col-span-12 md:col-span-2 h-80 md:h-[420px] flex items-center justify-center">
          사이드 배너
        </SectionBox>
      </div>

      {/* 하단 배너 5개 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 mt-8">
        {[1, 2, 3, 4, 5].map((n) => (
          <SectionBox key={n} className="h-28 flex items-center justify-center">
            하단 배너 {n}
          </SectionBox>
        ))}
      </div>
    </div>
  );
};

export default HomePage;