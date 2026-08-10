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
      name: project.name || 'english_text',
      size: 'english_text',
      type: project.mode || 'image',
      linkedProducts: 'english_text',
      isAI: true,
      status,
      platform: 'localtext',
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
      addToast(error instanceof Error ? error.message : 'english_textreadfailed', 'error');
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
    { label: 'realenglish_text', value: String(imageCount), change: '/image-prompt', trend: 'up', icon: ImageIcon },
    { label: 'AI text', value: String(projects.length), change: 'realtext', trend: 'up', icon: Sparkles },
    { label: 'english_text', value: String(pending), change: 'english_textgenerationtext', trend: pending > 0 ? 'down' : 'up', icon: Clock },
    { label: 'textcompletedtext', value: String(completed), change: 'generationstatus', trend: 'up', icon: Package },
    { label: 'english_text', value: 'english_text', change: 'nonerealdata', trend: 'up', icon: Zap },
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
