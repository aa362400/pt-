import { Injectable } from '@nestjs/common';
import { DAILY_RESEARCH_SCHEMA_VERSION } from '../contracts/daily-product-research.contract.js';

interface ReportCandidate {
  candidateId?: string;
  canonicalName?: string;
  finalScore?: number;
  decision?: string;
}

interface DailyReportInput {
  businessDate: string;
  timezone: string;
  runStatus: string;
  partialData: boolean;
  scoringVersion: string;
  sourceHealth: Array<{ source: string; status: string }>;
  testNow: ReportCandidate[];
  watch: ReportCandidate[];
  hold: ReportCandidate[];
  rejected: ReportCandidate[];
}

@Injectable()
export class DailyReportRendererService {
  render(input: DailyReportInput) {
    const summary = {
      collected:
        input.testNow.length +
        input.watch.length +
        input.hold.length +
        input.rejected.length,
      eligible: input.testNow.length + input.watch.length + input.hold.length,
      testNow: input.testNow.length,
      watch: input.watch.length,
      hold: input.hold.length,
      rejected: input.rejected.length,
    };
    const topJson = {
      schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION,
      businessDate: input.businessDate,
      timezone: input.timezone,
      status: input.runStatus,
      partialData: input.partialData,
      scoringVersion: input.scoringVersion,
      summary,
      items: input.testNow,
    };
    const topSection =
      input.testNow.length === 0
        ? '今日暂无达到“立即打样”标准的新产品。不会放宽门槛凑数。'
        : input.testNow
            .map(
              (item, index) =>
                `### ${index + 1}. ${this.safeText(item.canonicalName ?? item.candidateId ?? '未命名候选')}\n\n- 总分：${item.finalScore ?? 'unknown'}`,
            )
            .join('\n\n');
    const health = input.sourceHealth.length
      ? input.sourceHealth
          .map(
            (source) =>
              `- ${this.safeText(source.source)}：${this.safeText(source.status)}`,
          )
          .join('\n')
      : '- 没有来源健康记录';
    const markdown = `# 每日精准选品报告\n\n## 运行摘要\n\n- 业务日期：${input.businessDate}\n- 时区：${input.timezone}\n- 状态：${input.runStatus}\n- 部分数据：${input.partialData ? '是' : '否'}\n- 评分版本：${this.safeText(input.scoringVersion)}\n\n## 今日值得行动的产品\n\n${topSection}\n\n## 观察池摘要\n\n共 ${summary.watch} 项。\n\n## 淘汰与暂缓摘要\n\n暂缓 ${summary.hold} 项，淘汰 ${summary.rejected} 项。\n\n## 数据源健康与异常\n\n${health}\n\n## 方法、版本和免责声明\n\n所有数值必须来自已保存证据；unknown 不按 0 处理。外部平台写操作必须人工批准。\n`;

    return { markdown, topJson };
  }

  private safeText(value: string): string {
    return value
      .replace(/[<>]/g, '')
      .replace(/[\r\n]+/g, ' ')
      .slice(0, 500);
  }
}
