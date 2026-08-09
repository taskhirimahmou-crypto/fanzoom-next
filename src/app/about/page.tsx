import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/Icon';

export const metadata: Metadata = {
  title: 'درباره فن زوم | رسانه تخصصی فناوری',
  description: 'فن زوم رسانه‌ای تخصصی برای پوشش اخبار، بررسی و تحلیل دنیای فناوری به زبان فارسی است. با رسالت آگاهی‌بخشی و آموزش مفاهیم تکنولوژی همراه شما هستیم.',
};

export default function AboutPage() {
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
        درباره فن زوم
      </h1>

      <div className="article-content mt-8 space-y-6">
        <p className="text-lg leading-9 text-on-surface-variant md:text-xl">
          فن زوم یک رسانه‌ی تخصصی در حوزه‌ی فناوری است که با هدف پوشش دقیق و به‌روز اخبار دنیای تکنولوژی فعالیت می‌کند. ما در فن زوم باور داریم که فناوری باید به زبانی ساده و قابل‌فهم برای همه ارائه شود، بدون اینکه از عمق و دقت مطالب کاسته شود.
        </p>

        <h2 className="mt-8 text-2xl font-bold text-on-surface">رسالت ما</h2>
        <p className="leading-8 text-on-surface-variant">
          رسالت فن زوم ارائه‌ی اخبار موثق، بررسی‌های بی‌طرفانه و تحلیل‌های عمیق از تحولات دنیای فناوری است. ما تلاش می‌کنیم تا مخاطبان فارسی‌زبان را با آخرین دستاوردهای تکنولوژی، از هوش مصنوعی و یادگیری ماشین گرفته تا گجت‌های مصرفی و استارتاپ‌های نوپا، آشنا کنیم.
        </p>

        <h2 className="mt-8 text-2xl font-bold text-on-surface">ارزش‌های فن زوم</h2>
        <ul className="mr-6 list-disc space-y-3 leading-8 text-on-surface-variant marker:text-primary">
          <li><strong className="text-on-surface">صداقت و شفافیت:</strong> تمام اخبار و مطالب با رعایت اصول حرفه‌ای journalism و با ذکر منابع معتبر منتشر می‌شوند.</li>
          <li><strong className="text-on-surface">بی‌طرفی:</strong> نظرات و بررسی‌های ما بدون تأثیر از تبلیغات یا روابط تجاری ارائه می‌شوند.</li>
          <li><strong className="text-on-surface">آموزش‌محوری:</strong> علاوه بر اخبار، به آموزش مفاهیم پیچیده‌ی فناوری به زبانی ساده می‌پردازیم.</li>
          <li><strong className="text-on-surface">تعامل با مخاطبان:</strong> نظرات و بازخوردهای کاربران برای ما ارزشمند است و در بهبود محتوا نقش دارند.</li>
        </ul>

        <p className="leading-8 text-on-surface-variant">
          فن زوم توسط تیمی از علاقه‌مندان و متخصصان حوزه‌ی فناوری اداره می‌شود که هر یک در زمینه‌ی تخصصی خود تجربه و دانش کافی دارند. ما متعهد هستیم که بهترین و دقیق‌ترین محتوا را برای شما عزیزان فراهم کنیم.
        </p>

        <p className="leading-8 text-on-surface-variant">
          از همراهی شما سپاسگزاریم و امیدواریم فن زوم بتواند مرجعی قابل اعتماد برای علاقه‌مندان به فناوری در ایران باشد.
        </p>
      </div>

      <div className="mt-12 flex items-center justify-center gap-4 border-t border-outline-variant/60 pt-8">
        <Link
          href="/contact"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-on-primary shadow-1 transition-all hover:shadow-2 hover:brightness-110 active:scale-95"
        >
          <Icon name="mail" className="text-lg" />
          تماس با ما
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full bg-surface-container-high px-5 py-2.5 text-sm font-bold text-on-surface-variant transition-all hover:bg-on-surface/8 hover:text-on-surface active:scale-95"
        >
          <Icon name="home" className="text-lg" />
          بازگشت به خانه
        </Link>
      </div>
    </main>
  );
}
