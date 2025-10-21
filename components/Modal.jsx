// components/Modal.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';

const Modal = ({ children }) => {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => navigate(-1)}
        aria-label="모달 닫기 배경"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="relative w-full max-w-5xl bg-white border border-black rounded-3xl shadow-xl p-6 pt-12">
          <button
            onClick={() => navigate(-1)}
            className="absolute top-2 right-2 border border-black rounded-full w-9 h-9 flex items-center justify-center bg-white"
            aria-label="닫기"
          >
            ×
          </button>
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;