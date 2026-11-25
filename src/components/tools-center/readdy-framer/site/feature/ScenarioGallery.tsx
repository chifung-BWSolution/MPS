interface ScenarioItem {
  image: string;
  alt: string;
  title: string;
  description?: string;
}

interface ScenarioGalleryProps {
  heading?: string;
  subheading?: string;
  items: ScenarioItem[];
  columns?: 2 | 3 | 4;
}

export default function ScenarioGallery({
  heading = '常見場景',
  subheading,
  items,
  columns = 4,
}: ScenarioGalleryProps) {
  const colClass =
    columns === 2
      ? 'sm:grid-cols-2'
      : columns === 3
        ? 'sm:grid-cols-2 lg:grid-cols-3'
        : 'sm:grid-cols-2 lg:grid-cols-4';

  return (
    <div>
      {heading && (
        <h2 className="font-heading text-xl md:text-2xl font-bold text-foreground-950 mb-3">
          {heading}
        </h2>
      )}
      {subheading && (
        <p className="text-sm md:text-base text-foreground-600 leading-relaxed mb-6 max-w-3xl">
          {subheading}
        </p>
      )}
      <div className={`grid grid-cols-1 ${colClass} gap-4 md:gap-5`}>
        {items.map((item) => (
          <div
            key={item.title}
            className="bg-background-50 border border-background-200/70 rounded-lg overflow-hidden hover:border-primary-300 transition-all"
          >
            <div className="w-full aspect-[4/3] overflow-hidden">
              <img
                src={item.image}
                alt={item.alt}
                title={item.title}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover object-top"
              />
            </div>
            <div className="p-4 md:p-5">
              <h4 className="font-heading text-sm md:text-base font-semibold text-foreground-950">
                {item.title}
              </h4>
              {item.description ? (
                <p className="text-sm md:text-base text-foreground-600 leading-relaxed mt-1.5">
                  {item.description}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}