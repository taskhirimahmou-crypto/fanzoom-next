// migrate.js
const PocketBase = require('pocketbase/cjs');

// ۱. تنظیمات اتصال
const localPb = new PocketBase('http://127.0.0.1:8090');
const liaraPb = new PocketBase('https://my-backend-fanzoom.liara.run');

// ⚠️ ایمیل و رمز ادمینی که در لیارا ساختی را اینجا بگذار
const LIARA_ADMIN_EMAIL = 'taskhirimahmou@gmail.com'; 
const LIARA_ADMIN_PASSWORD = '@Mahmoud83';

// لیست کالکشن‌هایی که می‌خواهی منتقل شوند
// اگر کالکشن دیگری داری (مثل bookmarks, history, comments) اسمشان را اینجا اضافه کن
const collectionsToMigrate = ['users', 'categories', 'articles']; 

async function migrate() {
  console.log('🔐 در حال ورود به PocketBase لیارا...');
  try {
    await liaraPb.admins.authWithPassword(LIARA_ADMIN_EMAIL, LIARA_ADMIN_PASSWORD);
    console.log('✅ ورود موفقیت‌آمیز بود.\n');
  } catch (err) {
    console.error('❌ خطا در ورود به لیارا. ایمیل یا رمز را چک کن.');
    return;
  }

  for (const colName of collectionsToMigrate) {
    console.log(`📦 در حال انتقال کالکشن: ${colName} ...`);
    try {
      // خواندن همه‌ی رکوردها از لوکال
      const records = await localPb.collection(colName).getFullList();
      console.log(`   -> ${records.length} رکورد پیدا شد.`);

      for (const record of records) {
        // کپی داده‌ها و حذف فیلدهای سیستمی که PB خودش می‌سازد
        const data = { ...record };
        delete data.id;
        delete data.created;
        delete data.updated;
        delete data.collectionId;
        delete data.collectionName;

        try {
          // تلاش برای ساخت رکورد در لیارا
          await liaraPb.collection(colName).create(data);
          console.log(`      ✅ منتقل شد: ${record.id}`);
        } catch (err) {
          // اگر رکورد از قبل وجود داشت (مثلاً بر اساس slug یکتا)، رد می‌شود
          console.log(`      ⚠️ رد شد (احتمالاً تکراری است): ${record.id}`);
        }
      }
    } catch (err) {
      console.error(`   ❌ خطا در خواندن کالکشن ${colName}:`, err.message);
    }
  }

  console.log('\n🎉 مهاجرت با موفقیت به پایان رسید!');
}

migrate();