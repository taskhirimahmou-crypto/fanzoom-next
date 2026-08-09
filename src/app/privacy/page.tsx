import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/Icon';

export const metadata: Metadata = {
  title: 'حریم خصوصی | فن زوم',
  description: 'سیاست حریم خصوصی فن زوم - توضیحات درباره داده‌های جمع‌آوری‌شده، کوکی‌ها، نظرات کاربران و عدم فروش داده‌ها به اشخاص ثالث.',
};

export default function PrivacyPage() {
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
        حریم خصوصی
      </h1>

      <p className="mt-4 text-lg leading-9 text-on-surface-variant md:text-xl">
        در فن زوم، حفظ حریم خصوصی کاربران برای ما اهمیت بالایی دارد. این صفحه توضیح می‌دهد که چه داده‌هایی جمع‌آوری می‌شوند و چگونه از آن‌ها استفاده می‌کنیم.
      </p>

      <div className="article-content mt-8 space-y-8">
        <section>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-on-surface">
            <Icon name="folder_shared" className="text-2xl text-primary" />
            داده‌های جمع‌آوری‌شده
          </h2>
          <p className="mt-3 leading-8 text-on-surface-variant">
            فن زوم حداقل داده‌های لازم را جمع‌آوری می‌کند. هنگام ثبت‌نام، تنها ایمیل و نام نمایشی شما ذخیره می‌شود. برای کاربران مهمان، هیچ داده‌ی شخصی ذخیره نمی‌شود. داده‌های بازدید مقالات به صورت تجمعی و بدون شناسایی کاربر برای آمار استفاده می‌شوند.
          </p>
        </section>

        <section>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-on-surface">
            <Icon name="cookie" className="text-2xl text-primary" />
            کوکی‌ها
          </h2>
          <p className="mt-3 leading-8 text-on-surface-variant">
            این وب‌سایت از کوکی‌ها برای بهبود تجربه‌ی کاربری استفاده می‌کند. کوکی‌های اصلی عبارتند از:
          </p>
          <ul className="mr-6 mt-3 list-disc space-y-2 leading-8 text-on-surface-variant marker:text-primary">
            <li><strong className="text-on-surface">کوکی احراز هویت:</strong> برای نگهداری وضعیت ورود کاربر (فقط برای کاربران ثبت‌نام‌شده)</li>
            <li><strong className="text-on-surface">کوکی ترجیحات:</strong> برای ذخیره تنظیمات نمایشی مانند حالت تاریک/روشن</li>
            <li><strong className="text-on-surface">کوکی تحلیل:</strong> برای آمار بازدید صفحات (بدون شناسایی کاربر)</li>
          </ul>
          <p className="mt-3 leading-8 text-on-surface-variant">
            شما می‌توانید کوکی‌ها را از طریق تنظیمات مرورگر خود مدیریت یا غیرفعال کنید، اما این کار ممکن است برخی قابلیت‌ها را محدود کند.
          </p>
        </section>

        <section>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-on-surface">
            <Icon name="comment" className="text-2xl text-primary" />
            نظرات کاربران
          </h2>
          <p className="mt-3 leading-8 text-on-surface-variant">
            هنگام ثبت نظر، ایمیل و نام نمایشی شما همراه با متن نظر ذخیره می‌شود. نظرات قبل از انتشار توسط تیم تحریریه بررسی می‌شوند تا از رعایت قوانین اطمینان حاصل شود. نظرات تأییدشده به صورت عمومی نمایش داده می‌شوند.
          </p>
          <p className="mt-3 leading-8 text-on-surface-variant">
            شما می‌توانید درخواست حذف نظر خود را از طریق ایمیل ارسال کنید.
          </p>
        </section>

        <section>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-on-surface">
            <Icon name="shield" className="text-2xl text-primary" />
            عدم فروش داده‌ها
          </h2>
          <p className="mt-3 leading-8 text-on-surface-variant">
            فن زوم متعهد می‌شود که هیچ‌گونه داده‌ی شخصی کاربران را به اشخاص ثالث نفروشد یا اجاره ندهد. داده‌ها تنها برای اهداف داخلی و بهبود خدمات استفاده می‌شوند.
          </p>
        </section>

        <section>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-on-surface">
            <Icon name="security" className="text-2xl text-primary" />
            امنیت داده‌ها
          </h2>
          <p className="mt-3 leading-8 text-on-surface-variant">
            ما از روش‌های استاندارد امنیتی برای محافظت از داده‌های شما استفاده می‌کنیم. اطلاعات حساس مانند رمز عبور به صورت رمزنگاری‌شده ذخیره می‌شوند.
          </p>
        </section>

        <section>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-on-surface">
            <Icon name="update" className="text-2xl text-primary" />
            به‌روزرسانی سیاست حریم خصوصی
          </h2>
          <p className="mt-3 leading-8 text-on-surface-variant">
            این سیاست ممکن است در آینده به‌روزرسانی شود. هرگونه تغییر در این صفحه اعلام خواهد شد و تاریخ به‌روزرسانی درج می‌شود.
          </p>
        </section>
      </div>

      <div className="mt-12 flex items-center justify-center gap-4 border-t border-outline-variant/60 pt-8">
        <Link
          href="/contact"
          className="inline-flex items-center gap-2 rounded-full bg-surface-container-high px-5 py-2.5 text-sm font-bold text-on-surface-variant transition-all hover:bg-on-surface/8 hover:text-on-surface active:scale-95"
        >
          <Icon name="mail" className="text-lg" />
          تماس با ما
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
