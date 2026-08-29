# واجهة برمجة التطبيقات

الأساس: `/api/v1` — التوثيق التفاعلي على `/api/docs` أثناء التطوير.

## المصادقة

```
POST   /auth/login      { email, password }  ->  { accessToken, refreshToken, expiresIn }
POST   /auth/refresh    { refreshToken }     ->  رموز جديدة (تدوير إجباري)
POST   /auth/logout     { refreshToken?, allDevices }  ->  204
GET    /auth/me         ->  المستخدم وصلاحياته الحيّة
```

رمز الوصول عمره 15 دقيقة افتراضيًا. رمز التحديث معتم (لا يحمل بيانات) ويُخزَّن مجزّأً
بـSHA-256. إعادة استخدام رمز مستهلك تُبطل عائلة الجلسة بالكامل.

## الشيكات

```
GET    /cheques                      قائمة مع بحث وتصفية وترتيب وترقيم
POST   /cheques[?allowDuplicate]     إنشاء (DRAFT) + حدث CREATED
GET    /cheques/:id                  التفاصيل + allowedActions للمستخدم الحالي
PATCH  /cheques/:id                  تعديل البيانات (يتطلب version)
GET    /cheques/:id/events           خط الحركة (غير قابل للتعديل)

POST   /cheques/:id/images[?allowDuplicate]   multipart: file + side
GET    /cheques/:id/images
GET    /cheques/:id/images/:imageId/url       رابط موقّع قصير العمر (مُدقَّق)
POST   /cheques/:id/process-ocr
GET    /cheques/:id/ocr-suggestion
POST   /cheques/:id/review

POST   /cheques/:id/receive     { fromContactId, toLocationId, ... }
POST   /cheques/:id/handover    { toContactId, ... }
POST   /cheques/:id/deposit     { toLocationId, ... }
POST   /cheques/:id/clear
POST   /cheques/:id/bounce      { reason }
POST   /cheques/:id/return      { reason }
POST   /cheques/:id/postpone    { newDueDate, reason }
POST   /cheques/:id/cancel      { reason }
POST   /cheques/:id/mark-lost   { reason }
```

### معاملات البحث في `/cheques`

`search`، `chequeNumber`، `status` (مفرد أو متعدد)، `direction`، `branchId`،
`bankId`، `sourceId`، `recipientId`، `locationId`، `dueFrom`، `dueTo`،
`amountMin`، `amountMax`، `sortBy`، `sortOrder`، `page`، `pageSize`.

## جهات الاتصال والمراجع والتقارير

```
GET|POST   /contacts
GET|PATCH  /contacts/:id
GET        /branches
GET        /banks?country=SA
GET        /locations?branchId=
GET        /dashboard
GET        /reports/due?withinDays=7
GET        /reports/cash-flow?from&to&granularity=day|week|month
GET        /reports/custody
GET        /audit-logs
GET        /notifications
GET        /health
```

## شكل الخطأ الموحّد

```json
{
  "error": {
    "code": "DUPLICATE_CHEQUE",
    "messageKey": "errors.DUPLICATE_CHEQUE",
    "message": "A matching cheque already exists.",
    "requestId": "8f3c...",
    "timestamp": "2026-08-28T12:00:00.000Z",
    "fieldErrors": [{ "path": "amount", "message": "validation.money.positive" }],
    "details": { "existingChequeId": "…" }
  }
}
```

`messageKey` مفتاح ترجمة — العميل يعرض النص العربي منه. لا تُعاد أي تفاصيل داخلية
(آثار المكدس، استعلامات SQL، ردود المزوّدين) إطلاقًا.

### رموز الأخطاء

`VALIDATION_ERROR` · `UNAUTHENTICATED` · `INVALID_CREDENTIALS` · `FORBIDDEN` ·
`NOT_FOUND` · `CONFLICT` · `DUPLICATE_CHEQUE` · `INVALID_STATE_TRANSITION` ·
`VERSION_CONFLICT` · `RATE_LIMITED` · `UNSUPPORTED_MEDIA_TYPE` ·
`PAYLOAD_TOO_LARGE` · `INTERNAL_ERROR`

## حدود المعدل (لكل دقيقة)

| المجموعة    | الافتراضي | المتغير                         |
| ----------- | --------- | ------------------------------- |
| عام         | 120       | `RATE_LIMIT_DEFAULT_PER_MINUTE` |
| المصادقة    | 10        | `RATE_LIMIT_AUTH_PER_MINUTE`    |
| رفع الملفات | 30        | `RATE_LIMIT_UPLOAD_PER_MINUTE`  |
| OCR         | 20        | `RATE_LIMIT_OCR_PER_MINUTE`     |
