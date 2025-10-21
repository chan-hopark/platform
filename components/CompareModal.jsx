// components/CompareModal.jsx
import React from 'react';
import Modal from './Modal';

const CompareModal = () => {
  return (
    <Modal>
      <div className="space-y-6">
        <div className="border border-black rounded-3xl px-6 py-4 text-center">
          비교 상품 목록
        </div>

        <div className="border border-black rounded-3xl h-64 md:h-80 flex items-center justify-center">
          비교표
        </div>

        <div className="border border-black rounded-3xl h-40 flex items-center justify-center">
          요약표
        </div>

        <div className="flex flex-wrap gap-4 justify-center">
          {['도움 돼요', '내용 이상해요', '장바구니 담기', 'AI 피드백 받기'].map((label) => (
            <button key={label} className="border border-black rounded-3xl px-6 py-3">
              {label}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
};

export default CompareModal;