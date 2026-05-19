import { useState, useEffect } from 'react';
import { loadPortfolio } from '../utils/portfolioStore';

export function usePortfolio() {
  const [portfolio, setPortfolio] = useState(loadPortfolio);

  useEffect(() => {
    function sync() { setPortfolio(loadPortfolio()); }
    window.addEventListener('storage', sync);
    window.addEventListener('portfolio-hydrated', sync);
    window.addEventListener('portfolio-updated', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('portfolio-hydrated', sync);
      window.removeEventListener('portfolio-updated', sync);
    };
  }, []);

  return portfolio;
}
