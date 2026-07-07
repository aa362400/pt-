# Data Retention Policy — ShopMate AI

> **Version:** 1.0  
> **Effective Date:** July 1, 2026  
> **Owner:** Data Protection Officer  
> **Review Cycle:** Annual

---

## 1. Purpose and Scope

This Data Retention Policy defines the retention periods, archival procedures, and deletion processes for all data categories within the ShopMate AI platform. The policy ensures compliance with:

- **GDPR** (General Data Protection Regulation) — Articles 5(1)(e), 17, 25
- **CCPA** (California Consumer Privacy Act)
- **PIPL** (Personal Information Protection Law of China)
- Other applicable data protection regulations

This policy applies to all data stored in the ShopMate AI platform, including production databases, backups, logs, and file storage.

---

## 2. Roles and Responsibilities

| Role | Responsibility |
|---|---|
| **Data Protection Officer (DPO)** | Policy ownership, compliance oversight, data subject requests |
| **System Administrators** | Implementation of technical retention controls |
| **Engineering Team** | Development and maintenance of housekeeping automation |
| **All Employees** | Awareness and adherence to data handling procedures |

---

## 3. Data Classification and Retention Schedule

### 3.1 User Authentication Data

| Data Type | Retention | Deletion Procedure | Rationale |
|---|---|---|---|
| **Access tokens (JWT)** | Until expiry (default 15 min) | Automatic expiry | Security — short-lived tokens |
| **Refresh tokens** | Until expiry (default 7 days) or logout | Automatic deletion on expiry or logout | Session management |
| **Password reset tokens** | 24 hours | Housekeeping cron job | Security — limited validity window |
| **Email verification tokens** | 48 hours | Housekeeping cron job | Security — limited verification window |

### 3.2 User Account Data

| Data Type | Retention | Deletion Procedure | Rationale |
|---|---|---|---|
| **Active user profiles** | Until account deletion | Manual or via API | Core account operation |
| **Deleted/anonymized profiles** | Indefinite (anonymized) | No further deletion | Referential integrity for audit logs, knowledge docs, etc. |
| **Membership records** | Until removal from org or account deletion | Cascade with user deletion | Organizational structure |

### 3.3 Session Data

| Data Type | Retention | Deletion Procedure | Rationale |
|---|---|---|---|
| **Active assistant sessions** | Until archived (90 days of inactivity) | Archived after 90d inactivity, then kept for context | User productivity |
| **Archived sessions** | Indefinite (archived) | Manual by user or org admin | Historical reference |
| **Messages in active sessions** | Tied to session lifecycle | Cascade with session deletion | Conversation context |
| **Messages in archived sessions** | Indefinite | Manual | Historical reference |

### 3.4 Agent Run Data

| Data Type | Retention | Deletion Procedure | Rationale |
|---|---|---|---|
| **Completed agent runs** | 180 days | Deleted by housekeeping cron | Performance analysis, debugging |
| **Failed agent runs** | 180 days | Deleted by housekeeping cron | Error analysis |
| **Running/pending runs** | Until completion or cancellation | Kept until resolved | Active operations |

### 3.5 User-Generated Content

| Data Type | Retention | Deletion Procedure | Rationale |
|---|---|---|---|
| **Listing drafts** | Until user or org deletes | Manual or via GDPR deletion | User content |
| **Keyword reports** | Until user or org deletes | Manual or via GDPR deletion | User reports |
| **Product research reports** | Until user or org deletes | Manual or via GDPR deletion | User reports |
| **Profit calculations** | Until user or org deletes | Manual or via GDPR deletion | User calculations |
| **Prompt templates** | Until user or org deletes | Manual or via GDPR deletion | User templates |
| **Team tasks** | Until completed or deleted | Manual or org admin | Task management |

### 3.6 Image and Creative Data

| Data Type | Retention | Deletion Procedure | Rationale |
|---|---|---|---|
| **Draft image projects** | 30 days | Marked as FAILED by housekeeping cron | Temporary creative work |
| **Completed/generated images** | Indefinite (published) | Manual by user | Published content |
| **Failed image projects** | 30 days after failure | Cleaned by housekeeping cron | Failed operations |

### 3.7 Notification Data

| Data Type | Retention | Deletion Procedure | Rationale |
|---|---|---|---|
| **All notifications** | 90 days | Deleted by housekeeping cron | Timely information delivery |
| **Unread notifications** | 90 days | Deleted by housekeeping cron | Ensures timely review |

### 3.8 Financial Data

| Data Type | Retention | Deletion Procedure | Rationale |
|---|---|---|---|
| **Invoices** | 7 years | Manual archival | Tax and legal compliance |
| **Payment records** | 7 years | Manual archival | Accounting requirements |
| **Subscription history** | 7 years | Manual archival | Audit trail |
| **Billing information** | Until account closure + 7 years | Deleted after retention period | Legal retention requirements |

### 3.9 Audit Logs

| Data Type | Retention | Deletion Procedure | Rationale |
|---|---|---|---|
| **All audit log entries** | 3 years | Archival then deletion | Security and compliance monitoring |
| **Security-related audit logs** | 5 years | Archival then deletion | Extended retention for security incidents |

### 3.10 Technical Data

| Data Type | Retention | Deletion Procedure | Rationale |
|---|---|---|---|
| **Application logs** | 30 days | Log rotation | Debugging and monitoring |
| **Error logs** | 90 days | Log rotation | Error analysis |
| **Performance metrics** | 13 months | Automatic rollup | Trend analysis |
| **Database backups** | 30 days (daily), 12 months (monthly) | Automatic rotation | Disaster recovery |

---

## 4. Deletion Procedures

### 4.1 Automated Housekeeping (Cron Job)

The housekeeping service runs daily at 3 AM (configurable) and performs:

1. **Token cleanup**: Deletes expired password reset tokens (>24h) and email verification tokens (>48h)
2. **Session archival**: Archives sessions inactive for >90 days
3. **Agent run cleanup**: Deletes completed/failed agent runs >180 days old
4. **Notification cleanup**: Deletes notifications >90 days old
5. **Image project cleanup**: Marks DRAFT image projects >30 days as FAILED

### 4.2 GDPR Deletion (Right to Erasure)

When a user requests account deletion:

1. All authentication tokens are deleted immediately
2. All sessions and messages are deleted
3. All agent runs associated with the user are deleted
4. All notifications are deleted
5. User-created content (listings, reports, calculations, images, prompts) is deleted
6. Team tasks are unassigned (set assignee to null)
7. The user's membership(s) are removed from organizations
8. The user profile is anonymized: name → "Deleted User", email → "deleted-{id}@anonymous", avatar → null, status → "DELETED"

### 4.3 Organizational Deletion

When an organization is deleted:

1. All associated workspaces, products, and channel connections are deleted
2. All agent runs, automation flows, and sessions are deleted
3. All user content (listings, reports, etc.) is deleted
4. All notifications and alerts are deleted
5. Memberships are removed
6. Audit logs are preserved for the standard retention period

### 4.4 Manual Deletion

Administrators can manually delete specific data categories via the housekeeping API endpoints:
- `POST /api/v1/housekeeping/run` — Trigger cleanup for an organization

---

## 5. GDPR Compliance Controls

| Requirement | Implementation |
|---|---|
| **Art. 5(1)(e) — Storage limitation** | Automated retention enforcement via housekeeping cron |
| **Art. 17 — Right to erasure** | `DELETE /api/v1/users/me` with full cascade deletion |
| **Art. 20 — Right to data portability** | `POST /api/v1/users/export-data` returns structured JSON |
| **Art. 25 — Data protection by design** | Retention policies enforced at database level |
| **Art. 30 — Records of processing** | Audit trail for all deletions and data modifications |
| **Art. 32 — Security of processing** | Encryption, access controls, and audit logging |
| **Art. 33 — Breach notification** | Documented incident response procedure |

---

## 6. Backups and Disaster Recovery

| Backup Type | Frequency | Retention | Deletion Policy |
|---|---|---|---|
| **Daily snapshot** | Every 24 hours | 30 days | Automatically rotated |
| **Weekly snapshot** | Every 7 days | 12 weeks | Automatically rotated |
| **Monthly snapshot** | Every month | 12 months | Automatically rotated |
| **Point-in-time recovery** | Continuous (WAL) | 7 days | Automatically rotated |

**Note**: Backups are for disaster recovery only. Deleted data may persist in backups until the backup retention period expires. Data subject deletion requests take precedence — if a user requests deletion, their data is purged from the next backup rotation cycle.

---

## 7. Policy Compliance and Auditing

- **Quarterly reviews**: Retention policy effectiveness and compliance
- **Annual audits**: External auditor review of data handling practices
- **Automated monitoring**: Housekeeping reports logged and reviewed
- **Exception handling**: Any data retained beyond standard periods must be approved by the DPO

---

## 8. Exception Handling

Exceptions to this policy must be:
1. Approved in writing by the Data Protection Officer
2. Documented with justification and duration
3. Reviewed annually for continued necessity

Examples of valid exceptions:
- Legal hold for active litigation
- Regulatory investigation requirements
- Law enforcement data preservation requests

---

## 9. Policy Review and Updates

This policy is reviewed annually by the Data Protection Officer. Updates are communicated to:
- All employees via internal announcement
- Platform users via privacy policy update notification (if applicable)

---

## 10. Contact

For questions about this Data Retention Policy, please contact:

- **Data Protection Officer**: dpo@shopmate-ai.com
- **Engineering Lead**: engineering@shopmate-ai.com
- **Security Team**: security@shopmate-ai.com

---

*This Data Retention Policy is a template and should be reviewed by legal counsel before use.*
