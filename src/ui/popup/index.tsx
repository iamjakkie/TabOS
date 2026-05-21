import React from 'react';
import { createRoot } from 'react-dom/client';
import Popup from './Popup';
import '../../../assets/styles/theme.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<Popup />);
}
