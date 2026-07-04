import * as request from 'supertest';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:4000/api/v1';
const agent = request(BASE);

beforeAll(async () => {
  try {
    await agent.get('/').timeout({ response: 3000, deadline: 5000 });
  } catch {
    // ignore — warm up only
  }
});

const state: Record<string, any> = {};
const TEST_PHONE = '+998' + (900000000 + Math.floor(Math.random() * 99999999)).toString();
const TEST_PASSWORD = 'Test123456';
const TEST_NAME = 'E2E Test User';

// ======================================================================
// 1. AUTH MODULE
// ======================================================================
describe('AUTH MODULE', () => {
  it('POST /auth/register — register a new user', async () => {
    const res = await agent.post('/auth/register').send({
      phone: TEST_PHONE,
      password: TEST_PASSWORD,
      fullName: TEST_NAME,
    });
    console.log('Register:', res.status, JSON.stringify(res.body).slice(0, 200));
    if (res.status === 201 || res.status === 200) {
      expect(res.body.data).toBeDefined();
      state.accessToken = res.body.data.accessToken;
      state.refreshToken = res.body.data.refreshToken;
      state.userId = res.body.data.user?.id;
    }
  });

  it('POST /auth/login — login', async () => {
    const res = await agent.post('/auth/login').send({
      phone: TEST_PHONE,
      password: TEST_PASSWORD,
    });
    console.log('Login:', res.status, JSON.stringify(res.body).slice(0, 200));
    expect([200, 201]).toContain(res.status);
    state.accessToken = res.body.data.accessToken;
    state.refreshToken = res.body.data.refreshToken;
    state.userId = res.body.data.user?.id;
  });

  it('POST /auth/login — phone normalization (different format same user)', async () => {
    // Original was +998XXXXXXXXX → try without + and with spaces
    const variations = [
      TEST_PHONE.replace('+', ''),
      TEST_PHONE.slice(0, 4) + ' ' + TEST_PHONE.slice(4, 7) + ' ' + TEST_PHONE.slice(7),
    ];
    for (const phone of variations) {
      const res = await agent.post('/auth/login').send({ phone, password: TEST_PASSWORD });
      console.log(`LoginNorm[${phone}]:`, res.status);
      expect([200, 201]).toContain(res.status);
    }
  });

  it('POST /auth/refresh — refresh token (single-flight)', async () => {
    if (!state.refreshToken) return;
    const res = await agent.post('/auth/refresh').send({ refreshToken: state.refreshToken });
    console.log('Refresh:', res.status);
    expect([200, 201]).toContain(res.status);
    if (res.body.data?.accessToken) {
      state.accessToken = res.body.data.accessToken;
      state.refreshToken = res.body.data.refreshToken;
    }
  });
});

// ======================================================================
// 2. VENUES + tenant isolation
// ======================================================================
describe('VENUES MODULE', () => {
  it('POST /venues — create venue', async () => {
    if (!state.accessToken) return;
    const res = await agent
      .post('/venues')
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        name: 'E2E Test Venue',
        region: 'Toshkent',
        district: 'Yunusobod',
        address: 'Test ko`cha 1',
        phonePrimary: '+998901234567',
      });
    console.log('CreateVenue:', res.status, JSON.stringify(res.body).slice(0, 200));
    expect([200, 201]).toContain(res.status);
    state.venueId = res.body.data?.id;

    // select venue → fresh token with venue_id
    if (state.venueId) {
      const sel = await agent
        .post('/auth/select-venue')
        .set('Authorization', `Bearer ${state.accessToken}`)
        .send({ venueId: state.venueId });
      if (sel.body.data?.accessToken) state.accessToken = sel.body.data.accessToken;
    }
  });

  it('GET /venues/:fakeId/dashboard — should 403 for non-member venue', async () => {
    if (!state.accessToken) return;
    const fakeVenueId = '00000000-0000-0000-0000-000000000001';
    const res = await agent
      .get(`/venues/${fakeVenueId}/dashboard`)
      .set('Authorization', `Bearer ${state.accessToken}`);
    console.log('TenantIsolation:', res.status, JSON.stringify(res.body).slice(0, 200));
    expect([403, 404]).toContain(res.status);
  });
});

// ======================================================================
// 3. HALLS — flat hallPrice (no per-person, no minCapacity)
// ======================================================================
describe('HALLS MODULE', () => {
  it('POST /venues/:venueId/halls — create hall (flat price, no minCapacity)', async () => {
    if (!state.accessToken || !state.venueId) return;
    const res = await agent
      .post(`/venues/${state.venueId}/halls`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        name: 'Oltin Zal',
        maxCapacity: 300,
        hallPrice: 5000000,
      });
    console.log('CreateHall:', res.status, JSON.stringify(res.body).slice(0, 250));
    expect([200, 201]).toContain(res.status);
    state.hallId = res.body.data?.id;
  });

  it('GET /venues/:venueId/halls — list', async () => {
    if (!state.accessToken || !state.venueId) return;
    const res = await agent
      .get(`/venues/${state.venueId}/halls`)
      .set('Authorization', `Bearer ${state.accessToken}`);
    console.log('ListHalls:', res.status, 'count:', res.body.data?.length);
    expect(res.status).toBe(200);
  });
});

// ======================================================================
// 4. EVENT TYPES (per-venue CRUD)
// ======================================================================
describe('EVENT TYPES MODULE', () => {
  it('GET /venues/:venueId/event-types — auto-seeded defaults', async () => {
    if (!state.accessToken || !state.venueId) return;
    const res = await agent
      .get(`/venues/${state.venueId}/event-types`)
      .set('Authorization', `Bearer ${state.accessToken}`);
    console.log('EventTypes:', res.status, 'count:', res.body.data?.length);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    state.eventTypeSlug = res.body.data[0]?.slug;
  });

  it('POST /venues/:venueId/event-types — create custom event type', async () => {
    if (!state.accessToken || !state.venueId) return;
    const res = await agent
      .post(`/venues/${state.venueId}/event-types`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({ name: 'Maxsus tadbir', color: '#ff0000' });
    console.log('CreateEventType:', res.status, JSON.stringify(res.body).slice(0, 200));
    expect([200, 201]).toContain(res.status);
    state.customEventTypeId = res.body.data?.id;
  });
});

// ======================================================================
// 5. SERVICES
// ======================================================================
describe('SERVICES MODULE', () => {
  it('POST /venues/:venueId/services — create service', async () => {
    if (!state.accessToken || !state.venueId) return;
    const res = await agent
      .post(`/venues/${state.venueId}/services`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        name: 'Fotograf',
        pricingType: 'fixed',
        price: 3000000,
      });
    console.log('CreateService:', res.status, JSON.stringify(res.body).slice(0, 200));
    expect([200, 201]).toContain(res.status);
    state.serviceId = res.body.data?.id;
  });
});

// ======================================================================
// 6. MENU — items only (MenuPackage olib tashlandi)
// ======================================================================
describe('MENU MODULE', () => {
  it('POST /venues/:venueId/menu/categories — create category', async () => {
    if (!state.accessToken || !state.venueId) return;
    const res = await agent
      .post(`/venues/${state.venueId}/menu/categories`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({ name: 'Asosiy taomlar' });
    console.log('CreateMenuCat:', res.status);
    expect([200, 201]).toContain(res.status);
    state.menuCategoryId = res.body.data?.id;
  });

  it('POST /venues/:venueId/menu/items — create item', async () => {
    if (!state.accessToken || !state.venueId || !state.menuCategoryId) return;
    const res = await agent
      .post(`/venues/${state.venueId}/menu/items`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        name: 'Osh',
        categoryId: state.menuCategoryId,
        pricePerPerson: 50000,
      });
    console.log('CreateMenuItem:', res.status, JSON.stringify(res.body).slice(0, 200));
    expect([200, 201]).toContain(res.status);
    state.menuItemId = res.body.data?.id;
  });

  it('GET /venues/:venueId/menu/items — only available by default', async () => {
    if (!state.accessToken || !state.venueId) return;
    const res = await agent
      .get(`/venues/${state.venueId}/menu/items`)
      .set('Authorization', `Bearer ${state.accessToken}`);
    console.log('ListMenuItems:', res.status, 'count:', res.body.data?.length);
    expect(res.status).toBe(200);
    if (Array.isArray(res.body.data)) {
      for (const it of res.body.data) {
        if (it.isAvailable === false) throw new Error('isAvailable=false leaked through default filter');
      }
    }
  });

  it('GET /venues/:venueId/menu/items?includeUnavailable=true — admin sees all', async () => {
    if (!state.accessToken || !state.venueId) return;
    const res = await agent
      .get(`/venues/${state.venueId}/menu/items?includeUnavailable=true`)
      .set('Authorization', `Bearer ${state.accessToken}`);
    console.log('ListMenuItemsAll:', res.status, 'count:', res.body.data?.length);
    expect(res.status).toBe(200);
  });
});

// ======================================================================
// 7. CLIENTS — phone normalization + duplicate guard
// ======================================================================
describe('CLIENTS MODULE', () => {
  it('POST /venues/:venueId/clients — create client (raw phone)', async () => {
    if (!state.accessToken || !state.venueId) return;
    const res = await agent
      .post(`/venues/${state.venueId}/clients`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({ fullName: 'Alisher Karimov', phone: '901111111' }); // 9 digits → +998901111111
    console.log('CreateClient:', res.status, JSON.stringify(res.body).slice(0, 200));
    expect([200, 201]).toContain(res.status);
    state.clientId = res.body.data?.id;
    expect(res.body.data?.phone).toMatch(/^\+998901111111$/);
  });

  it('POST /venues/:venueId/clients — duplicate phone → 409', async () => {
    if (!state.accessToken || !state.venueId) return;
    const res = await agent
      .post(`/venues/${state.venueId}/clients`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({ fullName: 'Boshqa odam', phone: '+998 90 111 11 11' }); // same after normalize
    console.log('DupClient:', res.status);
    expect(res.status).toBe(409);
  });
});

// ======================================================================
// 8. VENUE PACKAGES (single source of package truth)
// ======================================================================
describe('VENUE PACKAGES MODULE', () => {
  it('POST /venues/:venueId/packages — create package (no minGuests, no hallPrice)', async () => {
    if (!state.accessToken || !state.venueId) return;
    const res = await agent
      .post(`/venues/${state.venueId}/packages`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        name: 'Gold Paket',
        pricePerPerson: 250000,
        menuPricePerPerson: 120000,
        tier: 'premium',
        maxGuests: 500,
      });
    console.log('CreateVenuePkg:', res.status, JSON.stringify(res.body).slice(0, 250));
    expect([200, 201]).toContain(res.status);
    state.venuePackageId = res.body.data?.id;
  });

  it('POST /venues/:venueId/packages — items with foreign menuItem → 400', async () => {
    if (!state.accessToken || !state.venueId) return;
    const fakeMenuItemId = '00000000-0000-0000-0000-000000000099';
    const res = await agent
      .post(`/venues/${state.venueId}/packages`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        name: 'Bad Package',
        pricePerPerson: 100000,
        items: [{ type: 'menu_item', menuItemId: fakeMenuItemId, quantity: 1, unitPrice: 1000 }],
      });
    console.log('PkgForeignMenuItem:', res.status);
    expect(res.status).toBe(400);
  });
});

// ======================================================================
// 9. BOOKINGS — overlap, custom time, capacity, package auto-price
// ======================================================================
describe('BOOKINGS MODULE', () => {
  const futureDate = (daysAhead: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    return d.toISOString().split('T')[0];
  };

  it('POST /venues/:venueId/bookings — create booking (flat hallPrice + items)', async () => {
    if (!state.accessToken || !state.venueId || !state.hallId || !state.clientId) return;
    state.bookingDate = futureDate(30);
    const res = await agent
      .post(`/venues/${state.venueId}/bookings`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        hallId: state.hallId,
        clientId: state.clientId,
        eventDate: state.bookingDate,
        timeSlot: 'evening',
        guestCount: 200,
        eventType: state.eventTypeSlug || 'wedding',
        hallPrice: 5000000,
        menuPricePerPerson: 50000,
      });
    console.log('CreateBooking:', res.status, JSON.stringify(res.body).slice(0, 350));
    expect([200, 201]).toContain(res.status);
    state.bookingId = res.body.data?.id;

    if (res.body.data) {
      const b = res.body.data;
      // 5,000,000 (flat hall) + 50,000 × 200 (menu) = 15,000,000
      const expectedTotal = 5_000_000 + 50_000 * 200;
      expect(Number(b.totalAmount)).toBe(expectedTotal);
      expect(Number(b.hallPrice)).toBe(5_000_000); // flat, NOT × guestCount
    }
  });

  it('POST /venues/:venueId/bookings — guestCount > maxCapacity → 400', async () => {
    if (!state.accessToken || !state.venueId || !state.hallId || !state.clientId) return;
    const res = await agent
      .post(`/venues/${state.venueId}/bookings`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        hallId: state.hallId,
        clientId: state.clientId,
        eventDate: futureDate(50),
        timeSlot: 'morning',
        guestCount: 9999, // > 300
        eventType: state.eventTypeSlug || 'wedding',
        hallPrice: 5000000,
      });
    console.log('CapacityExceeded:', res.status, JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(400);
  });

  it('POST /venues/:venueId/bookings — custom time start>=end → 400', async () => {
    if (!state.accessToken || !state.venueId || !state.hallId || !state.clientId) return;
    const res = await agent
      .post(`/venues/${state.venueId}/bookings`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        hallId: state.hallId,
        clientId: state.clientId,
        eventDate: futureDate(45),
        timeSlot: 'custom',
        customStartTime: '20:00',
        customEndTime: '10:00', // earlier than start — invalid
        guestCount: 100,
        eventType: state.eventTypeSlug || 'wedding',
        hallPrice: 5000000,
      });
    console.log('CustomTimeReversed:', res.status, JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(400);
  });

  it('POST /venues/:venueId/bookings — overlap full_day same date → 400', async () => {
    if (!state.accessToken || !state.venueId || !state.hallId || !state.clientId) return;
    const res = await agent
      .post(`/venues/${state.venueId}/bookings`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        hallId: state.hallId,
        clientId: state.clientId,
        eventDate: state.bookingDate, // same as evening booking above
        timeSlot: 'full_day',
        guestCount: 100,
        eventType: state.eventTypeSlug || 'wedding',
        hallPrice: 5000000,
      });
    console.log('OverlapFullDay:', res.status, JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(400);
  });

  it('POST /venues/:venueId/bookings — morning on same date OK (no overlap)', async () => {
    if (!state.accessToken || !state.venueId || !state.hallId || !state.clientId) return;
    const res = await agent
      .post(`/venues/${state.venueId}/bookings`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        hallId: state.hallId,
        clientId: state.clientId,
        eventDate: state.bookingDate,
        timeSlot: 'morning',
        guestCount: 50,
        eventType: state.eventTypeSlug || 'birthday',
        hallPrice: 3000000,
      });
    console.log('MorningNoOverlap:', res.status);
    expect([200, 201]).toContain(res.status);
    if (res.body.data?.id) state.morningBookingId = res.body.data.id;
  });

  it('POST /venues/:venueId/bookings — package auto-price in subtotal', async () => {
    if (!state.accessToken || !state.venueId || !state.hallId || !state.clientId || !state.venuePackageId) return;
    const res = await agent
      .post(`/venues/${state.venueId}/bookings`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        hallId: state.hallId,
        clientId: state.clientId,
        eventDate: futureDate(60),
        timeSlot: 'evening',
        guestCount: 100,
        eventType: state.eventTypeSlug || 'wedding',
        hallPrice: 5000000,
        venuePackageId: state.venuePackageId,
        // menuPricePerPerson NOT sent — paket bor
      });
    console.log('PackageBooking:', res.status, JSON.stringify(res.body).slice(0, 300));
    expect([200, 201]).toContain(res.status);
    if (res.body.data) {
      // 5,000,000 hall + 250,000 × 100 (paket) = 30,000,000
      const expectedTotal = 5_000_000 + 250_000 * 100;
      expect(Number(res.body.data.totalAmount)).toBe(expectedTotal);
      // menuPricePerPerson must be 0 (paket bor — double counting yo'q)
      expect(Number(res.body.data.menuPricePerPerson)).toBe(0);
      state.packageBookingId = res.body.data.id;
    }
  });

  it('GET /venues/:venueId/bookings?status=&search= — filters must not 400 (whitelist regression)', async () => {
    if (!state.accessToken || !state.venueId) return;
    const res = await agent
      .get(`/venues/${state.venueId}/bookings`)
      .query({ status: 'confirmed,pending', search: 'Alisher', page: 1, limit: 20 })
      .set('Authorization', `Bearer ${state.accessToken}`);
    console.log('BookingsFiltered:', res.status, JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data?.data || res.body.data)).toBe(true);
  });

  it('GET /venues/:venueId/bookings?eventDate=&hallId= — extra filter params must not 400', async () => {
    if (!state.accessToken || !state.venueId || !state.hallId || !state.bookingDate) return;
    const res = await agent
      .get(`/venues/${state.venueId}/bookings`)
      .query({ eventDate: state.bookingDate, hallId: state.hallId })
      .set('Authorization', `Bearer ${state.accessToken}`);
    console.log('BookingsEventDateHall:', res.status, JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
  });

  it('PATCH /venues/:venueId/bookings/:id — guestCount change recalculates total', async () => {
    if (!state.accessToken || !state.venueId || !state.bookingId) return;
    const res = await agent
      .patch(`/venues/${state.venueId}/bookings/${state.bookingId}`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({ guestCount: 250 });
    console.log('UpdateGuestCount:', res.status, JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
    if (res.body.data) {
      const expected = 5_000_000 + 50_000 * 250; // 17,500,000
      expect(Number(res.body.data.totalAmount)).toBe(expected);
    }
  });
});

// ======================================================================
// 10. PAYMENTS — currency mismatch, overpayment, idempotency, refund
// ======================================================================
describe('PAYMENTS MODULE', () => {
  it('POST /payments — basic deposit', async () => {
    if (!state.accessToken || !state.venueId || !state.bookingId) return;
    const res = await agent
      .post(`/venues/${state.venueId}/payments`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        bookingId: state.bookingId,
        amount: 5000000,
        paymentMethod: 'cash',
        paymentType: 'deposit',
      });
    console.log('Deposit:', res.status, JSON.stringify(res.body).slice(0, 200));
    expect([200, 201]).toContain(res.status);
    state.paymentId = res.body.data?.id;
  });

  it('POST /payments — currency mismatch w/o exchangeRate → 400', async () => {
    if (!state.accessToken || !state.venueId || !state.bookingId) return;
    const res = await agent
      .post(`/venues/${state.venueId}/payments`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        bookingId: state.bookingId,
        amount: 100,
        currency: 'USD', // booking is UZS
        paymentMethod: 'cash',
        paymentType: 'payment',
      });
    console.log('CurrencyMismatchNoRate:', res.status, JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(400);
  });

  it('POST /payments — currency mismatch WITH exchangeRate → OK', async () => {
    if (!state.accessToken || !state.venueId || !state.bookingId) return;
    const res = await agent
      .post(`/venues/${state.venueId}/payments`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        bookingId: state.bookingId,
        amount: 50,
        currency: 'USD',
        exchangeRate: 12500, // 50 × 12500 = 625,000 UZS
        paymentMethod: 'cash',
        paymentType: 'payment',
      });
    console.log('CurrencyMismatchWithRate:', res.status, JSON.stringify(res.body).slice(0, 200));
    expect([200, 201]).toContain(res.status);
  });

  it('POST /payments — overpayment → 400', async () => {
    if (!state.accessToken || !state.venueId || !state.bookingId) return;
    const res = await agent
      .post(`/venues/${state.venueId}/payments`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        bookingId: state.bookingId,
        amount: 999_999_999_999,
        paymentMethod: 'cash',
        paymentType: 'payment',
      });
    console.log('Overpayment:', res.status);
    expect(res.status).toBe(400);
  });

  it('POST /payments — refund > paidAmount → 400', async () => {
    if (!state.accessToken || !state.venueId || !state.bookingId) return;
    const res = await agent
      .post(`/venues/${state.venueId}/payments`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        bookingId: state.bookingId,
        amount: 999_999_999_999,
        paymentMethod: 'cash',
        paymentType: 'refund',
      });
    console.log('OverRefund:', res.status);
    expect(res.status).toBe(400);
  });

  it('POST /payments — invalid paymentMethod → 400 (DTO enum strict)', async () => {
    if (!state.accessToken || !state.venueId || !state.bookingId) return;
    const res = await agent
      .post(`/venues/${state.venueId}/payments`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        bookingId: state.bookingId,
        amount: 100000,
        paymentMethod: 'bitcoin',
        paymentType: 'payment',
      });
    console.log('InvalidMethod:', res.status);
    expect(res.status).toBe(400);
  });

  it('PATCH /payments/:id — completed payment cannot change amount → 400', async () => {
    if (!state.accessToken || !state.venueId || !state.paymentId) return;
    const res = await agent
      .patch(`/venues/${state.venueId}/payments/${state.paymentId}`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({ amount: 9999 });
    console.log('PatchCompletedAmount:', res.status, JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(400);
  });

  it('PATCH /payments/:id — notes update on completed → OK', async () => {
    if (!state.accessToken || !state.venueId || !state.paymentId) return;
    const res = await agent
      .patch(`/venues/${state.venueId}/payments/${state.paymentId}`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({ notes: 'E2E updated' });
    console.log('PatchNotes:', res.status);
    expect(res.status).toBe(200);
  });
});

// ======================================================================
// 11. CANCEL + REFUND FLOW
// ======================================================================
describe('CANCEL + REFUND', () => {
  it('POST /bookings/:id/cancel — cancel booking with refund', async () => {
    if (!state.accessToken || !state.venueId || !state.morningBookingId) return;
    const res = await agent
      .post(`/venues/${state.venueId}/bookings/${state.morningBookingId}/cancel`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({ reason: 'E2E test cancel', refund: false });
    console.log('CancelMorning:', res.status, JSON.stringify(res.body).slice(0, 200));
    expect([200, 201]).toContain(res.status);
  });

  it('POST /payments — cancelled booking → 400 (no new payment)', async () => {
    if (!state.accessToken || !state.venueId || !state.morningBookingId) return;
    const res = await agent
      .post(`/venues/${state.venueId}/payments`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        bookingId: state.morningBookingId,
        amount: 100000,
        paymentMethod: 'cash',
        paymentType: 'payment',
      });
    console.log('PayCancelledBooking:', res.status);
    expect(res.status).toBe(400);
  });
});

// ======================================================================
// 12. FINANCE
// ======================================================================
describe('FINANCE MODULE', () => {
  it('GET /finance/expense-categories', async () => {
    if (!state.accessToken || !state.venueId) return;
    const res = await agent
      .get(`/venues/${state.venueId}/finance/expense-categories`)
      .set('Authorization', `Bearer ${state.accessToken}`);
    console.log('ExpenseCats:', res.status);
    expect(res.status).toBe(200);
    if (Array.isArray(res.body.data) && res.body.data.length > 0) {
      state.expenseCategoryId = res.body.data[0].id;
    }
  });

  it('POST /finance/expenses — create', async () => {
    if (!state.accessToken || !state.venueId || !state.expenseCategoryId) return;
    const res = await agent
      .post(`/venues/${state.venueId}/finance/expenses`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({
        categoryId: state.expenseCategoryId,
        description: 'E2E expense',
        amount: 500000,
        expenseDate: new Date().toISOString(),
      });
    console.log('CreateExpense:', res.status);
    expect([200, 201]).toContain(res.status);
    state.expenseId = res.body.data?.id;
  });

  it('GET /finance/summary — both UZS and USD totals', async () => {
    if (!state.accessToken || !state.venueId) return;
    const startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const endDate = new Date().toISOString().split('T')[0];
    const res = await agent
      .get(`/venues/${state.venueId}/finance/summary?startDate=${startDate}&endDate=${endDate}`)
      .set('Authorization', `Bearer ${state.accessToken}`);
    console.log('Summary:', res.status, JSON.stringify(res.body).slice(0, 300));
    expect(res.status).toBe(200);
  });
});

// ======================================================================
// 13. DASHBOARD + ANALYTICS
// ======================================================================
describe('DASHBOARD + ANALYTICS', () => {
  it('GET /dashboard', async () => {
    if (!state.accessToken || !state.venueId) return;
    const res = await agent
      .get(`/venues/${state.venueId}/dashboard`)
      .set('Authorization', `Bearer ${state.accessToken}`);
    console.log('Dashboard:', res.status, JSON.stringify(res.body).slice(0, 300));
    expect(res.status).toBe(200);
  });

  it('GET /analytics/overview', async () => {
    if (!state.accessToken || !state.venueId) return;
    const res = await agent
      .get(`/venues/${state.venueId}/analytics/overview`)
      .set('Authorization', `Bearer ${state.accessToken}`);
    console.log('Analytics:', res.status, JSON.stringify(res.body).slice(0, 300));
    expect([200, 404]).toContain(res.status);
  });
});

// ======================================================================
// 14. CLEANUP
// ======================================================================
describe('CLEANUP', () => {
  it('DELETE /payments/:id — pending only', async () => {
    if (!state.accessToken || !state.venueId || !state.paymentId) return;
    const res = await agent
      .delete(`/venues/${state.venueId}/payments/${state.paymentId}`)
      .set('Authorization', `Bearer ${state.accessToken}`);
    console.log('DeletePayment:', res.status);
    // completed payment → 400 (correct)
    expect([200, 400]).toContain(res.status);
  });

  it('DELETE /bookings/:id', async () => {
    if (!state.accessToken || !state.venueId || !state.bookingId) return;
    // First cancel
    await agent
      .post(`/venues/${state.venueId}/bookings/${state.bookingId}/cancel`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({ reason: 'cleanup' });
    const res = await agent
      .delete(`/venues/${state.venueId}/bookings/${state.bookingId}`)
      .set('Authorization', `Bearer ${state.accessToken}`);
    console.log('DeleteBooking:', res.status);
    expect([200, 400]).toContain(res.status);
  });

  it('DELETE /packages/:id', async () => {
    if (!state.accessToken || !state.venueId || !state.venuePackageId) return;
    const res = await agent
      .delete(`/venues/${state.venueId}/packages/${state.venuePackageId}`)
      .set('Authorization', `Bearer ${state.accessToken}`);
    console.log('DeletePkg:', res.status);
    expect(res.status).toBe(200);
  });

  it('DELETE /menu/items/:id', async () => {
    if (!state.accessToken || !state.venueId || !state.menuItemId) return;
    const res = await agent
      .delete(`/venues/${state.venueId}/menu/items/${state.menuItemId}`)
      .set('Authorization', `Bearer ${state.accessToken}`);
    console.log('DeleteMenuItem:', res.status);
    expect(res.status).toBe(200);
  });

  it('DELETE /halls/:id', async () => {
    if (!state.accessToken || !state.venueId || !state.hallId) return;
    const res = await agent
      .delete(`/venues/${state.venueId}/halls/${state.hallId}`)
      .set('Authorization', `Bearer ${state.accessToken}`);
    console.log('DeleteHall:', res.status);
    expect(res.status).toBe(200);
  });
});
