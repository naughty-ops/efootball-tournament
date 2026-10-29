import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { 
  sanitizeCashfreePhone, 
  verifyCashfreeWebhookSignature, 
  getCashfreeConfig 
} from '../lib/cashfree/server';
import { POST as webhookHandler } from '../app/api/webhooks/cashfree/route';

async function runTests() {
  console.log('--- Starting Cashfree Sandbox Integration Test Suite ---\n');
  let passed = 0;
  let failed = 0;

  function assert(description: string, condition: boolean, extra?: string) {
    if (condition) {
      console.log(`[PASS] ${description}`);
      passed++;
    } else {
      console.error(`[FAIL] ${description} ${extra ? `(${extra})` : ''}`);
      failed++;
    }
  }

  // 1. Phone number sanitization tests
  console.log('1. Testing Cashfree Phone Number Sanitizer...');
  assert('Normal 10-digit number is preserved', sanitizeCashfreePhone('9876543210') === '9876543210');
  assert('+91 prefix stripped properly', sanitizeCashfreePhone('+919876543210') === '9876543210');
  assert('0 prefix stripped properly', sanitizeCashfreePhone('09876543210') === '9876543210');
  assert('Spaces and hyphens removed', sanitizeCashfreePhone('+91 98765-43210') === '9876543210');
  assert('Invalid/short phone falls back to dummy 9999999999', sanitizeCashfreePhone('12345') === '9999999999');
  assert('Null/undefined/empty falls back to dummy 9999999999', sanitizeCashfreePhone(null) === '9999999999');

  // 2. Cashfree Webhook Signature Verification Tests
  console.log('\n2. Testing Cashfree Webhook HMAC-SHA256 Signature Verification...');
  const testSecret = 'cf_secret_key_test_sample_1234567890';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const payload = JSON.stringify({
    data: {
      order: {
        order_id: 'order_12345',
        order_amount: 100.00,
        order_currency: 'INR'
      },
      payment: {
        cf_payment_id: 'cf_pay_99999',
        payment_status: 'SUCCESS',
        payment_amount: 100.00,
        payment_currency: 'INR',
        payment_time: new Date().toISOString()
      }
    },
    event_time: new Date().toISOString(),
    type: 'PAYMENT_SUCCESS_WEBHOOK'
  });

  // Calculate signature: Base64(HMAC-SHA256(timestamp + payload, secret))
  const dataToSign = timestamp + payload;
  const validSignature = crypto
    .createHmac('sha256', testSecret)
    .update(dataToSign)
    .digest('base64');

  const isValid = verifyCashfreeWebhookSignature({
    rawBody: payload,
    signature: validSignature,
    timestamp: timestamp,
    secret: testSecret,
  });
  assert('Valid HMAC-SHA256 signature is accepted', isValid === true);

  const tamperedPayload = payload + ' ';
  const isTamperedPayloadValid = verifyCashfreeWebhookSignature({
    rawBody: tamperedPayload,
    signature: validSignature,
    timestamp: timestamp,
    secret: testSecret,
  });
  assert('Tampered body signature is rejected', isTamperedPayloadValid === false);

  const tamperedTimestamp = String(Number(timestamp) + 1);
  const isTamperedTsValid = verifyCashfreeWebhookSignature({
    rawBody: payload,
    signature: validSignature,
    timestamp: tamperedTimestamp,
    secret: testSecret,
  });
  assert('Tampered timestamp signature is rejected', isTamperedTsValid === false);

  const isInvalidSecretValid = verifyCashfreeWebhookSignature({
    rawBody: payload,
    signature: validSignature,
    timestamp: timestamp,
    secret: 'wrong_secret',
  });
  assert('Wrong secret key signature is rejected', isInvalidSecretValid === false);

  const isEmptySignatureValid = verifyCashfreeWebhookSignature({
    rawBody: payload,
    signature: '',
    timestamp: timestamp,
    secret: testSecret,
  });
  assert('Empty signature is safely rejected', isEmptySignatureValid === false);

  // 3. Configuration Tests
  console.log('\n3. Testing Cashfree Configuration...');
  const config = getCashfreeConfig();
  assert('Cashfree config returns an object', typeof config === 'object');
  assert('Cashfree environment is sandbox', config.environment === 'sandbox');
  assert('Cashfree baseUrl is sandbox gateway', config.baseUrl === 'https://sandbox.cashfree.com/pg');
  assert('Cashfree API version is set to 2023-08-01', config.apiVersion === '2023-08-01');
  assert('App ID is defined', !!config.appId);
  assert('Secret Key is defined', !!config.secretKey);

  // 4. Webhook Route Execution Tests (Mock NextRequest)
  console.log('\n4. Testing Cashfree Webhook Route Handler (/api/webhooks/cashfree)...');

  // 4a. Missing signature/timestamp headers returns 400
  const reqMissingHeaders = new NextRequest('http://localhost:3000/api/webhooks/cashfree', {
    method: 'POST',
    body: payload,
  });
  const resMissingHeaders = await webhookHandler(reqMissingHeaders);
  assert('Missing headers returns status 400', resMissingHeaders.status === 400);

  // 4b. Invalid signature returns 401
  const reqInvalidSig = new NextRequest('http://localhost:3000/api/webhooks/cashfree', {
    method: 'POST',
    headers: {
      'x-webhook-signature': 'invalid_signature_base64',
      'x-webhook-timestamp': timestamp,
      'content-type': 'application/json',
    },
    body: payload,
  });
  const resInvalidSig = await webhookHandler(reqInvalidSig);
  assert('Invalid signature returns status 401', resInvalidSig.status === 401);

  // 4c. Valid signature against live configured secret
  const liveSecret = config.secretKey;
  const liveSignature = crypto
    .createHmac('sha256', liveSecret)
    .update(timestamp + payload)
    .digest('base64');

  const reqValidSig = new NextRequest('http://localhost:3000/api/webhooks/cashfree', {
    method: 'POST',
    headers: {
      'x-webhook-signature': liveSignature,
      'x-webhook-timestamp': timestamp,
      'content-type': 'application/json',
    },
    body: payload,
  });
  const resValidSig = await webhookHandler(reqValidSig);
  // Unknown order in DB returns 404 (not found) safely without crashing
  assert('Valid signature passes auth and handles unknown order safely (status 404)', resValidSig.status === 404);

  // 5. Razorpay Fallback Preservation Test
  console.log('\n5. Testing Gateway Interoperability & Fallback...');
  const { isCashfreeConfigured } = await import('../lib/cashfree/server');
  assert('Cashfree configured check returns true with env vars set', isCashfreeConfigured() === true);

  console.log('\n=======================================');
  console.log(`All Tests Completed: ${passed} Passed, ${failed} Failed`);
  console.log('=======================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Unhandled error in test runner:', err);
  process.exit(1);
});
