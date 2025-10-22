// components/UrlModal.jsx
import React from 'react';
import Modal from './Modal';

const API_BASE = import.meta.env.VITE_API_BASE || 'https://platform-production-865a.up.railway.app'; // Railway 배포 URL

const UrlModal = () => {
  const [url, setUrl] = React.useState('');
  const [status, setStatus] = React.useState('idle'); // idle | loading | done | error
  const [extractedData, setExtractedData] = React.useState(null);
  const [error, setError] = React.useState('');

  const onExtract = async () => {
    if (!url) return;
    
    // 네이버 스마트스토어 URL 검증
    if (!url.includes('smartstore.naver.com')) {
      setError('네이버 스마트스토어 URL만 지원됩니다.');
      return;
    }
    
    try {
      setStatus('loading');
      setError('');
      setExtractedData(null);
      
      console.log('🚀 API 호출 시작:', `${API_BASE}/api/extract`);
      console.log('📝 요청 URL:', url);
      
      const requestBody = { url };
      console.log('📦 요청 본문:', requestBody);
      
      const res = await fetch(`${API_BASE}/api/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify(requestBody)
      });
      
      console.log('📡 응답 상태:', res.status, res.statusText);
      console.log('📡 응답 헤더:', Object.fromEntries(res.headers.entries()));
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('❌ 에러 응답 본문:', errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }
        
        throw new Error(`서버 오류 (${res.status}): ${errorData.message || errorText}`);
      }
      
      const responseText = await res.text();
      console.log('📄 응답 본문:', responseText);
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ JSON 파싱 오류:', parseError);
        throw new Error(`응답 파싱 오류: ${parseError.message}`);
      }
      
      console.log('✅ 파싱된 데이터:', data);
      setExtractedData(data.data);
      setStatus('done');
    } catch (e) {
      setStatus('error');
      const errorMessage = `데이터 추출 중 오류가 발생했습니다.\n\n상세 정보:\n- 에러: ${e?.message || '알 수 없는 오류'}\n- API URL: ${API_BASE}/api/extract\n- 요청 URL: ${url}`;
      setError(errorMessage);
      console.error('❌ 전체 에러 정보:', {
        message: e?.message,
        stack: e?.stack,
        name: e?.name,
        apiBase: API_BASE,
        requestUrl: url
      });
    }
  };

  return (
    <Modal>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="flex-1 border border-black rounded-3xl px-4 py-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onExtract(); }}
              placeholder="네이버 스마트스토어 URL 입력"
              className="w-full bg-transparent outline-none text-center"
            />
          </div>
          <button 
            onClick={onExtract} 
            disabled={status === 'loading'}
            className="border border-black rounded-3xl px-6 py-3 disabled:opacity-50"
          >
            {status === 'loading' ? '추출 중...' : '데이터 추출'}
          </button>
        </div>

        {error && (
          <div className="border border-red-500 rounded-3xl p-4 text-red-600 bg-red-50">
            {error}
          </div>
        )}

        {status === 'loading' && (
          <div className="border border-black rounded-3xl min-h-[16rem] md:min-h-[26rem] p-4 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black mx-auto mb-4"></div>
              <div>데이터 추출 중...</div>
              <div className="text-sm text-gray-600 mt-2">브라우저가 자동으로 실행됩니다</div>
            </div>
          </div>
        )}

        {extractedData && (
          <div className="space-y-4">
            {/* 상품 정보 */}
            {extractedData.product && (
              <div className="border border-black rounded-3xl p-4">
                <h3 className="font-bold mb-3">🛍️ 상품 정보</h3>
                <div className="space-y-2">
                  {extractedData.product.name && (
                    <div><strong>상품명:</strong> {extractedData.product.name}</div>
                  )}
                  {extractedData.product.price && (
                    <div><strong>가격:</strong> {extractedData.product.price}</div>
                  )}
                  {extractedData.product.summary && (
                    <div><strong>요약:</strong> {extractedData.product.summary}</div>
                  )}
                </div>
              </div>
            )}

            {/* 리뷰 정보 */}
            {extractedData.reviews && extractedData.reviews.length > 0 && (
              <div className="border border-black rounded-3xl p-4">
                <h3 className="font-bold mb-3">⭐ 리뷰 ({extractedData.reviews.length}개)</h3>
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {extractedData.reviews.slice(0, 5).map((review, index) => (
                    <div key={index} className="border border-gray-300 rounded-2xl p-3">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium">{review.author || '익명'}</span>
                        <span className="text-sm text-gray-600">{review.date}</span>
                      </div>
                      {review.rating && (
                        <div className="text-yellow-500 mb-2">⭐ {review.rating}</div>
                      )}
                      <div className="text-sm">{review.content}</div>
                    </div>
                  ))}
                  {extractedData.reviews.length > 5 && (
                    <div className="text-center text-gray-600 text-sm">
                      ... 외 {extractedData.reviews.length - 5}개 더
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Q&A 정보 */}
            {extractedData.qa && extractedData.qa.length > 0 && (
              <div className="border border-black rounded-3xl p-4">
                <h3 className="font-bold mb-3">❓ Q&A ({extractedData.qa.length}개)</h3>
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {extractedData.qa.slice(0, 3).map((qa, index) => (
                    <div key={index} className="border border-gray-300 rounded-2xl p-3">
                      <div className="font-medium mb-2">Q: {qa.question}</div>
                      {qa.answer && (
                        <div className="text-sm text-gray-700 ml-4">A: {qa.answer}</div>
                      )}
                    </div>
                  ))}
                  {extractedData.qa.length > 3 && (
                    <div className="text-center text-gray-600 text-sm">
                      ... 외 {extractedData.qa.length - 3}개 더
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-4 justify-center">
          {['도움 돼요', '내용 이상해요', '장바구니 담기', '데이터 저장'].map((label) => (
            <button key={label} className="border border-black rounded-3xl px-6 py-3">
              {label}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
};

export default UrlModal;