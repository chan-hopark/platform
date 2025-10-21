// App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import HomePage from './components/HomePage';
import SearchPage from './components/SearchPage';
import UrlModal from './components/UrlModal';
import CompareModal from './components/CompareModal';

const ModalRoutes = () => {
  const location = useLocation();
  const state = location.state as { backgroundLocation?: Location };
  const background = state && state.backgroundLocation ? state.backgroundLocation : null;

  return (
    <>
      <Routes location={background || location}>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        {/* 모달 전용 라우트도 기본적으로 페이지처럼 표시되도록 처리 */}
        <Route path="/url-modal" element={<HomePage />} />
        <Route path="/compare-modal" element={<SearchPage />} />
      </Routes>

      {/* 모달 오버레이 라우트 */}
      {background && (
        <Routes>
          <Route path="/url-modal" element={<UrlModal />} />
          <Route path="/compare-modal" element={<CompareModal />} />
        </Routes>
      )}
    </>
  );
};

const App = () => {
  return (
    <div className="min-h-screen bg-white text-[#333333]">
      {/* 웹폰트 */}
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap" rel="stylesheet" />
      <style>{`body { font-family: 'Noto Sans KR', system-ui, -apple-system, Segoe UI, Roboto, 'Pretendard', sans-serif; }`}</style>

      <BrowserRouter>
        <SiteHeader />
        <ModalEntryWrapper />
      </BrowserRouter>
    </div>
  );
};

const SiteHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = React.useState('');
  const isHome = location.pathname === '/';
  const openWithBackground = (path) => {
    navigate(path, { state: { backgroundLocation: location } });
  };
  const goSearch = () => {
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  return (
    <div className="border-b border-black">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
        <Link to="/" className="border border-black rounded-2xl px-5 py-2">
          로고
        </Link>
        <div className="flex-1 max-w-2xl mx-6">
          <div className="border border-black rounded-2xl px-4 py-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') goSearch();
              }}
              placeholder="검색 창"
              className="w-full bg-transparent outline-none text-center"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isHome && (
            <button
              onClick={() => openWithBackground('/url-modal')}
              className="hidden sm:inline-block border border-black rounded-2xl px-4 py-2"
            >
              URL 입력 버튼
            </button>
          )}
          <button onClick={goSearch} className="border border-black rounded-2xl px-4 py-2">
            검색결과로
          </button>
          <div className="border border-black rounded-2xl px-4 py-2">로그인, 마이페이지 등</div>
        </div>
      </div>
    </div>
  );
};

const ModalEntryWrapper = () => {
  return (
    <div className="mx-auto max-w-7xl px-4">
      <ModalRoutes />
    </div>
  );
};

export default App;