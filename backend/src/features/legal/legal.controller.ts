import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { Public } from '../../shared/auth/public.decorator.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { IsString, IsIn, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// ---------- DTOs ----------

export class RecordConsentDto {
  @ApiProperty({ description: 'Consent type', example: 'privacy' })
  @IsString()
  @IsIn(['privacy', 'terms'])
  type: 'privacy' | 'terms';

  @ApiProperty({
    description: 'Version of the policy consented to',
    example: '1.0',
  })
  @IsString()
  version: string;

  @ApiProperty({ description: 'Optional IP address override', required: false })
  @IsString()
  @IsOptional()
  ip?: string;
}

// ---------- Controller ----------

@ApiTags('Legal')
@Controller('legal')
export class LegalController {
  private readonly privacyContent = `
# Privacy Policy

## 1. Information We Collect
We collect information you provide directly to us, including:
- Account information (name, email address, password)
- Profile information (avatar, preferences, timezone)
- Usage data (agent interactions, sessions, listings, reports)
- Payment and billing information (processed securely by our payment partners)

## 2. How We Use Your Information
We use the collected information to:
- Provide, maintain, and improve our AI-powered e-commerce platform
- Process transactions and manage subscriptions
- Send technical notices, updates, and support messages
- Respond to your comments, questions, and requests
- Monitor and analyze trends, usage, and activities

## 3. Legal Basis (GDPR Art. 6)
We process your personal data under the following legal bases:
- **Consent (Art. 6(1)(a))**: For optional data processing activities
- **Contract (Art. 6(1)(b))**: To fulfill our Terms of Service and provide the platform
- **Legal obligation (Art. 6(1)(c))**: To comply with applicable laws and regulations
- **Legitimate interests (Art. 6(1)(f))**: For analytics, fraud prevention, and platform security

## 4. Data Retention
We retain your personal data only as long as necessary:
- Account data: until account deletion
- Session data: 90 days
- Agent run data: 180 days
- Token data: 24-48 hours
- Financial records: 7 years (tax compliance)
- Generated images: 30 days (draft), permanently (published)
- See our Data Retention Policy for complete details.

## 5. Your Rights (GDPR)
You have the following rights regarding your personal data:
- **Right to access**: Request a copy of your data
- **Right to rectification**: Correct inaccurate data
- **Right to erasure** ("Right to be forgotten"): Delete your account and data
- **Right to restrict processing**: Limit how we use your data
- **Right to data portability**: Export your data in a structured format
- **Right to object**: Object to processing based on legitimate interests

## 6. Third-Party Data Processors
We engage trusted third parties to process your data:
- **Cloud infrastructure**: AWS (Amazon Web Services)
- **AI/ML providers**: OpenAI, Anthropic
- **Payment processing**: Stripe
- **Email delivery**: SendGrid
- **Analytics**: PostHog

## 7. International Transfers
Your data may be transferred to and processed in countries other than your own.
We ensure appropriate safeguards (Standard Contractual Clauses) are in place
for international data transfers in compliance with GDPR requirements.

## 8. Security Measures
We implement appropriate technical and organizational measures to protect your data:
- Encryption at rest (AES-256) and in transit (TLS 1.3)
- Regular security audits and penetration testing
- Access controls and authentication (JWT, 2FA)
- Automated threat detection and monitoring
- Employee data protection training

## 9. Contact Information
For privacy-related inquiries, please contact:
- **Data Protection Officer**: dpo@shopmate-ai.com
- **Support**: support@shopmate-ai.com
- **Address**: ShopMate AI Ltd, [Company Address]

## 10. Updates to This Policy
We will notify you of material changes to this privacy policy via email
or through the platform. Continued use after changes constitutes acceptance.

*Last updated: July 2026*
`;

  private readonly termsContent = `
# Terms of Service

## 1. Acceptance of Terms
By accessing or using the ShopMate AI platform ("the Service"), you agree
to be bound by these Terms of Service. If you do not agree, do not use the Service.

## 2. Description of Service
ShopMate AI provides an AI-powered e-commerce platform that assists with:
- Product research and market analysis
- Listing optimization and keyword research
- Advertising strategy and profit analysis
- Image generation and creative content
- Customer insight and business intelligence

## 3. User Accounts and Registration
- You must provide accurate and complete information when creating an account
- You are responsible for maintaining the confidentiality of your credentials
- You must be at least 18 years old to use the Service
- One person per account; sharing accounts is prohibited

## 4. Subscriptions and Billing
- Subscription fees are billed in advance on a monthly or annual basis
- All fees are non-refundable except as required by applicable law
- We reserve the right to change pricing with 30 days notice
- Late payments may result in service suspension

## 5. Acceptable Use
You agree NOT to:
- Use the Service for any illegal purpose or in violation of any laws
- Attempt to reverse engineer, decompile, or hack the Service
- Upload malicious code or interfere with Service operations
- Use automated tools to scrape or extract data without authorization
- Impersonate any person or entity

## 6. Intellectual Property
- The Service and its original content are owned by ShopMate AI
- You retain rights to content you create using the Service
- You grant ShopMate AI a license to process your content to provide the Service
- Feedback and suggestions may be used to improve the Service

## 7. Data Privacy
Your use of the Service is governed by our Privacy Policy, which is incorporated
by reference into these Terms.

## 8. Limitation of Liability
- The Service is provided "as is" without warranties of any kind
- ShopMate AI is not liable for indirect, incidental, or consequential damages
- Our total liability is limited to the amount you paid in the 12 months prior
- AI-generated content should be reviewed before use; we do not guarantee accuracy

## 9. Termination
- Either party may terminate the agreement at any time
- Upon termination, your access will be revoked within 30 days
- Sections 6, 7, 8, and 10 survive termination

## 10. Governing Law
These Terms are governed by the laws of [Jurisdiction].
Any disputes shall be resolved in the courts of [Jurisdiction].

## 11. Changes to Terms
We reserve the right to modify these terms with 30 days notice.
Continued use after changes constitutes acceptance of the new terms.

*Last updated: July 2026*
`;

  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('privacy')
  @ApiOperation({ summary: 'Returns the privacy policy content' })
  getPrivacyPolicy() {
    return {
      content: this.privacyContent,
      version: '1.0',
      updatedAt: '2026-07-01',
    };
  }

  @Public()
  @Get('terms')
  @ApiOperation({ summary: 'Returns the terms of service content' })
  getTermsOfService() {
    return {
      content: this.termsContent,
      version: '1.0',
      updatedAt: '2026-07-01',
    };
  }

  @Post('consent')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Record user consent to the latest privacy policy or terms of service',
  })
  async recordConsent(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RecordConsentDto,
    @Req() req: Request,
  ) {
    const ip = dto.ip ?? req.ip ?? req.socket?.remoteAddress ?? null;

    const consent = await this.prisma.userConsent.create({
      data: {
        userId: user.sub,
        type: dto.type,
        version: dto.version,
        ip,
      },
    });

    return {
      message: `Consent recorded for ${dto.type} v${dto.version}`,
      consentId: consent.id,
      consentedAt: consent.consentedAt,
    };
  }
}
