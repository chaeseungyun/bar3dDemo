import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// 주의: StrictMode는 개발 모드에서 effect를 이중 실행해
// canvas의 WebGL 컨텍스트를 중복 생성하려다 충돌할 수 있어 사용하지 않는다.
createRoot(document.getElementById('root')).render(<App />);
