# مواقع أخرى على نفس الخادم

الخادم يشغّل نظام الشيكات، وبوابته (Caddy) تملك المنفذين 80 و443. موقع آخر يمرّ عبرها،
ولا يمسّ شيئًا من نظام الشيكات.

## القواعد

1. **مجلد مستقل:** `/root/<اسم-المشروع>`، لا داخل `/root/ChequeFlow`.
2. **اسم مشروع Compose مختلف:** `name: <اسم-المشروع>` في ملفه، لا `chequeflow`.
3. **لا منافذ منشورة:** لا `ports:` في خدماته. يصل إليه Caddy عبر الشبكة.
4. **شبكة `chequeflow-edge`:** خدمة الموقع الأمامية فقط تنضم إليها:

   ```yaml
   services:
     web:
       networks: [default, edge]
   networks:
     edge:
       external: true
       name: chequeflow-edge
   ```

   هذه الشبكة تصله بالبوابة فقط؛ قاعدة بيانات الشيكات وتخزين الصور ليست عليها.

5. **ملف Caddy واحد:** `/root/ChequeFlow/infrastructure/sites/<اسم-المشروع>.caddy`
   (لا يتتبّعه git، فلا يتعارض مع `git pull`):

   ```caddy
   site.example.com {
   	reverse_proxy <اسم-الحاوية>:<منفذها-الداخلي>
   }
   ```

   ثم: `docker exec chequeflow-proxy-1 caddy reload --config /etc/caddy/Caddyfile`

6. **ممنوع:** تعديل أي ملف آخر في `/root/ChequeFlow`، أو إيقاف حاوياته أو حذفها، أو
   `docker compose down -v`، أو `docker system prune` / `docker volume prune`.

قبل `docker compose down` لنظام الشيكات، أوقف المشاريع الأخرى المتصلة بـ`chequeflow-edge`
أولًا — شبكة عليها حاوية من مشروع آخر لا تُحذف.
