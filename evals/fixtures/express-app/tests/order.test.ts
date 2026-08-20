import { createOrder } from '../src/services/order'
test('creates an order', async () => { expect(await createOrder({}, {})).toBeDefined() })
