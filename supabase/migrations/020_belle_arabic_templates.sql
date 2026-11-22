-- Belle Arabic WhatsApp templates (Meta-approved names). Keeps staff_document_expiry (wt5).
update public.whatsapp_templates set active = false where id = 'wt4';

insert into public.whatsapp_templates (
  id, name, whatsapp_template_name, language, category, trigger_days, description, body, active
) values
(
  'wt8', 'My Belle launch', 'my_belle_launch', 'ar', 'MARKETING', null,
  'Served customers — introduce My Belle. Button: دخول My Belle',
  $b$بيل أقرب لِك 💚

يسعدنا نعرّفك على My Belle ✨

مساحتك الخاصة مع Belle، صممناها عشان تكون حجوزاتك، مزاياك وهداياك كلها في مكان واحد.

فعّلي حسابك الآن وكمّلي بياناتك عشان تبدأ تجربتك معنا.$b$,
  true
),
(
  'wt9', 'Welcome auto reply', 'welcome_auto_reply', 'ar', 'UTILITY', null,
  'First automatic reply when a customer messages Belle',
  $b$أهلاً بِك في Belle 💚

يسعدنا خدمتك ✨

اختاري الخدمة اللي تحتاجينها، وفريقنا بيساعدك في ترتيب حجزك بكل سهولة.

كيف نقدر نخدمك اليوم؟$b$,
  true
),
(
  'wt10', 'Booking payment request', 'booking_payment_request', 'ar', 'UTILITY', null,
  'Ask for payment to confirm a booking. {{1}} service {{2}} date {{3}} time {{4}} amount. Button: إكمال الدفع (dynamic URL)',
  $b$لتأكيد حجزك مع Belle 💚

يرجى إكمال عملية الدفع لتثبيت موعدك.

الخدمة: {{1}}
التاريخ: {{2}}
الوقت: {{3}}
المبلغ: {{4}}$b$,
  true
),
(
  'wt11', 'Booking confirmed', 'booking_confirmed', 'ar', 'UTILITY', null,
  'After payment. {{1}} service {{2}} date {{3}} time',
  $b$تم تأكيد حجزك مع Belle 💚

تم استلام دفعتك بنجاح، وموعدك أصبح مؤكداً ✨

الخدمة: {{1}}
التاريخ: {{2}}
الوقت: {{3}}

نتطلع لخدمتك 💚$b$,
  true
),
(
  'wt12', 'One hour before appointment', 'appointment_reminder_one_hour', 'ar', 'UTILITY', null,
  'One hour before the appointment. {{1}} service {{2}} time',
  $b$موعدك مع Belle بعد ساعة 💚

الخدمة: {{1}}
الوقت: {{2}}

فريق Belle في طريقه إليك 💚$b$,
  true
),
(
  'wt6', 'After service feedback', 'service_feedback', 'ar', 'UTILITY', null,
  'After a visit. Button: قيّمي تجربتك',
  $b$شكراً لاختيارك Belle 💚

نتمنى إن تجربتك اليوم كانت مثل ما تحبين ✨

رأيك يهمنا ويساعدنا نقدم لِك تجربة أجمل في كل مرة.$b$,
  true
),
(
  'wt1', 'No booking 30 days', 'reengagement_30_days', 'ar', 'MARKETING', 30,
  'No visit for 30 days. Button: احجزي موعدك',
  $b$حان وقتك مع Belle 💚

مرّ شهر على آخر موعد لِك، ويسعدنا نكون جزء من لحظات عنايتك من جديد ✨

اختاري موعدك، وخلّي العناية توصلك.$b$,
  true
),
(
  'wt2', 'No booking 60 days', 'reengagement_60_days', 'ar', 'MARKETING', 60,
  'No visit for 60 days. Button: احجزي موعدك',
  $b$لحظات العناية تستحق وقتها 💚

مرّ بعض الوقت على آخر موعد لِك مع Belle، وحبّينا نذكّرك بوقت خاص لِك ✨

نحن دائماً بالقرب منك.$b$,
  true
),
(
  'wt3', 'No booking 90 days — 15% offer', 'reengagement_90_days_offer', 'ar', 'MARKETING', 90,
  'No visit for 90 days with 15% offer. Button: استفيدي من عرضك',
  $b$دائماً لِك مكان في Belle 💚

مرّ وقت على آخر تجربة لِك معنا، ويسعدنا أن نرحب بِك من جديد ✨

خصم 15% بانتظارك على حجزك القادم، لتعودي للحظاتك الخاصة مع Belle 💚$b$,
  true
),
(
  'wt7', 'Gift received', 'gift_received', 'ar', 'UTILITY', null,
  'Sent to the gift receiver. Button: احجزي هديتك',
  $b$وصلتك هدية من شخص مُحب 💚

يسعدنا في Belle نوصل لِك هديتك ونرتب تجربتك في الوقت اللي يناسبك ✨

تواصلي معنا لاختيار موعدك.$b$,
  true
),
(
  'wt13', 'Birthday — Regular', 'birthday_regular', 'ar', 'MARKETING', null,
  'Birthday 20% off for Regular. Valid 1 week. Button: احجزي موعدك',
  $b$يوم ميلاد سعيد من Belle 🎂💚

نتمنى لِك عاماً مليئاً باللحظات الجميلة والسعادة ✨

احتفالاً بيومك، خصم 20% بانتظارك على حجزك القادم 💚

خصم الميلاد صالح لمدة أسبوع.$b$,
  true
),
(
  'wt14', 'Birthday — Gold', 'birthday_gold', 'ar', 'MARKETING', null,
  'Birthday 50% off for Gold. Valid 1 week. Button: احجزي موعدك',
  $b$يوم ميلاد سعيد لعميلتنا Gold 🎂💚

لأن يومك يستحق عناية خاصة، خصم 50% بانتظارك من Belle ✨

خصم الميلاد صالح لمدة أسبوع.$b$,
  true
),
(
  'wt15', 'Birthday — Premium', 'birthday_premium', 'ar', 'MARKETING', null,
  'Birthday 50% off for Premium. Valid 1 week. Button: احجزي موعدك',
  $b$يوم ميلاد سعيد لعميلتنا Premium 🎂💚

احتفالاً بيومك، خصم 50% بانتظارك لتختاري تجربتك مع Belle ✨

خصم الميلاد صالح لمدة أسبوع.$b$,
  true
),
(
  'wt16', 'Upgrade to Gold', 'membership_upgrade_gold', 'ar', 'UTILITY', null,
  'Customer reached Gold. Button: عرض مزاياي',
  $b$أصبحتِ الآن Gold في My Belle 💚

ومع مستواك الجديد، تنتظرك مزايا خاصة ✨

• خصم دائم 5% على حجوزاتك
• خدمة Pedi & Mani مجانية
• خصم 50% بمناسبة ميلادك
• أولوية في الحجز

خصم الميلاد صالح لمدة أسبوع.

استمتعي بمزايا Gold مع Belle 💚$b$,
  true
),
(
  'wt17', 'Upgrade to Premium', 'membership_upgrade_premium', 'ar', 'UTILITY', null,
  'Customer reached Premium. Button: عرض مزاياي',
  $b$أصبحتِ الآن Premium في My Belle 💚

ووصلتِ إلى أعلى مستوى من مزايا Belle ✨

• خصم دائم 10% على حجوزاتك
• خدمة مجانية واحدة من اختيارك
• خصم 50% بمناسبة ميلادك
• أولوية في الحجز

خصم الميلاد صالح لمدة أسبوع.

استمتعي بمزايا Premium مع Belle 💚$b$,
  true
),
(
  'wt18', 'AED 1,000 reward', 'spending_reward_1000', 'ar', 'UTILITY', null,
  'Eligible spend reached AED 1,000. Button: اختاري مكافأتك',
  $b$لديك مكافأة جديدة من Belle 💚

وصل إنفاقك المؤهل إلى 1,000 درهم، واستحقيتِ خدمة واحدة مجانية من اختيارك ✨

اختاري خدمتك واستمتعي بمكافأتك.$b$,
  true
),
(
  'wt19', 'Membership downgrade warning', 'membership_downgrade_warning', 'ar', 'UTILITY', null,
  '7 days before level change. Button: احجزي موعدك',
  $b$حافظي على مستواك في My Belle 💚

باقي 7 أيام قبل تغيير مستوى عضويتك بسبب عدم وجود حجز مؤهل.

احجزي خلال هذه الفترة للاحتفاظ بمستواك ومزاياك ✨$b$,
  true
),
(
  'wt20', 'Membership level updated', 'membership_level_updated', 'ar', 'UTILITY', null,
  'Level changed after 45 days without a qualifying booking. Button: عرض تفاصيل المستوى',
  $b$تم تحديث مستواك في My Belle 💚

بسبب عدم وجود حجز مؤهل خلال 45 يوماً، تم تغيير مستوى عضويتك.

إنفاقك السابق محفوظ، وتقدرين تسترجعين مستواك من جديد ✨$b$,
  true
),
(
  'wt21', 'Gold restored', 'membership_gold_restored', 'ar', 'UTILITY', null,
  'Gold level restored. Button: عرض مزاياي',
  $b$مرحباً بعودتك إلى Gold 💚

تم استرجاع مستواك، وعادت لِك مزايا Gold من جديد ✨$b$,
  true
),
(
  'wt22', 'Premium restored', 'membership_premium_restored', 'ar', 'UTILITY', null,
  'Premium level restored. Button: عرض مزاياي',
  $b$مرحباً بعودتك إلى Premium 💚

تم استرجاع مستواك، وعادت لِك مزايا Premium من جديد ✨$b$,
  true
),
(
  'wt23', 'Gift expiry reminder', 'gift_expiry_reminder', 'ar', 'UTILITY', null,
  'Gift about to expire. Button: احجزي هديتك',
  $b$هديتك من Belle بانتظارك 💚

نذكّرك أن مدة الاستفادة من هديتك قاربت على الانتهاء ✨

احجزي موعدك واستمتعي بهديتك قبل انتهاء صلاحيتها.$b$,
  true
)
on conflict (id) do update set
  name = excluded.name,
  whatsapp_template_name = excluded.whatsapp_template_name,
  language = excluded.language,
  category = excluded.category,
  trigger_days = excluded.trigger_days,
  description = excluded.description,
  body = excluded.body,
  active = excluded.active;
