// components/SearchPage.jsx
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import SectionBox from './SectionBox';

const ProductCard = () => {
  return (
    <div className="border border-black rounded-3xl p-4 flex items-center gap-4">
      <div className="border border-black rounded-2xl w-20 h-20 flex items-center justify-center">
        썸네일
      </div>
      <div className="border border-black rounded-2xl px-3 py-2">체크박스</div>
      <div className="flex-1">
        <div className="border border-black rounded-2xl px-4 py-2 inline-block">
          상품명, 우측 갱신 시간 및 갱신버튼
        </div>
      </div>
      <div className="border border-black rounded-2xl px-4 py-2">가격</div>
    </div>
  );
};

const SearchPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const open = (path) => navigate(path, { state: { backgroundLocation: location } });

  return (
    <div className="py-6">
      <div className="grid grid-cols-12 gap-6">
        {/* 좌열: 로고/필터/카테고리 섹션 이미지 느낌 */}
        <div className="col-span-12 md:col-span-3 space-y-6">
          <SectionBox className="text-center">로고</SectionBox>
          <SectionBox className="text-center">필터</SectionBox>
          <SectionBox className="h-96 flex items-center justify-center">카테고리</SectionBox>
        </div>

        {/* 중앙 컨텐츠 */}
        <div className="col-span-12 md:col-span-6 space-y-6">
          <SectionBox className="text-center">검색 창</SectionBox>
          <SectionBox className="text-center">선호도</SectionBox>

          <SectionBox>
            <div className="mb-4 flex items-center justify-between gap-3">
              <button onClick={() => open('/compare-modal')} className="border border-black rounded-2xl px-4 py-2">
                비교하기
              </button>
            </div>

            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <ProductCard key={i} />
              ))}
            </div>
            <div className="mt-4 text-sm text-center text-[#333333]">상품영역</div>
          </SectionBox>
        </div>

        {/* 우열: URL 입력 버튼 + 키워드 관련 배너 */}
        <div className="col-span-12 md:col-span-3 space-y-6">
          <button
            onClick={() => open('/url-modal')}
            className="w-full border border-black rounded-3xl px-6 py-4"
          >
            URL 입력 버튼 (클릭시 팝업)
          </button>
          <SectionBox className="h-96 flex items-center justify-center">
            키워드 관련 사이드 배너
          </SectionBox>
        </div>
      </div>
    </div>
  );
};

export default SearchPage;