# ChequeFlow — نظام إدارة الشيكات

نظام متكامل لتتبّع الشيكات وحركتها داخل الشركة: من استلامها من العميل، مرورًا
بحفظها في الخزنة، وحتى إيداعها في البنك أو تسليمها لمورد.

النظام يجيب في أي لحظة عن:

| السؤال                | مصدر الإجابة                 |
| --------------------- | ---------------------------- |
| أين يوجد الشيك الآن؟  | `current_location_id`        |
| ممن تم استلامه؟       | `original_source_id`         |
| لمن تم تسليمه؟        | `current_recipient_id`       |
| من نفّذ آخر حركة؟     | `cheque_events.performed_by` |
| ما تاريخ استحقاقه؟    | `due_date` (نوع DATE)        |
| هل تم تحصيله أم ارتد؟ | `status`                     |

الواجهة عربية بالكامل وباتجاه RTL، والكود وأسماء الملفات بالإنجليزية.

---

## المتطلبات

| الأداة                  | الإصدار                    | ملاحظة                                                        |
| ----------------------- | -------------------------- | ------------------------------------------------------------- |
| Node.js                 | ≥ 22.12 (مُختبر على 24.20) |                                                               |
| pnpm                    | 10.15.0                    | `corepack enable && corepack prepare pnpm@10.15.0 --activate` |
| Docker + Docker Compose | أي إصدار حديث              | لتشغيل PostgreSQL وRedis وMinIO                               |
| Xcode / Android Studio  | اختياري                    | لتشغيل تطبيق الجوال على محاكٍ                                 |

---

## التشغيل — الأوامر بالترتيب

```bash
# 1) ملف البيئة (لا يعمل شيء بدونه)
cp .env.example .env
# غيّر القيم التالية على الأقل:
#   JWT_ACCESS_SECRET, JWT_REFRESH_SECRET  ->  openssl rand -base64 48
#   FIELD_ENCRYPTION_KEY                   ->  openssl rand -base64 32
```

```bash
# 2) تشغيل الخدمات المحلية (PostgreSQL + Redis + MinIO)
pnpm infra:up
```

```bash
# 3) تثبيت الاعتماديات
pnpm install
```

```bash
# 4) توليد عميل Prisma وتنفيذ الترحيلات والبذور
pnpm db:deploy && pnpm db:seed
```

```bash
# 5) تشغيل الـAPI  (http://localhost:3333/api/v1)
pnpm --filter @cheque-flow/api dev
```

```bash
# 6) تشغيل لوحة الويب  (http://localhost:3000)
pnpm --filter @cheque-flow/web dev
```

```bash
# 7) تشغيل تطبيق الجوال
pnpm --filter @cheque-flow/mobile dev
```

> **ملاحظة عن بيئات التشغيل المعزولة:** الأمر `dev` يستخدم Turbopack، وهو يحتاج
> إنشاء عملية `node` فرعية لمعالجة CSS. في بعض البيئات المقيّدة (مثل لوحات
> المعاينة داخل المحررات) يُمنع ذلك، فاستخدم بديل webpack:
>
> ```bash
> pnpm --filter @cheque-flow/web dev:webpack
> ```
>
> وهذا هو ما يستخدمه `.claude/launch.json`. كما أن Node يجب أن يكون على `PATH`
> لعمليات البناء الفرعية؛ إذا كان مثبّتًا في مسار غير قياسي أضِف إلى `~/.zshrc`:
>
> ```bash
> export PATH="$HOME/.local/opt/node/bin:$PATH"
> ```

بيانات الدخول التجريبية (بيئة التطوير فقط، من `.env`):

| المستخدم           | الصلاحيات                                         |
| ------------------ | ------------------------------------------------- |
| `admin` / `admin`  | مالك — كل الصلاحيات                               |
| `viewer` / `admin` | اطّلاع فقط — للتحقق من أن RBAC يمنع الحركات فعلًا |

حقل تسجيل الدخول يقبل **اسم مستخدم أو بريدًا إلكترونيًا**، لذا يمكن لأي نشر حقيقي
استخدام عناوين بريد كاملة عبر `SEED_OWNER_EMAIL`.

> ⚠️ كلمة المرور `admin` مخصّصة للتطوير المحلي فقط. سياسة كلمات المرور
> (`passwordSchema`) تفرض 10 أحرف على الأقل مع حروف كبيرة وصغيرة وأرقام، وهي ما
> يجب تطبيقه عند إنشاء حسابات حقيقية.

> على جهاز حقيقي، بدّل `localhost` في `EXPO_PUBLIC_API_URL` إلى عنوان IP للشبكة المحلية.

---

## قاعدة البيانات بلا Docker

إن لم يكن Docker متاحًا، يمكن تشغيل PostgreSQL من مجلد المستخدم بلا صلاحيات
مدير. البيانات تعيش في `~/ChequeFlowData` — **خارج المستودع عمدًا**، فلا
يستطيع أي `git clean` أو حذف `node_modules` أن يصل إليها.

```bash
bash scripts/db.sh start
```

```bash
bash scripts/db.sh status
```

```bash
bash scripts/db.sh stop
```

`psql` يفتح جلسة على القاعدة مباشرة، و`backup` يكتب نسخة `pg_dump` إلى
`~/ChequeFlowData`.

> **نسختان احتياطيتان لغرضين مختلفين:** `scripts/db.sh backup` يُنتج نسخة
> تستعيد القاعدة **تمامًا** كما كانت. وزر «نسخة احتياطية» في الإعدادات يُنتج
> ملف JSON **مقروءًا** يمكن فتحه والتحقق منه بالعين. الأول للاستعادة التقنية،
> والثاني للاطمئنان وللأرشفة.

**احتفظ بنسخة من `FIELD_ENCRYPTION_KEY`** في مكان آمن خارج الجهاز. أرقام
الحسابات مشفّرة به، وفقدانه يجعلها غير قابلة للقراءة إلى الأبد — نسخة قاعدة
البيانات وحدها لن تنقذك.

---

## تشغيل التطبيق على هاتف حقيقي

```bash
pnpm --filter @cheque-flow/mobile dev
```

ثم امسح الرمز من **Expo Go**. لا بدّ أن يكون الهاتف على شبكة الواي-فاي نفسها،
وأن يحمل `EXPO_PUBLIC_API_URL` في `apps/mobile/.env` عنوان الجهاز على الشبكة
لا `localhost` — فـ`localhost` من الهاتف يعني الهاتف نفسه.

> **آيفون حقيقي على SDK 57 يتطلّب حساب Expo.** غيّرت Expo طريقة توزيع Expo Go:
> على الأجهزة الحقيقية صار يمرّ عبر `eas go` المرتبط بالحساب، فيشترط تسجيل
> الدخول في **الهاتف وسطر الأوامر معًا وبالحساب نفسه**. سجّل الدخول مرة واحدة
> بـ`npx expo login` داخل `apps/mobile` ثم شغّل `pnpm dev`. الرسالة التي تظهر
> بدونه: `You need to be signed in to Expo Go and Expo CLI`.
>
> **`--offline` لا يحلّ هذه الحالة بل يمنعها** — يقطع اتصال سطر الأوامر بالحساب
> فيتعذّر التطابق. أمر `dev:offline` مفيد فقط لمحاكي iOS أو لأجهزة أندرويد،
> حيث لا يوجد هذا القيد أصلًا.

> **Expo Go على iOS يثبّت أحدث نسخة فقط** ولا تسمح Apple بتثبيت نسخة أقدم، فلا
> بدّ أن يبقى إصدار SDK في المشروع مطابقًا لما على الهاتف. الترقية تتم بـ
> `npx expo install --fix` بعد رفع `expo` في `package.json`.

---

## تخزين صور الشيكات بلا Docker

صور الشيكات تُحفظ في تخزين كائنات متوافق مع S3. إن لم يكن Docker ولا MinIO
متاحًا فلا يوجد ما يستمع على المنفذ، فيفشل رفع أي صورة، وتسقط معه ثمانية من
اختبارات `test:e2e`. `scripts/storage-stub.mjs` يردّ على الطلبات الخمسة التي
يُصدرها الـAPI فعلًا ولا شيء غيرها.

```bash
bash scripts/storage.sh start
```

```bash
bash scripts/storage.sh status
```

```bash
bash scripts/storage.sh stop
```

الكائنات تُكتب إلى `~/ChequeFlowData/storage` — بجانب القاعدة و**خارج المستودع
عمدًا** — فتبقى الصور بعد إعادة التشغيل وبعد أي `git clean`.

> ⚠️ **هذه ليست S3 ولا يجوز أن يشير إليها أي شيء حقيقي.** لا تتحقق من أي
> مصادقة: لا تقرأ ترويسة `Authorization` إطلاقًا، فأي طرف يصل إلى المنفذ يقرأ
> ويحذف كل صور الشيكات فيها. لذلك ترتبط بـ`127.0.0.1` وحدها، وترفض العمل عند
> `NODE_ENV=production`. القيدان مقصودان ولا يُخفَّفان.

---

## أوامر التحقق

```bash
pnpm lint
```

```bash
pnpm typecheck
```

```bash
pnpm test
```

```bash
pnpm build
```

اختبارات التكامل الشاملة تحتاج قاعدة بيانات حقيقية:

```bash
createdb chequeflow_test && TEST_DATABASE_URL="postgresql://chequeflow:PASSWORD@localhost:5432/chequeflow_test" pnpm --filter @cheque-flow/database exec prisma migrate deploy
```

```bash
TEST_DATABASE_URL="postgresql://chequeflow:PASSWORD@localhost:5432/chequeflow_test" pnpm --filter @cheque-flow/api test:e2e
```

> بدون `TEST_DATABASE_URL` تتخطى هذه المجموعات نفسها بدل أن تفشل.

> **وتحتاج أيضًا تخزين الصور.** ثمانية من هذه الاختبارات ترفع صورة شيك وتقرأها،
> فإن لم يكن هناك ما يستمع على `S3_ENDPOINT` سقطت جميعها برسائل تبدو كأنها عطل
> في الكود. شغّل `bash scripts/storage.sh start` قبلها.

سيناريوهات القبول تُشغَّل مقابل API حيّة (لا محاكاة) بعد الـseed:

```bash
bash tests/acceptance-phase-1.sh
```

```bash
bash tests/acceptance-phase-2.sh
```

---

## هيكل المستودع

```
.
├── apps/
│   ├── api/         NestJS 11 — REST API على /api/v1 + OpenAPI
│   ├── web/         Next.js 16 (App Router) — لوحة تحكم عربية RTL
│   └── mobile/      Expo SDK 54 + expo-router — Android و iOS
├── packages/
│   ├── database/       مخطط Prisma + الترحيلات + البذور
│   ├── shared-types/   الأنواع، الصلاحيات، وآلة حالات الشيك
│   ├── validation/     مخططات Zod مشتركة
│   ├── api-client/     عميل HTTP مُنمَّط مع تدوير الرموز
│   ├── ui/             رموز التصميم ومكوّنات الواجهة
│   ├── localization/   قواميس ar/en وأدوات التنسيق
│   └── config/         إعدادات ESLint وTypeScript وPrettier المشتركة
├── infrastructure/  docker-compose (PostgreSQL, Redis, MinIO)
├── docs/            قرارات معمارية + توثيق API
└── tests/           سيناريوهات القبول (المرحلتان الأولى والثانية)
```

### شاشات تطبيق الجوال

التنقّل شريط سفلي بخمس وجهات، وداخل كل وجهة `Stack` خاص بها:

```
الرئيسية      لوحة بمؤشرات لكل عملة + إجراءات سريعة + آخر الحركات
الشيكات       تبويبات (الكل/واردة/صادرة/مستحقة/متأخرة/مرتجعة) + بحث + ورقة تصفية
              └── تفاصيل الشيك → إجراءات · تعديل · خط الحركة · مراجعة المسح · تنبيه
إضافة         تصوير شيك · إضافة يدوية · جهة اتصال جديدة
جهات الاتصال  بحث + تبويبات النوع
              └── كشف حساب لكل عملة · اتصال/واتساب · تعديل · دمج · حذف
المزيد        التنبيهات · التقارير والتصدير · المستخدمون · الإعدادات
```

الإعدادات تتيح تبديل اللغة والتقويم (ميلادي/هجري) و«مزامنة الآن» مع بيان حالة
الاتصال. التقويم عرض فقط — التخزين يبقى ميلاديًا دائمًا.

---

## المفاهيم الأساسية

### آلة الحالات

كل تغيير في حالة الشيك يمر عبر `assertTransition()` في
`packages/shared-types/src/cheque-state-machine.ts`. لا يكتب أي Controller حقل
`status` مباشرة، وكل انتقال يُنشئ صفًا في `cheque_events` **داخل نفس المعاملة**.

```
DRAFT ──SUBMIT_FOR_REVIEW──▶ PENDING_REVIEW ──REVIEW──▶ IN_HAND
                                                          │
                        ┌─────────────────────────────────┤
                        ▼                                 ▼
                    DEPOSITED                        TRANSFERRED
                    │       │                        │        │
                 CLEARED  BOUNCED ──▶ RETURNED   CLEARED   RETURNED
```

`CLEARED` و`CANCELLED` حالتان نهائيتان لا انتقال بعدهما.

### الفصل بين أطراف الشيك

| الحقل                  | المعنى                     |
| ---------------------- | -------------------------- |
| `original_source_id`   | من استلمت الشركة الشيك منه |
| `original_payee_name`  | المستفيد المكتوب على الشيك |
| `current_holder_id`    | الموظف الحائز حاليًا       |
| `current_recipient_id` | آخر جهة سُلّم إليها الشيك  |
| `current_location_id`  | مكان الحفظ (خزنة/درج/بنك)  |

### خط التصوير

```
Capture → Quality Check → Upload → OCR → Manual Review → Duplicate Check → Save → Event → Reminders
```

نتيجة OCR **اقتراح** حتى يعتمدها إنسان: تُحفظ في `ocr_extractions`، وتنتقل حالة
الشيك إلى `PENDING_REVIEW`، والحقول التي ثقتها أقل من 0.75 تُبرَز في شاشة المراجعة.

### مزوّدو OCR

| المزوّد       | `OCR_PROVIDER`   | السلوك                                                                     |
| ------------- | ---------------- | -------------------------------------------------------------------------- |
| Mock          | `mock` (افتراضي) | **لا يقرأ الصورة إطلاقًا** — يولّد بيانات تركيبية حتمية للاختبارات والعروض |
| Claude Vision | `claude`         | قراءة حقيقية للشيك (عربي/إنجليزي، مطبوع ويدوي) مع درجة ثقة لكل حقل         |

لتفعيل القراءة الحقيقية، في `.env`:

```bash
OCR_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
```

المزوّدان يطبّقان الواجهة نفسها `OcrProvider`، فالتبديل بينهما لا يمسّ أي كود آخر.
إضافة مزوّد ثالث تعني صنفًا جديدًا وسطرًا في `ocr.module.ts` فقط.

### الأمان

- عزل كامل بالمؤسسة: `organizationId` يُستخرج من الجلسة فقط ولا يُقبل من العميل.
- RBAC بـ16 صلاحية و7 أدوار افتراضية، وصلاحية كل إجراء مأخوذة من جدول الانتقالات.
- Argon2id لكلمات المرور، وتدوير إجباري لرموز التحديث مع كشف إعادة الاستخدام.
- أرقام الحسابات مشفّرة AES-256-GCM ولا تُعاد إلا مقنّعة.
- صور الشيكات في حاوية خاصة، وتُعرض عبر روابط موقّعة قصيرة العمر مع تسجيل تدقيق.
- نوع الملف يُحدَّد من البايتات لا من الامتداد.
- `cheque_events` و`audit_logs` غير قابلة للتعديل أو الحذف (مُشغّل في قاعدة البيانات).

---

## توثيق الـAPI

بعد تشغيل الـAPI: <http://localhost:3333/api/docs>

لتصدير الملف:

```bash
pnpm --filter @cheque-flow/api openapi:export
```

---

## ملاحظات

- لا توجد أي مفاتيح حقيقية في المستودع؛ `.env` مستثنى من Git.
- الـseed يرفض العمل عند `NODE_ENV=production`.
- تفاصيل القرارات التقنية في [`docs/architecture-decisions.md`](docs/architecture-decisions.md).
- ما تم إنجازه وما تبقّى في [`docs/phase-1-status.md`](docs/phase-1-status.md).
