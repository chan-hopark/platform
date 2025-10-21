// components/SectionBox.jsx
import React from 'react';

const SectionBox = ({ className = '', children }) => {
  return (
    <div className={`border border-black rounded-3xl p-6 ${className}`}>
      {children}
    </div>
  );
};

export default SectionBox;