// Demo seed data. Prices, hours and copy are illustrative and need owner approval.
const U = 'https://images.unsplash.com/';

export const DEFAULT_SETTINGS = {
  hero_title: 'Good coffee. Great stories. Every day.',
  hero_text: 'A Quesnel gathering place, thoughtfully reimagined for the next chapter.',
  hero_image: U + 'photo-1442512595331-e89e73853f31?w=1800&q=85',
  story_text: "Granville's Coffee is a beloved downtown Quesnel gathering place. This digital concept celebrates community and craft.",
  story_long: 'Every cup starts with people: the regulars who know each other by name, the students cramming before exams, the families stopping in after the farmers market. We roast-pick our beans with care, bake every morning, and keep the door open for whoever needs a warm seat and a good conversation.',
  announcement: 'New: order ahead for pickup and earn loyalty points on every visit.',
  address: 'Downtown Quesnel, British Columbia',
  phone: '',
  email: '',
  hours: 'Monday – Friday|7:00 am – 5:00 pm\nSaturday|8:00 am – 4:00 pm\nSunday|9:00 am – 3:00 pm',
  map_query: "Granville's Coffee Quesnel BC",
  instagram: '',
  facebook: ''
};

// art: local illustration used when the photo is missing or fails to load.
export const DEFAULT_PRODUCTS = [
  ['Velvet Latte', 'Rich espresso with silky steamed milk.', 'Coffee', 5.75, 120, U + 'photo-1461023058943-07fcbe16d735?w=700', 'latte', true],
  ['Cappuccino', 'Balanced espresso, steamed milk and foam.', 'Coffee', 5.25, 100, U + 'photo-1570968915860-54d5c301fa9f?w=700', 'latte', true],
  ['Drip Coffee', 'Our house blend, brewed fresh all day. Free refills in-house.', 'Coffee', 3.25, 200, '', 'latte', false],
  ['Americano', 'Double espresso lengthened with hot water.', 'Coffee', 4.25, 150, '', 'latte', false],
  ['Flat White', 'Ristretto shots with velvety micro-foam.', 'Coffee', 5.50, 90, '', 'latte', false],
  ['Mocha', 'Espresso, dark chocolate and steamed milk.', 'Coffee', 6.25, 80, '', 'latte', true],
  ['Cold Brew', 'Steeped 18 hours for a smooth, low-acid sip.', 'Cold Drinks', 5.25, 60, '', 'iced', true],
  ['Iced Caramel Latte', 'Espresso, milk and house caramel over ice.', 'Cold Drinks', 6.25, 70, '', 'iced', false],
  ['London Fog', 'Earl Grey, vanilla and steamed milk.', 'Tea', 5.50, 80, '', 'tea', true],
  ['Chai Latte', 'Warming spiced chai with steamed milk.', 'Tea', 5.75, 80, '', 'tea', false],
  ['Butter Croissant', 'Golden, flaky and baked fresh.', 'Bakery', 4.50, 60, U + 'photo-1555507036-ab1f4038808a?w=700', 'croissant', true],
  ['Blueberry Muffin', 'Bursting with berries and a crumble top.', 'Bakery', 3.95, 48, '', 'muffin', false],
  ['Cinnamon Bun', 'Soft, gooey and glazed every morning.', 'Bakery', 4.75, 36, '', 'croissant', false],
  ['Nanaimo Bar', 'The BC classic: chocolate, custard and coconut crumb.', 'Bakery', 4.25, 40, '', 'bar', true],
  ['Breakfast Sandwich', 'A hearty morning favourite.', 'Kitchen', 9.50, 35, U + 'photo-1525351484163-7529414344d8?w=700', 'sandwich', true],
  ['Avocado Toast', 'Smashed avocado, chili flakes and lemon on sourdough.', 'Kitchen', 10.50, 25, '', 'toast', false],
  ['Turkey Club Panini', 'Roast turkey, bacon, cheddar and greens, pressed hot.', 'Kitchen', 12.50, 25, '', 'sandwich', false],
  ['Soup of the Day', 'Made from scratch in small batches. Ask what is simmering.', 'Kitchen', 7.95, 30, '', 'soup', false]
].map(([name, description, category, price, stock, image_url, art, featured], i) => ({
  id: 'p' + String(i + 1).padStart(3, '0'), name, description, category, price, stock, image_url, art, featured, active: true, sort_order: i + 1
}));

export const DEFAULT_PROMOS = [
  { code: 'WELCOME10', percent: 10, active: true, members_only: false },
  { code: 'MEMBER15', percent: 15, active: true, members_only: true }
];

// Test accounts. Passwords are hashed at first load; plain text lives only here and in README.
export const TEST_ACCOUNTS = [
  { id: 'u-admin', email: 'admin@granvilles.test', password: 'Admin#2026', full_name: 'Site Administrator', phone: '', role: 'admin' },
  { id: 'u-member', email: 'member@granvilles.test', password: 'Member#2026', full_name: 'Jordan Rivers', phone: '250-555-0142', role: 'member' }
];

// A few past orders so the dashboard and member history are not empty.
export function demoOrders(products) {
  const pick = n => products.find(p => p.name === n);
  const plan = [
    [13, 'Jordan', 'member@granvilles.test', 'u-member', [['Velvet Latte', 1], ['Butter Croissant', 1]]],
    [12, 'Sam', 'sam@example.com', null, [['Cappuccino', 2]]],
    [10, 'Priya', null, null, [['Breakfast Sandwich', 1], ['Drip Coffee', 1]]],
    [9, 'Jordan', 'member@granvilles.test', 'u-member', [['Cold Brew', 1], ['Nanaimo Bar', 1]]],
    [7, 'Alex', 'alex@example.com', null, [['Mocha', 1], ['Cinnamon Bun', 2]]],
    [6, 'Mei', null, null, [['London Fog', 1]]],
    [5, 'Jordan', 'member@granvilles.test', 'u-member', [['Turkey Club Panini', 1], ['Iced Caramel Latte', 1]]],
    [4, 'Chris', 'chris@example.com', null, [['Avocado Toast', 1], ['Flat White', 1]]],
    [3, 'Sam', 'sam@example.com', null, [['Velvet Latte', 2], ['Blueberry Muffin', 2]]],
    [2, 'Taylor', null, null, [['Soup of the Day', 2], ['Americano', 2]]],
    [1, 'Alex', 'alex@example.com', null, [['Chai Latte', 1]]],
    [0, 'Jordan', 'member@granvilles.test', 'u-member', [['Cappuccino', 1], ['Butter Croissant', 1]]]
  ];
  const statuses = ['completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'ready', 'new'];
  return plan.map(([daysAgo, name, email, user_id, lines], i) => {
    const items = lines.map(([n, q]) => { const p = pick(n); return { product_id: p.id, name: p.name, quantity: q, unit_price: p.price }; });
    const subtotal = round(items.reduce((a, it) => a + it.quantity * it.unit_price, 0));
    const created = new Date(Date.now() - daysAgo * 86400000 - (i % 5) * 3600000);
    return {
      id: 'o' + (i + 1), order_number: 'GV-' + (100000 + i * 7919).toString(36).toUpperCase().padStart(6, '0'),
      pickup_name: name, email, user_id, subtotal, discount: 0, total: subtotal, status: statuses[i],
      created_at: created.toISOString(), items
    };
  });
}

export const round = n => Math.round(n * 100) / 100;
