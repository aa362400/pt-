import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";

type CandidateEvidenceImageProps = {
  imageUrl: string | null;
  evidenceUrl: string | null;
  alt: string;
  size?: "table" | "detail";
};

export default function CandidateEvidenceImage({
  imageUrl,
  evidenceUrl,
  alt,
  size = "table",
}: CandidateEvidenceImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [imageUrl]);

  const sizeClass = size === "detail" ? "h-28 w-28" : "h-16 w-16";
  const media = imageUrl && !failed ? (
    <img
      src={imageUrl}
      alt={`${alt}真实来源图片`}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`shrink-0 border border-slate-200 bg-white object-contain ${sizeClass}`}
    />
  ) : (
    <div
      role="img"
      aria-label={`${alt}${failed ? "图片加载失败" : "暂无真实图片"}`}
      className={`grid shrink-0 place-items-center border border-slate-200 bg-slate-50 text-slate-400 ${sizeClass}`}
      title={failed ? "图片加载失败" : "暂无真实图片"}
    >
      <ImageOff className="h-5 w-5" aria-hidden="true" />
    </div>
  );

  return evidenceUrl ? (
    <a
      href={evidenceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex shrink-0 flex-col items-center gap-1 text-xs font-medium text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      aria-label={`打开${alt}的图片证据页`}
      title="打开图片证据页"
    >
      {media}
      <span>图片证据页</span>
    </a>
  ) : (
    media
  );
}
