# Privacy Policy — ShopMate AI

> **Version:** 1.0  
> **Effective Date:** July 1, 2026  
> **Last Updated:** July 7, 2026

---

## 1. Introduction

ShopMate AI ("we," "our," "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our AI-powered e-commerce platform (the "Service").

Please read this policy carefully. By using the Service, you consent to the practices described herein.

---

## 2. Information We Collect

### 2.1 Information You Provide Directly

| Category | Examples | Purpose |
|---|---|---|
| **Account Data** | Name, email address, password hash | Registration, authentication |
| **Profile Data** | Avatar, locale, timezone, preferences | Personalization |
| **Content** | Product listings, research reports, keyword data, images, prompts | Core platform functionality |
| **Payment Data** | Billing information (processed by Stripe) | Subscription management |
| **Communications** | Support inquiries, feedback | Customer support, product improvement |

### 2.2 Information Collected Automatically

- **Usage Data**: Pages visited, features used, session duration, agent interactions
- **Device Data**: IP address, browser type, operating system
- **Performance Data**: Response times, error rates, feature adoption metrics

### 2.3 Information from Third Parties

- **OAuth Providers**: If you authenticate via Google or other providers, we receive your name and email
- **E-Commerce Platforms**: Data from connected stores (Amazon, Shopify, WooCommerce) as authorized by you

---

## 3. Legal Basis for Processing (GDPR Article 6)

| Processing Activity | Legal Basis | Description |
|---|---|---|
| Account creation and management | **Contract (Art. 6(1)(b))** | Necessary to provide the Service under our Terms of Service |
| Billing and payments | **Contract (Art. 6(1)(b))** | Necessary to process subscription payments |
| Email verification and password resets | **Contract (Art. 6(1)(b))** | Security requirements for account operations |
| Service improvement and analytics | **Legitimate Interest (Art. 6(1)(f))** | To improve platform performance and user experience |
| Fraud detection and security | **Legitimate Interest (Art. 6(1)(f))** | To protect our platform and users |
| Marketing communications | **Consent (Art. 6(1)(a))** | Optional newsletters and product updates |
| Compliance with legal obligations | **Legal Obligation (Art. 6(1)(c))** | Tax records, regulatory compliance, lawful requests |

---

## 4. Data Retention Periods

| Data Type | Retention Period | Rationale |
|---|---|---|
| Password reset tokens | 24 hours | Security token expiry |
| Email verification tokens | 48 hours | Verification window |
| Session data | 90 days, then archived | User activity context |
| Agent run data | 180 days, then deleted | Historical analysis |
| Notifications | 90 days, then deleted | Information delivery |
| Image prompt drafts | 30 days, then expired | Temporary creative work |
| Published images | Indefinitely | User's published content |
| Financial records (invoices, payments) | 7 years | Tax and legal compliance |
| User profile data | Until account deletion | Account operation |
| Anonymized/deleted user data | Retained (anonymized) | Referential integrity |

---

## 5. Your Rights (GDPR)

You have the following rights under the General Data Protection Regulation:

### 5.1 Right to Access (Art. 15)
Request a copy of the personal data we hold about you. Use the `GET /api/v1/users/me` endpoint or contact support.

### 5.2 Right to Rectification (Art. 16)
Correct inaccurate or incomplete data via `PATCH /api/v1/users/me`.

### 5.3 Right to Erasure (Art. 17)
Request deletion of your account and associated data via `DELETE /api/v1/users/me` or contact support.

### 5.4 Right to Restrict Processing (Art. 18)
Request restriction of processing in certain circumstances (e.g., contesting data accuracy).

### 5.5 Right to Data Portability (Art. 20)
Export your data in a structured, machine-readable format via `POST /api/v1/users/export-data`.

### 5.6 Right to Object (Art. 21)
Object to processing based on legitimate interests, including direct marketing.

### 5.7 Right to Withdraw Consent
Where processing is based on consent, you may withdraw it at any time without affecting the lawfulness of processing based on consent before its withdrawal.

To exercise any of these rights, contact us at **privacy@shopmate-ai.com**.

---

## 6. Data Processors and Third-Party Services

| Processor | Purpose | Data Location | Safeguards |
|---|---|---|---|
| **AWS (Amazon Web Services)** | Cloud infrastructure (compute, storage, database) | Global | AWS GDPR compliance, DPA in place |
| **OpenAI** | AI model inference for agent functionality | USA | Standard Contractual Clauses |
| **Anthropic** | AI model inference for agent functionality | USA | Standard Contractual Clauses |
| **Stripe** | Payment processing | Depends on region | PCI-DSS compliant, DPA in place |
| **SendGrid (Twilio)** | Email delivery (notifications, verification) | USA | DPA in place |
| **PostHog** | Product analytics | EU-hosted option | DPA in place, pseudonymized data |

---

## 7. International Data Transfers

We may transfer your data to countries outside the European Economic Area (EEA). When we do, we ensure appropriate safeguards are in place:

- **Standard Contractual Clauses (SCCs)**: Adopted by the European Commission
- **Data Processing Agreements (DPAs)**: Signed with all sub-processors
- **Transfer Impact Assessments**: Conducted for high-risk transfers

For transfers to the US, we rely on the EU-US Data Privacy Framework where applicable.

---

## 8. Security Measures

We implement the following technical and organizational security measures:

### Technical Measures
- **Encryption at rest**: AES-256 for all stored data
- **Encryption in transit**: TLS 1.3 for all API traffic
- **Authentication**: JWT with short-lived access tokens, refresh token rotation
- **Two-factor authentication**: Optional for account security
- **Access control**: Role-based (OWNER, ADMIN, MEMBER, VIEWER)
- **Audit logging**: All data access and modifications logged
- **Rate limiting**: API throttling and abuse prevention
- **Input validation**: Server-side validation and sanitization
- **Secrets management**: Environment variables, no hardcoded credentials

### Organizational Measures
- **Data protection training**: All employees with data access
- **Access least-privilege**: Need-to-know basis only
- **Incident response plan**: Documented and tested
- **Regular security audits**: Quarterly internal, annual external
- **Penetration testing**: Annual third-party assessment
- **Vulnerability disclosure program**: Security@shopmate-ai.com

---

## 9. Cookie Policy

Our platform uses essential cookies for authentication and session management. We do not use tracking cookies for advertising purposes.

| Cookie Type | Purpose | Duration |
|---|---|---|
| `access_token` | JWT authentication | Custom (configurable, default 15 min) |
| `refresh_token` | Session persistence | Custom (configurable, default 7 days) |
| `session` | Server-side session | Duration of session |

---

## 10. Data Breach Notification

In the event of a data breach that poses a risk to your rights and freedoms, we will:
1. Notify the relevant supervisory authority within 72 hours (GDPR Art. 33)
2. Notify affected users without undue delay (GDPR Art. 34)
3. Provide information on the nature, consequences, and remedial measures

---

## 11. Changes to This Policy

We may update this Privacy Policy from time to time. Material changes will be communicated via:
- Email notification to the registered email address
- In-app notification
- Banner on the platform

The "Last Updated" date at the top of this policy will reflect the latest revision. Your continued use of the Service after changes constitutes acceptance.

---

## 12. Contact Information

### Data Protection Officer
- **Email**: dpo@shopmate-ai.com
- **Response time**: Within 72 hours

### Support
- **Email**: support@shopmate-ai.com
- **In-app chat**: Available through the platform

### Supervisory Authority
You have the right to lodge a complaint with your local data protection authority:
- **EU**: Your local Data Protection Authority (DPA)
- **UK**: Information Commissioner's Office (ICO)
- **China**: Cyberspace Administration of China (CAC)

---

## 13. Specific Regional Provisions

### 13.1 California Residents (CCPA)
California residents have additional rights:
- Right to know what personal information is collected
- Right to delete personal information
- Right to opt out of the sale of personal information (we do not sell data)
- Right to non-discrimination for exercising CCPA rights

### 13.2 China (PIPL)
For users in China:
- We collect and process personal data as described in this policy
- You have rights under the Personal Information Protection Law (PIPL)
- Data may be transferred internationally as described in Section 7
- Consent can be withdrawn at any time

---

*This Privacy Policy is a template and should be reviewed by legal counsel before use.*
