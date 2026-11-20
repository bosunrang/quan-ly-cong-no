const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { performance } = require('node:perf_hooks');
const { openDatabase, DATASET_KEYS } = require('../../electron/database.cjs');
const { startDevelopmentServer } = require('../../server/development.cjs');

async function main() {
  const rows = Number(process.argv[2] ?? 50_000);
  if (!Number.isSafeInteger(rows) || rows < 100 || rows > 250_000) throw new Error('Số dòng phải từ 100 đến 250.000.');
  const directory = mkdtempSync(join(tmpdir(), 'cong-no-benchmark-'));
  const time = '2025-12-31T00:00:00.000Z';
  let host;
  try {
    const db = openDatabase(join(directory, 'cong-no.sqlite'));
    const customers = Array.from({ length: Math.min(500, Math.floor(rows / 10)) }, (_, i) => ({
      id: 'C' + i, name: 'Khách hàng ' + i, misaCode: 'KH' + i, taxCode: '', address: '', province: 'Hà Nội',
      group: 'unknown', status: 'active', createdAt: time, updatedAt: time, assignments: [],
    }));
    const salesBook = { fileName: 'benchmark.xlsx', importedAt: time, rows: Array.from({ length: rows }, (_, i) => {
      const customer = customers[i % customers.length];
      return { rowNumber: i + 1, date: '2025-12-01', documentNumber: 'BH' + i, invoiceNumber: String(i),
        customerName: customer.name, productName: 'Hàng hóa ' + (i % 100), unit: 'Hộp',
        quantity: 1, unitPrice: 100, salesAmount: 100, paymentTotal: 100, source: {
          customerCode: customer.misaCode, invoiceSeries: '25', invoiceDate: '2025-12-01', debitAccount: '131',
        } };
    }) };
    try {
      db.writeDataset(DATASET_KEYS.customers, 2, customers);
      db.writeMisaSalesBook(null, salesBook);
      db.writeReceiptLedger('', { revision: 'test', allocations: [], receipts: customers.map((person, i) => ({
        id: 'R' + i, number: 'PT-2025-' + i, date: '2025-12-10', amount: 100, createdAt: time,
        customerId: person.id, customerName: person.name, customerCode: person.misaCode, reference: '',
      })) });
    } finally { db.close(); }
    host = await startDevelopmentServer(directory);
    await host.server.initializeAdministrator('benchmark-temp-123');
    let cookie;
    const measurements = [];
    async function request(resource, method = 'GET', body) {
      const started = performance.now();
      const response = await fetch(host.target + '/api/' + resource, { method,
        headers: { 'X-Cong-No-LAN': '1', ...(cookie ? { cookie } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body) });
      const serialized = await response.text();
      assert.equal(response.status, 200, resource + ' ' + serialized.slice(0, 240));
      cookie = response.headers.get('set-cookie')?.split(';')[0] ?? cookie;
      if (method === 'GET')
        measurements.push({ resource, ms: Math.round(performance.now() - started), bytes: Buffer.byteLength(serialized) });
      return JSON.parse(serialized).value;
    }
    await request('session', 'POST', { username: 'admin', password: 'benchmark-temp-123' });
    await request('session/password', 'PATCH', { password: 'benchmark-next-456' });
    const sales = await request('sales-book?page=2&limit=25');
    assert.equal(sales.rows.length, 25);
    assert.equal(sales.total, rows);
    const totals = await request('dashboard?from=2025-12-01&through=2025-12-31');
    assert.equal(totals.remaining, rows * 100);
    await request('dashboard?from=2025-12-01&through=2025-12-31&page=2');
    const receivables = await request('receivables?q=Khach%20hang&limit=10');
    assert.equal(receivables.rows.items.length, 10);
    const id = encodeURIComponent(receivables.rows.items[0].id);
    const invoices = await request('receivables/' + id + '/invoices?limit=10');
    assert.equal(invoices.items.length, 10);
    assert.ok(invoices.items.every((invoice) => !('lines' in invoice)));
    const receipts = await request('receipts?limit=10');
    assert.equal(receipts.items.length, 10);
    await request('receipts/R0/candidates?limit=10');
    await request('reports/statements/C0?from=2025-12-01&through=2025-12-31');
    console.log(JSON.stringify({ salesRows: rows, customers: customers.length, measurements }, null, 2));
  } finally {
    if (host) await host.stop();
    rmSync(directory, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
