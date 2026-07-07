import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Upload,
  Sparkles,
  Download,
  RefreshCw,
  ImageOff,
  CheckCircle2,
} from 'lucide-react';
import RobotIllustration from '../components/ui/RobotIllustration';
import { useToast } from '../components/ui/use-toast.ts';
import {
  createImageGenerationRun,
  getAgentRun,
  type AgentRun,
} from '../api/agentRuns';
import { ApiRequestError } from '../api/client';

const POLL_INTERVAL_MS = 3000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type Phase = 'idle' | 'submitting' | 'polling' | 'done' | 'failed';

function ImageWorkbench() {
  const { t } = useTranslation();
  const { addToast } = useToast();

  // 表单
  const [productName, setProductName] = useState('');
  const [sceneCount, setSceneCount] = useState(5);
  const [message, setMessage] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 任务状态
  const [phase, setPhase] = useState<Phase>('idle');
  const [run, setRun] = useState<AgentRun | null>(null);
  const [errorText, setErrorText] = useState('');
  const pollTimer = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) {
      window.clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      addToast(t('imageWorkbench.selectImageFile'), 'error');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      addToast(t('imageWorkbench.imageTooLarge'), 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const startPolling = useCallback(
    (runId: string) => {
      stopPolling();
      pollTimer.current = window.setInterval(() => {
        void (async () => {
          try {
            const latest = await getAgentRun(runId);
            setRun(latest);
            if (latest.status === 'COMPLETED') {
              stopPolling();
              setPhase('done');
              addToast(t('imageWorkbench.generationDone'), 'success');
            } else if (
              latest.status === 'FAILED' ||
              latest.status === 'CANCELLED' ||
              latest.status === 'TIMEOUT'
            ) {
              stopPolling();
              setPhase('failed');
              setErrorText(latest.errorMessage || t('imageWorkbench.generationFailed'));
            }
          } catch {
            // 单次轮询失败不终止任务，下一轮继续
          }
        })();
      }, POLL_INTERVAL_MS);
    },
    [addToast, stopPolling, t],
  );

  const handleSubmit = async () => {
    if (!productName.trim()) {
      addToast(t('imageWorkbench.fillProductName'), 'error');
      return;
    }
    if (!imageDataUrl) {
      addToast(t('imageWorkbench.uploadImageFirst'), 'error');
      return;
    }
    setPhase('submitting');
    setErrorText('');
    setRun(null);
    try {
      const created = await createImageGenerationRun({
        productName: productName.trim(),
        imageBase64: imageDataUrl,
        sceneCount,
        message: message.trim() || undefined,
      });
      setRun(created);
      setPhase('polling');
      startPolling(created.id);
    } catch (err) {
      setPhase('failed');
      setErrorText(
        err instanceof ApiRequestError
          ? err.message
          : t('imageWorkbench.submitFailed'),
      );
    }
  };

  const handleReset = () => {
    stopPolling();
    setPhase('idle');
    setRun(null);
    setErrorText('');
  };

  const output = run?.output ?? null;
  const generating = phase === 'submitting' || phase === 'polling';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <RobotIllustration size="md" variant="working" />
        <div>
          <h2 className="text-xl font-bold text-[#1A1A2E]">{t('imageWorkbench.title')}</h2>
          <p className="text-sm text-[#6B7280] mt-1">
            {t('imageWorkbench.subtitle')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* 左侧：任务表单 */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm space-y-4">
            {/* 上传 */}
            <div>
              <p className="text-sm font-semibold text-[#1A1A2E] mb-2">{t('imageWorkbench.productImage')}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={generating}
                className="w-full rounded-xl border-2 border-dashed border-[#E8E8F0] hover:border-[#6C63FF] transition-colors overflow-hidden disabled:opacity-60"
              >
                {imageDataUrl ? (
                  <img
                    src={imageDataUrl}
                    alt={t('imageWorkbench.productImage')}
                    className="w-full max-h-56 object-contain bg-[#F8F9FF]"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 py-10 text-[#8B93B5]">
                    <Upload size={22} />
                    <span className="text-xs">{t('imageWorkbench.uploadHint')}</span>
                  </div>
                )}
              </button>
            </div>

            {/* 产品名 */}
            <div>
              <label
                htmlFor="product-name"
                className="mb-1.5 block text-sm font-semibold text-[#1A1A2E]"
              >
                {t('imageWorkbench.productName')}
              </label>
              <input
                id="product-name"
                type="text"
                value={productName}
                disabled={generating}
                onChange={(e) => setProductName(e.target.value)}
                placeholder={t('imageWorkbench.productNamePlaceholder')}
                className="w-full rounded-lg border border-[#E8E8F0] bg-[#F8F9FF] px-3 py-2 text-sm outline-none focus:border-[#6C63FF] disabled:opacity-60"
              />
            </div>

            {/* 张数 */}
            <div>
              <p className="text-sm font-semibold text-[#1A1A2E] mb-2">{t('imageWorkbench.sceneCount')}</p>
              <div className="flex gap-2">
                {[3, 5, 9].map((n) => (
                  <button
                    key={n}
                    onClick={() => setSceneCount(n)}
                    disabled={generating}
                    className={`flex-1 rounded-lg border py-2 text-sm transition-colors disabled:opacity-60 ${
                      sceneCount === n
                        ? 'border-[#6C63FF] bg-[#F0EEFF] text-[#6C63FF] font-medium'
                        : 'border-[#E8E8F0] text-[#4A5578] hover:border-[#6C63FF]'
                    }`}
                  >
                    {n} {t('imageWorkbench.sceneCountUnit')}
                  </button>
                ))}
              </div>
            </div>

            {/* 补充要求 */}
            <div>
              <label
                htmlFor="gen-message"
                className="mb-1.5 block text-sm font-semibold text-[#1A1A2E]"
              >
                {t('imageWorkbench.extraRequirements')}
              </label>
              <textarea
                id="gen-message"
                value={message}
                disabled={generating}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('imageWorkbench.extraPlaceholder')}
                className="w-full h-16 rounded-lg border border-[#E8E8F0] bg-[#F8F9FF] p-2.5 text-xs outline-none resize-none focus:border-[#6C63FF] disabled:opacity-60"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[t('imageWorkbench.sceneKitchen'), t('imageWorkbench.sceneGym'), t('imageWorkbench.sceneOutdoor'), t('imageWorkbench.sceneOffice')].map((scene) => (
                  <button
                    key={scene}
                    disabled={generating}
                    onClick={() =>
                      setMessage((prev) =>
                        prev.includes(scene) ? prev : `${prev} ${scene}`.trim(),
                      )
                    }
                    className="rounded-lg bg-[#F0EEFF] px-2.5 py-1.5 text-xs text-[#6C63FF] hover:bg-[#E5DEFF] transition-colors disabled:opacity-60"
                  >
                    {scene}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => void handleSubmit()}
              disabled={generating}
              data-testid="btn-generate"
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#6C63FF] to-[#8B7CFF] py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {generating ? (
                <>
                  <RefreshCw size={15} className="animate-spin" /> {t('imageWorkbench.generating')}
                </>
              ) : (
                <>
                  <Sparkles size={15} /> {t('imageWorkbench.startGeneration')}
                </>
              )}
            </button>
          </div>
        </div>

        {/* 右侧：任务进度与结果 */}
        <div className="col-span-12 lg:col-span-8">
          <div className="rounded-xl border border-[#E8E8F0] bg-white p-5 shadow-sm min-h-[420px]">
            {phase === 'idle' && (
              <div className="flex flex-col items-center justify-center h-[380px] text-[#8B93B5] gap-3">
                <Sparkles size={32} className="text-[#6C63FF]" />
                <p className="text-sm">{t('imageWorkbench.idleHint')}</p>
                <p className="text-xs">
                  {t('imageWorkbench.idleDesc')}
                </p>
              </div>
            )}

            {generating && (
              <div className="flex flex-col items-center justify-center h-[380px] gap-4">
                <div className="h-10 w-10 rounded-full border-3 border-[#6C63FF] border-t-transparent animate-spin" />
                <p className="text-sm text-[#1A1A2E] font-medium">
                  {phase === 'submitting' ? t('imageWorkbench.submitting') : t('imageWorkbench.generatingImages')}
                </p>
                <p className="text-xs text-[#8B93B5]">
                  {t('imageWorkbench.taskId', { id: run?.id ?? '—', status: run?.status ?? 'PENDING' })}
                </p>
                <p className="text-xs text-[#8B93B5]">
                  {t('imageWorkbench.estimatedTime')}
                </p>
              </div>
            )}

            {phase === 'failed' && (
              <div className="flex flex-col items-center justify-center h-[380px] gap-4">
                <ImageOff size={32} className="text-[#FF5A6A]" />
                <p className="text-sm text-[#1A1A2E] font-medium">{t('imageWorkbench.generationFailed')}</p>
                <p className="text-xs text-[#8B93B5] max-w-md text-center">{errorText}</p>
                <div className="flex gap-3">
                  <button
                    onClick={handleReset}
                    className="rounded-lg border border-[#E8E8F0] px-4 py-2 text-sm text-[#4A5578] hover:border-[#6C63FF] hover:text-[#6C63FF] transition-colors"
                  >
                    <RefreshCw size={14} className="inline mr-1 -mt-0.5" /> {t('imageWorkbench.restart')}
                  </button>
                  <button
                    onClick={() => void handleSubmit()}
                    className="rounded-lg bg-gradient-to-r from-[#6C63FF] to-[#8B7CFF] px-4 py-2 text-sm text-white transition-opacity hover:opacity-90"
                  >
                    <RefreshCw size={14} className="inline mr-1 -mt-0.5" /> {t('imageWorkbench.retry')}
                  </button>
                </div>
              </div>
            )}

            {phase === 'done' && output && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-[#34D399]" />
                    <span className="text-sm font-semibold text-[#1A1A2E]">
                      {t('imageWorkbench.generationComplete', { count: output.images.length })}
                    </span>
                    {typeof output.consistencyScore === 'number' && (
                      <span className="text-xs bg-[#34D399]/10 text-[#34D399] px-2 py-0.5 rounded">
                        {t('imageWorkbench.consistency', { score: output.consistencyScore })}
                      </span>
                    )}
                    {output.mockMode && (
                      <span className="text-xs bg-[#F59E0B]/10 text-[#F59E0B] px-2 py-0.5 rounded">
                        {t('imageWorkbench.mockMode')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {output.downloadUrl && (
                      <a
                        href={output.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 rounded-lg bg-[#6C63FF] px-3 py-1.5 text-xs text-white hover:bg-[#5B52EE] transition-colors"
                      >
                        <Download size={13} /> {t('imageWorkbench.downloadPackage')}
                      </a>
                    )}
                    <button
                      onClick={handleReset}
                      className="flex items-center gap-1.5 rounded-lg border border-[#E8E8F0] px-3 py-1.5 text-xs text-[#4A5578] hover:border-[#6C63FF] transition-colors"
                    >
                      <RefreshCw size={13} /> {t('imageWorkbench.doAnother')}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {output.images.map((img) => (
                    <a
                      key={img.sceneId || img.url}
                      href={img.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group rounded-xl border border-[#E8E8F0] overflow-hidden hover:border-[#6C63FF] transition-colors"
                    >
                      <img
                        src={img.url}
                        alt={img.sceneId}
                        loading="lazy"
                        className="w-full aspect-square object-cover bg-[#F8F9FF]"
                      />
                      <p className="px-2.5 py-1.5 text-[10px] text-[#8B93B5] truncate group-hover:text-[#6C63FF]">
                        {img.sceneId || img.filename}
                      </p>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ImageWorkbench;
