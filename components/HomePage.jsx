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
        // 백엔드에서 오는 상세한 에러 정보 표시
        let errorMessage = data.error || '데이터 추출에 실패했습니다.';
        
        // debug 정보가 있으면 추가
        if (data.debug && data.debug.errors && data.debug.errors.length > 0) {
          errorMessage += '\n\n상세 오류:';
          data.debug.errors.forEach(err => {
            errorMessage += `\n• ${err}`;
          });
        }
        
        // endpoints 정보가 있으면 추가
        if (data.debug && data.debug.endpoints && data.debug.endpoints.length > 0) {
          errorMessage += '\n\nAPI 호출 상태:';
          data.debug.endpoints.forEach(endpoint => {
            errorMessage += `\n• ${endpoint.name}: ${endpoint.status}`;
            if (endpoint.error) {
              errorMessage += ` (${endpoint.error})`;
            }
          });
        }
        
        setError(errorMessage);
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
              <div className="text-red-700 whitespace-pre-line">{error}</div>
            </div>
          )}

          {result && (
            <div className="mt-6">
              {/* 상품 요약 정보 */}
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
                <h3 className="text-green-800 font-semibold mb-2">✅ 데이터 추출 완료!</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-green-700">
                      <strong>상품명:</strong> {result.product?.productName || '추출 실패'}
                    </p>
                    <p className="text-green-700">
                      <strong>가격:</strong> {result.product?.salePrice ? `${result.product.salePrice.toLocaleString()}원` : '추출 실패'}
                    </p>
                    <p className="text-green-700">
                      <strong>브랜드:</strong> {result.product?.brandName || '정보 없음'}
                    </p>
                    <p className="text-green-700">
                      <strong>카테고리:</strong> {result.product?.categoryName || '정보 없음'}
                    </p>
                  </div>
                  <div>
                    <p className="text-green-700">
                      <strong>리뷰 수:</strong> {result.reviews?.length || 0}개
                    </p>
                    <p className="text-green-700">
                      <strong>Q&A 수:</strong> {result.qnas?.length || 0}개
                    </p>
                    <p className="text-green-700">
                      <strong>처리 시간:</strong> {result.durationMs}ms
                    </p>
                  </div>
                </div>
              </div>

              {/* 상품 상세 정보 */}
              {result.product && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-semibold text-blue-800 mb-2">📦 상품 상세 정보</h4>
                  {result.product.detailContent && (
                    <div className="text-blue-700">
                      <strong>상세 설명:</strong>
                      <div className="mt-2 p-3 bg-white rounded border max-h-40 overflow-y-auto">
                        <div dangerouslySetInnerHTML={{ __html: result.product.detailContent }} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 리뷰 정보 */}
              {result.reviews && result.reviews.length > 0 && (
                <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <h4 className="font-semibold text-yellow-800 mb-2">⭐ 리뷰 ({result.reviews.length}개)</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {result.reviews.slice(0, 10).map((review, index) => (
                      <div key={index} className="p-3 bg-white rounded border">
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-medium">{review.writer?.name || '익명'}</span>
                          <span className="text-sm text-gray-500">{review.createdAt}</span>
                        </div>
                        <p className="text-sm text-gray-700">{review.content}</p>
                        {review.rating && (
                          <p className="text-sm text-yellow-600">평점: {review.rating}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Q&A 정보 */}
              {result.qnas && result.qnas.length > 0 && (
                <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <h4 className="font-semibold text-purple-800 mb-2">❓ Q&A ({result.qnas.length}개)</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {result.qnas.slice(0, 10).map((qna, index) => (
                      <div key={index} className="p-3 bg-white rounded border">
                        <div className="mb-2">
                          <p className="font-medium text-purple-700">Q: {qna.question}</p>
                          {qna.answer && (
                            <p className="text-sm text-gray-600 mt-1">A: {qna.answer}</p>
                          )}
                        </div>
                        <div className="flex justify-between items-center text-xs text-gray-500">
                          <span>{qna.writer?.name || '익명'}</span>
                          <span>{qna.createdAt}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 디버그 정보 */}
              {result.debug && (
                <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <h4 className="font-semibold text-gray-800 mb-2">🔧 디버그 정보</h4>
                  <div className="text-sm text-gray-700 space-y-1">
                    <p><strong>Product ID:</strong> {result.productId}</p>
                    <p><strong>Channel ID:</strong> {result.channelId}</p>
                    <p><strong>캐시 사용:</strong> {result.debug.cacheHit ? '✅' : '❌'}</p>
                    
                    {result.debug.endpoints && result.debug.endpoints.length > 0 && (
                      <div className="mt-2">
                        <strong>API 엔드포인트:</strong>
                        <ul className="ml-4 space-y-1">
                          {result.debug.endpoints.map((endpoint, index) => (
                            <li key={index} className="flex items-center">
                              <span className={`w-2 h-2 rounded-full mr-2 ${endpoint.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                              {endpoint.name}: {endpoint.status}
                              {endpoint.error && <span className="text-red-600 ml-2">({endpoint.error})</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {result.debug.errors && result.debug.errors.length > 0 && (
                      <div className="mt-2">
                        <strong>오류:</strong>
                        <ul className="ml-4 space-y-1">
                          {result.debug.errors.map((error, index) => (
                            <li key={index} className="text-red-600">• {error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
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