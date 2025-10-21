// components/HomePage.jsx
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import SectionBox from './SectionBox';

const HomePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const open = (path) => navigate(path, { state: { backgroundLocation: location } });

  return (
    <div className="py-6">
      {/* 상단 영역: 로고/검색/로그인은 헤더에서 처리 */}
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

      {/* 홈 화면에서는 하단 데모 버튼 제거 */}
    </div>
  );
};

export default HomePage;