import { ArrowLeft, Camera, Check, ExternalLink, MessageCircle } from 'lucide-react'
import type { MaintenanceGuideData } from '../data/maintenance'

interface MaintenancePageProps {
  guide: MaintenanceGuideData
}

export const MaintenancePage = ({ guide }: MaintenancePageProps) => (
  <div className="min-h-screen bg-canvas">
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-5 sm:py-8">
      {/* Kepala halaman */}
      <header className="flex flex-col gap-3">
        <a
          href="#/maintenance"
          className="inline-flex w-fit min-h-11 items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-muted transition-colors hover:bg-white hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Maintenance
        </a>
        <div>
          <p
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-white"
            style={{ backgroundColor: guide.accentVar }}
          >
            {guide.badge}
          </p>
          <h1 className="mt-2 text-2xl font-extrabold text-ink sm:text-3xl">
            {guide.title}
          </h1>
          <p className="mt-1 text-sm text-muted sm:text-base">{guide.intro}</p>
        </div>
        <dl className="flex flex-wrap gap-2">
          {guide.meta.map((item) => (
            <div
              key={item.label}
              className="flex items-baseline gap-1.5 rounded-xl border border-line bg-white px-3 py-1.5"
            >
              <dt className="text-xs font-semibold text-muted">{item.label}:</dt>
              <dd className="text-xs font-bold text-ink sm:text-sm">{item.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      {/* Langkah-langkah */}
      <ol className="flex flex-col gap-4">
        {guide.steps.map((step, index) => (
          <li key={step.title} className="card flex flex-col gap-3 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ backgroundColor: guide.accentVar }}
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <h2 className="text-base font-bold text-ink sm:text-lg">{step.title}</h2>
            </div>
            <ul className="ml-1 space-y-1.5">
              {step.points.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-2 text-sm text-muted sm:text-base"
                >
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0"
                    style={{ color: guide.accentVar }}
                    aria-hidden="true"
                  />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            {step.video ? (
              <div className="flex flex-col gap-2">
                <div className="aspect-video w-full overflow-hidden rounded-xl border border-line bg-black">
                  <iframe
                    src={step.video.embedUrl}
                    title={step.video.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="h-full w-full"
                  />
                </div>
                <a
                  href={step.video.watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-muted transition-colors hover:text-ink sm:text-sm"
                >
                  Tonton di YouTube: {step.video.title}
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
            ) : null}
            {step.settings && step.settings.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {step.settings.map((setting) => (
                  <div
                    key={setting.code}
                    className="flex items-center justify-between rounded-xl border border-line bg-white px-3 py-2"
                  >
                    <span className="text-sm font-bold" style={{ color: guide.accentVar }}>
                      {setting.code}
                    </span>
                    <span className="text-sm font-bold text-ink">{setting.value}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {step.takePicture ? (
              <p className="inline-flex w-fit items-center gap-2 rounded-full border border-[#f4cfd0] bg-[#fdf0f0] px-3 py-1.5 text-xs font-bold text-[#8a2226] sm:text-sm">
                <Camera className="h-4 w-4" aria-hidden="true" />
                Wajib ambil gambar: {step.takePicture}
              </p>
            ) : null}
            {step.photos && step.photos.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {step.photos.map((photo) => (
                  <figure key={photo.path} className="max-w-[46%] flex-1 sm:max-w-[220px]">
                    <img
                      src={`${import.meta.env.BASE_URL}${photo.path}`}
                      alt={photo.alt}
                      loading="lazy"
                      className="h-36 w-full rounded-xl border border-line bg-white object-cover sm:h-40"
                    />
                    {photo.caption ? (
                      <figcaption className="mt-1 text-center text-xs text-muted">
                        {photo.caption}
                      </figcaption>
                    ) : null}
                  </figure>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      {/* Langkah akhir */}
      <section
        className="rounded-2xl border p-4 sm:p-5"
        style={{
          borderColor: `color-mix(in srgb, ${guide.accentVar} 35%, #ffffff)`,
          backgroundColor: `color-mix(in srgb, ${guide.accentVar} 8%, #ffffff)`,
        }}
      >
        <h2
          className="flex items-center gap-2 text-base font-bold sm:text-lg"
          style={{ color: guide.accentVar }}
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
          {guide.finalTitle}
        </h2>
        <ul className="mt-2 space-y-1.5">
          {guide.finalPoints.map((point) => (
            <li
              key={point}
              className="flex items-start gap-2 text-sm text-ink sm:text-base"
            >
              <Check
                className="mt-0.5 h-4 w-4 shrink-0"
                style={{ color: guide.accentVar }}
                aria-hidden="true"
              />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="pb-4 text-center text-xs text-muted">
        Rujukan: SOP {guide.title} — Production Team
      </p>
    </div>
  </div>
)
