import { useEffect, useState } from 'react';
import { useSiteScroll } from '../scrollRoot';

const VISIBLE_OFFSET = 600;

export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);
  const scrollerRef = useSiteScroll();

  useEffect(() => {
    const scroller = scrollerRef?.current;
    const handleScroll = () => {
      const top = scroller ? scroller.scrollTop : window.scrollY;
      setVisible(top > VISIBLE_OFFSET);
    };
    handleScroll();
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener('scroll', handleScroll, { passive: true });
    return () => target.removeEventListener('scroll', handleScroll);
  }, [scrollerRef]);

  const handleClick = () => {
    const scroller = scrollerRef?.current;
    if (scroller) {
      scroller.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="回到頁面頂部"
      title="回到頂部"
      className={`group fixed right-4 bottom-[calc(max(1rem,env(safe-area-inset-bottom))+3.75rem)] md:right-6 md:bottom-[calc(1.5rem+4.25rem)] z-40 w-12 h-12 md:w-14 md:h-14 rounded-full bg-secondary-500 text-background-50 flex items-center justify-center shadow-lg hover:scale-110 hover:bg-secondary-600 transition-all duration-300 lg:hidden ${
        visible
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 translate-y-3 pointer-events-none'
      }`}
    >
      <i className="ri-arrow-up-line text-xl md:text-2xl" />
      {/* 提示標籤 —— 平板顯示 */}
      <span className="hidden md:block absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-foreground-900 text-background-50 text-xs px-3 py-1.5 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        回到頂部
      </span>
    </button>
  );
}