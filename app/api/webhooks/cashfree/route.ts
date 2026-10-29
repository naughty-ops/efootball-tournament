import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyCashfreeWebhookSignature, isCashfreeConfigured } from '@/lib/cashfree/server';
import { getPlayerProfile } from '@/services/playerDashboardService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/cashfree
 *
 * Production-ready Cashfree Webhook Handler
 *
 * Responsibilities:
 * 1. Reads raw request body as string before parsing.
 * 2. Cryptographically verifies x-webhook-signature using HMAC-SHA256 over (timestamp + rawBody).
 * 3. Enforces idempotency via public.payment_webhook_events(event_id).
 * 4. Processes:
 *    - PAYMENT_SUCCESS_WEBHOOK: Reconciles payments, records payment_transactions,
 *      and invokes authoritative confirm_tournament_reservation RPC.
 *    - PAYMENT_FAILED_WEBHOOK: Marks payment_orders as failed and records audit log.
 * 5. Returns 200 OK for successful or duplicate events; 401 for invalid signature; 500 for transient DB errors.
 */
export async function POST(request: NextRequest) {
  // 1. Read raw body as string BEFORE parsing
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (readErr) {
    console.error('[Cashfree Webhook] Failed to read request body:', readErr);
    return NextResponse.json({ error: 'Failed to read request payload.' }, { status: 400 });
  }

  // 2. Validate headers: x-webhook-signature and x-webhook-timestamp
  const signature = request.headers.get('x-webhook-signature');
  const timestamp = request.headers.get('x-webhook-timestamp');

  if (!signature || !timestamp) {
    console.error('[Cashfree Webhook] Missing required signature or timestamp headers.');
    return NextResponse.json({ error: 'Missing webhook signature or timestamp headers.' }, { status: 400 });
  }

  // 3. Cryptographically verify signature using server-only secret
  let isValidSignature = false;
  try {
    isValidSignature = verifyCashfreeWebhookSignature({ rawBody, signature, timestamp });
  } catch (configErr: any) {
    console.error('[Cashfree Webhook] Configuration error during verification:', configErr?.message);
    return NextResponse.json(
      { error: 'Webhook service configuration error. CASHFREE_SECRET_KEY is not set.' },
      { status: 500 }
    );
  }

  if (!isValidSignature) {
    console.error('[Cashfree Webhook] Invalid webhook signature detected.');
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  }

  // 4. Safely parse payload JSON
  let eventPayload: any;
  try {
    eventPayload = JSON.parse(rawBody);
  } catch {
    console.error('[Cashfree Webhook] Malformed JSON payload received.');
    return NextResponse.json({ error: 'Malformed JSON payload.' }, { status: 400 });
  }

  const eventType = eventPayload?.type;
  const paymentData = eventPayload?.data?.payment;
  const orderData = eventPayload?.data?.order;
  const customerData = eventPayload?.data?.customer_details;

  const orderId = orderData?.order_id;
  const cfPaymentId = paymentData?.cf_payment_id ? String(paymentData.cf_payment_id) : null;
  const eventId = cfPaymentId ? `cf_evt_${cfPaymentId}` : eventPayload?.event_time ? `cf_evt_${orderId}_${eventPayload.event_time}` : null;

  if (!eventType || !orderId) {
    console.error('[Cashfree Webhook] Missing event type or order_id in payload.');
    return NextResponse.json({ error: 'Missing event type or order_id.' }, { status: 400 });
  }

  // 5. Establish privileged database connection
  let adminClient: any;
  try {
    adminClient = createAdminClient();
  } catch (clientErr: any) {
    console.error('[Cashfree Webhook] Service-role client error:', clientErr?.message);
    return NextResponse.json(
      { error: 'Internal database client configuration error.' },
      { status: 500 }
    );
  }

  // 6. Idempotency Check using public.payment_webhook_events(event_id)
  if (eventId) {
    const { data: existingEvent, error: queryEventErr } = await adminClient
      .from('payment_webhook_events')
      .select('id, status, event_type')
      .eq('event_id', eventId)
      .maybeSingle();

    if (queryEventErr) {
      console.error('[Cashfree Webhook] Error checking event idempotency:', queryEventErr);
      return NextResponse.json({ error: 'Database error checking webhook idempotency.' }, { status: 500 });
    }

    if (existingEvent) {
      return NextResponse.json({
        success: true,
        message: `Webhook event ${eventId} has already been processed.`,
        idempotent: true,
      });
    }
  }

  // 7. Route and process supported event types
  try {
    if (eventType === 'PAYMENT_SUCCESS_WEBHOOK') {
      // Lookup platform payment order
      const { data: orderRecord, error: orderErr } = await adminClient
        .from('payment_orders')
        .select('id, registration_id, tournament_id, user_id, amount_paise, currency, status')
        .or(`gateway_order_id.eq.${orderId},razorpay_order_id.eq.${orderId}`)
        .maybeSingle();

      if (orderErr) {
        console.error('[Cashfree Webhook] Error retrieving payment_order:', orderErr);
        return NextResponse.json({ error: 'Database error retrieving payment order.' }, { status: 500 });
      }

      if (!orderRecord) {
        console.error('[Cashfree Webhook] Unknown order ID received:', orderId);
        return NextResponse.json({ error: 'Unknown payment order ID.' }, { status: 404 });
      }

      // Fetch tournament and registration records
      const [tournRes, regRes] = await Promise.all([
        adminClient
          .from('tournaments')
          .select('id, name, status, entry_fee_paise, currency, is_paid')
          .eq('id', orderRecord.tournament_id)
          .maybeSingle(),
        adminClient
          .from('tournament_registrations')
          .select('id, tournament_id, user_id, status, amount_paise, currency, participant_id, payment_transaction_id')
          .eq('id', orderRecord.registration_id)
          .maybeSingle(),
      ]);

      const tournament = tournRes.data;
      const registration = regRes.data;

      if (!tournament || !registration) {
        console.error('[Cashfree Webhook] Associated tournament or registration not found for order:', orderId);
        return NextResponse.json({ error: 'Associated tournament or registration not found.' }, { status: 404 });
      }

      // Idempotency check: Already confirmed
      if (registration.status === 'confirmed') {
        if (eventId) {
          await adminClient.from('payment_webhook_events').insert({
            event_id: eventId,
            event_type: eventType,
            payload: eventPayload,
            status: 'processed',
          });
        }
        return NextResponse.json({
          success: true,
          message: 'Registration is already confirmed.',
          idempotent: true,
          participantId: registration.participant_id,
        });
      }

      // Invariant: Status must be SUCCESS
      if (paymentData?.payment_status !== 'SUCCESS') {
        console.warn(`[Cashfree Webhook] Payment status is ${paymentData?.payment_status}; not SUCCESS.`);
        return NextResponse.json(
          { error: `Payment is not in SUCCESS status (current: ${paymentData?.payment_status}).` },
          { status: 402 }
        );
      }

      // Invariant: Amount check
      const expectedAmountPaise = Number(tournament.entry_fee_paise);
      const paidAmountPaise = Math.round(Number(paymentData?.payment_amount || 0) * 100);

      if (paidAmountPaise !== expectedAmountPaise) {
        console.error(
          `[Cashfree Webhook] Amount mismatch: expected ${expectedAmountPaise} paise, got ${paidAmountPaise}`
        );
        return NextResponse.json({ error: 'Payment amount mismatch. Transaction rejected.' }, { status: 400 });
      }

      // Invariant: Currency check
      const expectedCurrency = (tournament.currency || 'INR').toUpperCase();
      const paidCurrency = String(paymentData?.payment_currency || '').toUpperCase();

      if (paidCurrency !== expectedCurrency) {
        return NextResponse.json({ error: 'Payment currency mismatch. Transaction rejected.' }, { status: 400 });
      }

      // Persist or retrieve payment_transactions record
      let transactionRecord: any = null;
      const { data: existingTx } = await adminClient
        .from('payment_transactions')
        .select('id, status, amount_paise, currency')
        .eq('gateway_payment_id', String(cfPaymentId))
        .maybeSingle();

      if (existingTx) {
        transactionRecord = existingTx;
      } else {
        const { data: newTx, error: insertTxErr } = await adminClient
          .from('payment_transactions')
          .insert({
            order_id: orderRecord.id,
            tournament_id: tournament.id,
            user_id: orderRecord.user_id,
            gateway: 'cashfree',
            gateway_payment_id: String(cfPaymentId),
            gateway_signature: signature,
            razorpay_payment_id: null,
            razorpay_signature: null,
            amount_paise: paidAmountPaise,
            currency: paidCurrency,
            status: 'captured',
            payment_method: paymentData?.payment_group || 'cashfree_webhook',
            bank_reference: paymentData?.bank_reference || null,
            verified_at: new Date().toISOString(),
          })
          .select('id, status, amount_paise, currency')
          .single();

        if (insertTxErr || !newTx) {
          console.error('[Cashfree Webhook] Failed to record payment transaction in database:', insertTxErr);
          return NextResponse.json({ error: 'Database error recording payment transaction.' }, { status: 500 });
        }
        transactionRecord = newTx;
      }

      // Update payment_order to 'paid'
      await adminClient
        .from('payment_orders')
        .update({ status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', orderRecord.id);

      // Fetch player profile for participant creation
      const profile = await getPlayerProfile(adminClient, orderRecord.user_id);
      const username = (profile?.efootball_id || 'Player').trim();
      const realName = (profile?.display_name || username).trim();
      const contactInfo = (profile?.whatsapp_number || '').trim();

      // Invoke authoritative confirm_tournament_reservation RPC
      const { data: rpcRes, error: rpcErr } = await adminClient.rpc('confirm_tournament_reservation', {
        p_registration_id: registration.id,
        p_payment_transaction_id: transactionRecord.id,
        p_participant_id: null,
        p_username: username,
        p_real_name: realName,
        p_contact_info: contactInfo || null,
      });

      if (rpcErr) {
        console.error('[Cashfree Webhook] confirm_tournament_reservation RPC error:', rpcErr);
        return NextResponse.json({ error: 'Internal RPC error confirming reservation.' }, { status: 500 });
      }

      const confirmResult = Array.isArray(rpcRes) ? rpcRes[0] : rpcRes;

      if (!confirmResult || !confirmResult.success) {
        console.error('[Cashfree Webhook] Reservation confirmation was not successful:', confirmResult?.message);
        if (eventId) {
          await adminClient.from('payment_webhook_events').insert({
            event_id: eventId,
            event_type: eventType,
            payload: eventPayload,
            status: 'refund_queued',
          });
        }
        return NextResponse.json({
          success: false,
          message: confirmResult?.message || 'Payment recorded but confirmation rejected.',
          refundQueued: Boolean(confirmResult?.message?.includes('refund')),
        });
      }

      if (eventId) {
        await adminClient.from('payment_webhook_events').insert({
          event_id: eventId,
          event_type: eventType,
          payload: eventPayload,
          status: 'processed',
        });
      }

      return NextResponse.json({
        success: true,
        message: 'Cashfree payment captured and tournament registration confirmed successfully.',
        participantId: confirmResult.participant_id,
      });
    }

    if (eventType === 'PAYMENT_FAILED_WEBHOOK' || eventType === 'PAYMENT_USER_DROPPED_WEBHOOK') {
      if (orderId) {
        await adminClient
          .from('payment_orders')
          .update({
            status: 'failed',
            updated_at: new Date().toISOString(),
          })
          .eq('gateway_order_id', orderId)
          .eq('status', 'created');
      }

      if (eventId) {
        await adminClient.from('payment_webhook_events').insert({
          event_id: eventId,
          event_type: eventType,
          payload: eventPayload,
          status: 'processed_failed_event',
        });
      }

      return NextResponse.json({
        success: true,
        message: `${eventType} event processed and recorded.`,
      });
    }

    // Acknowledge unhandled event types gracefully
    if (eventId) {
      await adminClient.from('payment_webhook_events').insert({
        event_id: eventId,
        event_type: eventType,
        payload: eventPayload,
        status: 'ignored_event_type',
      });
    }

    return NextResponse.json({
      success: true,
      message: `Event ${eventType} received and acknowledged.`,
      ignored: true,
    });
  } catch (procErr: any) {
    console.error('[Cashfree Webhook] Unexpected error processing event:', procErr);
    return NextResponse.json({ error: 'Internal server error processing webhook event.' }, { status: 500 });
  }
}
