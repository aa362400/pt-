import type {
  AgentChannelHealthSnapshot,
  AiChannelSnapshot,
  AiChannelStatus,
} from '../api/agentHealth';

export type AiChannelName = 'llm' | 'image' | 'search';

const channelLabels: Record<AiChannelName, string> = {
  llm: '大模型',
  image: '图片生成',
  search: '联网搜索',
};

const statusLabels: Record<AiChannelStatus, string> = {
  available: '可用',
  degraded: '降级可用',
  quota_exhausted: '额度不足',
  unavailable: '不可用',
  unconfigured: '未配置',
  unknown: '尚未确认',
};

export function aiChannelLabel(channel: AiChannelName): string {
  return channelLabels[channel];
}

export function aiChannelStatusLabel(status: AiChannelStatus): string {
  return statusLabels[status];
}

export function aiChannelDetail(channel: AiChannelName, state: AiChannelSnapshot | undefined): string {
  if (!state) return '尚无可验证结果';
  if (state.status === 'available') return '真实探测已通过';
  if (state.status === 'degraded') return '已配置，但尚未完成实际能力验证';
  if (state.status === 'quota_exhausted') return '服务额度不足，请联系管理员补充额度';
  if (state.status === 'unconfigured') return '尚未配置可用服务';
  if (state.errorCode?.includes('INVALID_KEY')) return '服务密钥无效，请联系管理员更换';
  if (channel === 'image') return '图片生成服务当前不可用';
  return `${aiChannelLabel(channel)}服务当前不可用`;
}

export function channelPreflightWarnings(
  snapshot: AgentChannelHealthSnapshot,
  requiredChannels: AiChannelName[],
): string[] {
  if (snapshot.agentConnection !== 'connected') {
    return ['Python 智能体当前不可连接，启动后可能立即失败；可先刷新通道状态。'];
  }
  const warnings: string[] = [];
  for (const channel of requiredChannels) {
    const status = snapshot[channel].status;
    if (status === 'available') continue;
    const label = aiChannelLabel(channel);
    if (status === 'quota_exhausted') {
      warnings.push(
        `${label}通道额度不足，本次任务可能只能保留已有证据或部分完成。`,
      );
    } else if (channel === 'image') {
      warnings.push('图片生成通道不可用，本次任务可能无法生成商品图片。');
    } else if (status === 'degraded') {
      warnings.push(`${label}通道正在降级运行，任务耗时或结果完整度可能受影响。`);
    } else {
      warnings.push(`${label}通道不可用，本次任务可能失败或部分完成。`);
    }
  }
  return warnings;
}

export function aiChannelTone(status: AiChannelStatus): string {
  if (status === 'available') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'degraded' || status === 'unknown') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-red-200 bg-red-50 text-red-700';
}
