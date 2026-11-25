export default function FloatingWhatsApp() {
  return (
    <a
      href="https://wa.me/85259335827?text=我想查詢%20BW%20Event%20Music%20的服務"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="WhatsApp 立即對話"
      className="group fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 md:bottom-6 md:right-6 z-40 w-12 h-12 md:w-14 md:h-14 rounded-full bg-accent-500 text-background-50 flex items-center justify-center shadow-lg hover:scale-110 hover:bg-accent-600 transition-all duration-300 animate-pulse-slow"
    >
      <i className="ri-whatsapp-line text-xl md:text-2xl" />
      {/* 提示標籤 —— 桌面端顯示 */}
      <span className="hidden lg:block absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-foreground-900 text-background-50 text-xs px-3 py-1.5 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        WhatsApp 我們
      </span>
    </a>
  );
}