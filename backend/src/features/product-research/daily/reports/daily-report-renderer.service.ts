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
        ? 'english_textnonetext“english_text”english_text。english_text。'
        : input.testNow
            .map(
              (item, index) =>
                `### ${index + 1}. ${this.safeText(item.canonicalName ?? item.candidateId ?? 'english_text')}\n\n- text：${item.finalScore ?? 'unknown'}`,
            )
            .join('\n\n');
    const health = input.sourceHealth.length
      ? input.sourceHealth
          .map(
            (source) =>
              `- ${this.safeText(source.source)}：${this.safeText(source.status)}`,
          )
          .join('\n')
      : '- textyessourceenglish_text';
    const markdown = `# english_textproduct researchreport\n\n## english_text\n\n- english_text：${input.businessDate}\n- text：${input.timezone}\n- status：${input.runStatus}\n- textdata：${input.partialData ? 'yes' : 'no'}\n- english_text：${this.safeText(input.scoringVersion)}\n\n## english_text\n\n${topSection}\n\n## english_text\n\ntext ${summary.watch} text。\n\n## english_text\n\ntext ${summary.hold} text，text ${summary.rejected} text。\n\n## dataenglish_text\n\n${health}\n\n## text、english_text\n\ntextyesenglish_textevidence；unknown text 0 text。textplatformenglish_texthumantext。\n`;

    return { markdown, topJson };
  }

  private safeText(value: string): string {
    return value
      .replace(/[<>]/g, '')
      .replace(/[\r\n]+/g, ' ')
      .slice(0, 500);
  }
}
