import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/Icon';

export const metadata: Metadata = {
  title: 'شرایط استفاده | فن زوم',
  description: 'قوانین و شرایط استفاده از وب‌سایت فن زوم شامل مالکیت محتوا، قوانین ثبت نظر و محدودیت مسئولیت.',
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 md:px-6 md:py-16">
      <div className="mb-8 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2.5">
          <img
            src="https://my-backend-fanzoom.liara.run/api/files/pbc_2583489775/2396ehdiapcae16/photo_1l7rr5z7gw.jpg?token="
            alt="فن زوم"
            className="h-10 w-10 rounded-xl object-cover shadow-1"
          />
          <span className="text-xl font-black text-on-surface">فن زوم</span>
        </Link>
      </div>

      <h1 className="text-3xl font-black leading-[1.35] tracking-tight text-on-surface md:text-4xl">
        شرایط استفاده
      </h1>

      <p className="mt-4 text-lg leading-9 text-on-surface-variant md:text-xl">
        با استفاده از وب‌سایت فن زوم، شما موافقت خود را با شرایط زیر اعلام می‌کنید. لطفاً این صفحه را با دقت مطالعه کنید.
      </p>

      <div className="article-content mt-8 space-y-8">
        <section>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-on-surface">
            <Icon name="description" className="text-2xl text-primary" />
            مالکیت محتوا
          </h2>
          <p className="mt-3 leading-8 text-on-surface-variant">
            تمامی محتوای منتشرشده در فن زوم شامل متون، تصاویر، ویدیوها و گرافیک‌ها متعلق به فن زوم است مگر اینکه منبع دیگری ذکر شده باشد. کپی‌برداری از مطالب بدون ذکر منبع ممنوع است. برای استفاده‌ی تجاری یا انتشار در رسانه‌های دیگر، باید مجوز کتبی از تیم فن زوم دریافت کنید.
          </p>
          <p className="mt-3 leading-8 text-on-surface-variant">
            اخبار نقل‌شده از منابع دیگر با ذکر منبع اصلی منتشر می‌شوند و مسئولیت صحت آن‌ها بر عهده‌ی منبع اصلی است.
          </p>
        </section>

        <section>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-on-surface">
            <Icon name="rule" className="text-2xl text-primary" />
            قوانین ثبت نظر
          </h2>
          <p className="mt-3 leading-8 text-on-surface-variant">
            برای حفظ محیط سالم گفتگو، رعایت موارد زیر هنگام ثبت نظر الزامی است:
          </p>
          <ul className="mr-6 mt-3 list-disc space-y-2 leading-8 text-on-surface-variant marker:text-primary">
            <li><strong className="text-on-surface">احترام متقابل:</strong> توهین، تحقیر یا حمله به کاربران دیگر ممنوع است.</li>
            <li><strong className="text-on-surface">مربوط بودن:</strong> نظرات باید مرتبط با موضوع مقاله باشند.</li>
            <li><strong className="text-on-surface">عدم تبلیغات:</strong> ارسال لینک‌های تبلیغاتی یا اسپم ممنوع است.</li>
            <li><strong className="text-on-surface">زبان مناسب:</strong> استفاده از الفاظ رکیک یا نامناسب مجاز نیست.</li>
            <li><strong className="text-on-surface">صحت اطلاعات:</strong> از انتشار اطلاعات نادرست یا گمراه‌کننده خودداری کنید.</li>
          </ul>
          <p className="mt-3 leading-8 text-on-surface-variant">
            نظراتی که این قوانین را نقض کنند، بدون اطلاع قبلی حذف خواهند شد. کاربران خاطی ممکن است مسدود شوند.
          </p>
        </section>

        <section>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-on-surface">
            <Icon name="gavel" className="text-2xl text-primary" />
            محدودیت مسئولیت
          </h2>
          <p className="mt-3 leading-8 text-on-surface-variant">
            فن زوم تلاش می‌کند اطلاعات دقیق و به‌روزی ارائه دهد، اما هیچ تضمینی درباره‌ی صحت کامل مطالب وجود ندارد. استفاده از اطلاعات موجود در این وب‌سایت به عهده‌ی کاربر است و فن زوم مسئولیتی در قبال خسارات ناشی از استفاده از این اطلاعات ندارد.
          </p>
          <p className="mt-3 leading-8 text-on-surface-variant">
            لینک‌های خارجی موجود در مقالات صرفاً برای удобства کاربران ارائه می‌شوند و فن زوم مسئولیتی درباره‌ی محتوای سایت‌های مقصد ندارد.
          </p>
        </section>

        <section>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-on-surface">
            <Icon name="account_circle" className="text-2xl text-primary" />
            حساب کاربری
          </h2>
          <p className="mt-3 leading-8 text-on-surface-variant">
            هر کاربر تنها مجاز به داشتن یک حساب کاربری است. ایجاد حساب‌های متعدد یا انتقال حساب به دیگران ممنوع است. مسئولیت حفظ امنیت حساب و رمز عبور بر عهده‌ی کاربر است.
          </p>
          <p className="mt-3 leading-8 text-on-surface-variant">
            فن زوم حق دارد در صورت تشخیص فعالیت مشکوک یا نقض قوانین، حساب کاربری را بدون اطلاع قبلی مسدود کند.
          </p>
        </section>

        <section>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-on-surface">
            <Icon name="policy" className="text-2xl text-primary" />
            تغییر شرایط
          </h2>
          <p className="mt-3 leading-8 text-on-surface-variant">
            فن زوم حق دارد این شرایط را در هر زمان و بدون اطلاع قبلی به‌روزرسانی کند. ادامه‌ی استفاده از وب‌سایت پس از تغییرات به معنای پذیرش شرایط جدید است.
          </p>
        </section>
      </div>

      <div className="mt-12 flex items-center justify-center gap-4 border-t border-outline-variant/60 pt-8">
        <Link
          href="/privacy"
          className="inline-flex items-center gap-2 rounded-full bg-surface-container-high px-5 py-2.5 text-sm font-bold text-on-surface-variant transition-all hover:bg-on-surface/8 hover:text-on-surface active:scale-95"
        >
          <Icon name="shield" className="text-lg" />
          حریم خصوصی
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-on-primary shadow-1 transition-all hover:shadow-2 hover:brightness-110 active:scale-95"
        >
          <Icon name="home" className="text-lg" />
          بازگشت به خانه
        </Link>
      </div>
    </main>
  );
}
