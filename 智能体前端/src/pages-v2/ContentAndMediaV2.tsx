import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, Image as ImageIcon, Package, Sparkles, Zap } from 'lucide-react';
import { imagePromptApi, type ImagePromptProject } from '../api/image-prompt';
import {
  ContentAndMedia,
  type ContentAndMediaAsset,
  type ContentAndMediaStat,
} from '../figma-exact/ContentAndMedia';
import { useToast } from '../components/ui/use-toast';
import ImageWorkbench from '../pages/ImageWorkbench';

function mapProjects(projects: ImagePromptProject[]): ContentAndMediaAsset[] {
  return projects.reduce<ContentAndMediaAsset[]>((assets, project) => {
    const status: ContentAndMediaAsset['status'] = project.status === 'failed'
      ? 'failed'
      : project.status === 'completed'
        ? 'approved'
        : 'pending';
    const base = {
      name: project.name || '未命名素材项目',
      size: '尺寸未返回',
      type: project.mode || '图片',
      linkedProducts: '未关联',
      isAI: true,
      status,
      platform: '本地素材',
    };

    if (project.images.length === 0) {
      assets.push({ ...base, id: project.id, image: null });
      return assets;
    }

    assets.push(...project.images.map((image): ContentAndMediaAsset => ({
        ...base,
        id: image.id,
        image: image.thumbnailUrl || image.url,
      })));
    return assets;
  }, []);
}

export default function ContentAndMediaV2() {
  const { addToast } = useToast();
  const [projects, setProjects] = useState<ImagePromptProject[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await imagePromptApi.list({ limit: 100 });
      setProjects(response.items);
    } catch (error) {
      addToast(error instanceof Error ? error.message : '素材项目读取失败', 'error');
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const recentAssets = useMemo(() => mapProjects(projects), [projects]);
  const completed = projects.filter((project) => project.status === 'completed').length;
  const pending = projects.filter((project) => project.status === 'draft' || project.status === 'generating').length;
  const imageCount = projects.reduce((total, project) => total + project.images.length, 0);
  const stats: ContentAndMediaStat[] = [
    { label: '真实素材数', value: String(imageCount), change: '/image-prompt', trend: 'up', icon: ImageIcon },
    { label: 'AI 项目', value: String(projects.length), change: '真实项目', trend: 'up', icon: Sparkles },
    { label: '处理中', value: String(pending), change: '草稿或生成中', trend: pending > 0 ? 'down' : 'up', icon: Clock },
    { label: '已完成项目', value: String(completed), change: '生成状态', trend: 'up', icon: Package },
    { label: '节省时间', value: '未测算', change: '无真实数据', trend: 'up', icon: Zap },
  ];

  return (
    <ContentAndMedia
      stats={stats}
      recentAssets={recentAssets}
      loading={loading}
      studioPanel={<ImageWorkbench embedded />}
    />
  );
}
