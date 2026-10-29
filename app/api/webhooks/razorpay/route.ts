import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getServerRazorpayClient, verifyWebhookSignature } from '@/lib/razorpay/server';
import { getPlayerProfile } from '@/services/playerDashboardService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/razorpay
 * 
 * Production-ready Razorpay Webhook Handler
 * 
 * Responsibilities:
 * 1. Reads raw request body as binary/text — never parses or alters body before signature verification.
 * 2. Cryptographically verifies X-Razorpay-Signature using HMAC-SHA256 and RAZORPAY_WEBHOOK_SECRET.
 * 3. Enforces idempotency via public.payment_webhook_events(event_id UNIQUE).
 * 4. Processes:
 *    - payment.captured / order.paid: Reconciles payments, creates payment_transactions if missing,
 *      and invokes the authoritative confirm_tournament_reservation RPC.
 *    - payment.failed: Marks payment_orders as failed and records audit log.
 * 5. Handles out-of-order, duplicate, and late payments with full financial safety and refund queueing.
 * 6. Returns 200 OK for successfully processed or acknowledged duplicate events; returns 400/401
 *    for invalid signatures or malformed payloads; returns 500 for transient database/RPC errors
 *    so Razorpay's exponential retry mechanism kicks in.
 */
export async function POST(request: NextRequest) {
  // 1. Read raw body as string BEFORE any JSON parsing
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (readErr) {
    console.error('[Razorpay Webhook] Failed to read request body:', readErr);
    return NextResponse.json({ error: 'Failed to read request payload.' }, { status: 400 });
  }

  // 2. Validate X-Razorpay-Signature header
  const signature = request.headers.get('x-razorpay-signature');
  if (!signature) {
    console.error('[Razorpay Webhook] Missing X-Razorpay-Signature header.');
    return NextResponse.json({ error: 'Missing webhook signature header.' }, { status: 400 });
  }

  // 3. Cryptographically verify signature using server-only secret
  let isValidSignature = false;
  try {
    isValidSignature = verifyWebhookSignature({ rawBody, signature });
  } catch (configErr: any) {
    console.error('[Razorpay Webhook] Configuration error during verification:', configErr?.message);
    return NextResponse.json(
      { error: 'Webhook service configuration error. RAZORPAY_WEBHOOK_SECRET is not set.' },
      { status: 500 }
    );
  }

  if (!isValidSignature) {
    console.error('[Razorpay Webhook] Invalid webhook signature detected.');
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  }

  // 4. Safely parse payload JSON
  let eventPayload: any;
  try {
    eventPayload = JSON.parse(rawBody);
  } catch (parseErr) {
    console.error('[Razorpay Webhook] Malformed JSON payload received.');
    return NextResponse.json({ error: 'Malformed JSON payload.' }, { status: 400 });
  }

  const eventId: string | undefined = eventPayload?.event_id || eventPayload?.id;
  const eventType: string | undefined = eventPayload?.event;

  if (!eventType) {
    console.error('[Razorpay Webhook] Missing event type in payload.');
    return NextResponse.json({ error: 'Missing event type.' }, { status: 400 });
  }

  // 5. Establish privileged database connection
  // Webhooks arrive without a user session cookie and require the service-role client.
  let adminClient: any;
  try {
    adminClient = createAdminClient();
  } catch (clientErr: any) {
    console.error('[Razorpay Webhook] Service-role client error:', clientErr?.message);
    return NextResponse.json(
      { error: 'Internal database client configuration error.' },
      { status: 500 }
    );
  }

  // 6. Idempotency Check using public.payment_webhook_events(event_id)
  // If an event_id is supplied, check whether it has already been processed.
  if (eventId) {
    const { data: existingEvent, error: queryEventErr } = await adminClient
      .from('payment_webhook_events')
      .select('id, status, event_type')
      .eq('event_id', eventId)
      .maybeSingle();

    if (queryEventErr) {
      console.error('[Razorpay Webhook] Error checking event idempotency:', queryEventErr);
      return NextResponse.json(
        { error: 'Database error checking webhook idempotency.' },
        { status: 500 }
      );
    }

    if (existingEvent) {
      // Event already recorded and processed: return 200 OK immediately
      return NextResponse.json({
        success: true,
        message: `Webhook event ${eventId} has already been processed.`,
        idempotent: true,
      });
    }
  }

  // 7. Route and process supported event types
  try {
    if (eventType === 'payment.captured' || eventType === 'order.paid') {
      const paymentEntity = eventPayload?.payload?.payment?.entity;
      const orderEntity = eventPayload?.payload?.order?.entity;

      const paymentId = paymentEntity?.id;
      const orderId = paymentEntity?.order_id || orderEntity?.id;

      if (!orderId) {
        console.error('[Razorpay Webhook] Missing order_id in payment.captured payload.');
        return NextResponse.json({ error: 'Missing order_id in payload.' }, { status: 400 });
      }

      // Lookup platform payment order
      const { data: orderRecord, error: orderErr } = await adminClient
        .from('payment_orders')
        .select('id, registration_id, tournament_id, user_id, amount_paise, currency, status')
        .eq('razorpay_order_id', orderId)
        .maybeSingle();

      if (orderErr) {
        console.error('[Razorpay Webhook] Error retrieving payment_order:', orderErr);
        return NextResponse.json({ error: 'Database error retrieving payment order.' }, { status: 500 });
      }

      if (!orderRecord) {
        console.error('[Razorpay Webhook] Unknown order ID received:', orderId);
        // Return 404 so Razorpay doesn't blindly retry an order that does not belong to this platform
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
        console.error('[Razorpay Webhook] Associated tournament or registration not found for order:', orderId);
        return NextResponse.json({ error: 'Associated tournament or registration not found.' }, { status: 404 });
      }

      // Idempotency check: Already confirmed by checkout callback (Step 4)
      if (registration.status === 'confirmed') {
        // Record webhook event as processed
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

      // Reconcile and verify payment with Razorpay SDK
      let verifiedPayment: any = paymentEntity;
      if (!verifiedPayment || !paymentId) {
        try {
          const razorpay = getServerRazorpayClient();
          const orderPayments = await razorpay.orders.fetchPayments(orderId);
          const capturedPay = orderPayments.items?.find((p: any) => p.status === 'captured');
          if (capturedPay) {
            verifiedPayment = capturedPay;
          }
        } catch (fetchErr) {
          console.error('[Razorpay Webhook] Failed to fetch payments for order from gateway:', fetchErr);
          return NextResponse.json({ error: 'Failed to verify payment with gateway.' }, { status: 502 });
        }
      }

      if (!verifiedPayment || !verifiedPayment.id) {
        console.error('[Razorpay Webhook] No valid payment entity found for order:', orderId);
        return NextResponse.json({ error: 'Payment details could not be resolved from gateway.' }, { status: 400 });
      }

      const verifiedPaymentId = verifiedPayment.id;

      // Invariant: Status must be captured
      if (verifiedPayment.status !== 'captured') {
        console.warn(`[Razorpay Webhook] Payment ${verifiedPaymentId} status is ${verifiedPayment.status}; not captured.`);
        return NextResponse.json(
          { error: `Payment is not in captured status (current: ${verifiedPayment.status}).` },
          { status: 402 }
        );
      }

      // Invariant: Amount in paise must match trusted database records
      const expectedAmountPaise = Number(tournament.entry_fee_paise);
      const paidAmount = Number(verifiedPayment.amount);

      if (paidAmount !== expectedAmountPaise) {
        console.error(
          `[Razorpay Webhook] Amount mismatch: expected ${expectedAmountPaise} paise, got ${paidAmount}`
        );
        return NextResponse.json(
          { error: 'Payment amount mismatch. Transaction rejected.' },
          { status: 400 }
        );
      }

      // Invariant: Currency must match
      const expectedCurrency = (tournament.currency || 'INR').toUpperCase();
      const paidCurrency = String(verifiedPayment.currency || '').toUpperCase();

      if (paidCurrency !== expectedCurrency) {
        console.error(`[Razorpay Webhook] Currency mismatch: expected ${expectedCurrency}, got ${paidCurrency}`);
        return NextResponse.json(
          { error: 'Payment currency mismatch. Transaction rejected.' },
          { status: 400 }
        );
      }

      // Persist or retrieve payment_transactions record
      let transactionRecord: any = null;
      const { data: existingTx } = await adminClient
        .from('payment_transactions')
        .select('id, status, amount_paise, currency')
        .eq('razorpay_payment_id', verifiedPaymentId)
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
            razorpay_payment_id: verifiedPaymentId,
            razorpay_signature: signature,
            amount_paise: paidAmount,
            currency: paidCurrency,
            status: 'captured',
            payment_method: verifiedPayment.method || null,
            bank_reference: verifiedPayment.acquirer_data?.bank_transaction_id || verifiedPayment.acquirer_data?.rrn || null,
            verified_at: new Date().toISOString(),
          })
          .select('id, status, amount_paise, currency')
          .single();

        if (insertTxErr || !newTx) {
          console.error('[Razorpay Webhook] Failed to record payment transaction in database:', insertTxErr);
          return NextResponse.json({ error: 'Database error recording payment transaction.' }, { status: 500 });
        }
        transactionRecord = newTx;
      }

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
        console.error('[Razorpay Webhook] confirm_tournament_reservation RPC error:', rpcErr);
        return NextResponse.json({ error: 'Internal RPC error confirming reservation.' }, { status: 500 });
      }

      const confirmResult = Array.isArray(rpcRes) ? rpcRes[0] : rpcRes;

      if (!confirmResult || !confirmResult.success) {
        console.error('[Razorpay Webhook] Reservation confirmation was not successful:', confirmResult?.message);
        // If refund was queued (e.g. tournament full on late payment), record event and return 200
        // so Razorpay does not retry an unconfirmable order.
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

      // Record event in payment_webhook_events for future idempotency
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
        message: 'Payment captured and tournament registration confirmed successfully.',
        participantId: confirmResult.participant_id,
      });
    }

    if (eventType === 'payment.failed') {
      const paymentEntity = eventPayload?.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id;
      const paymentId = paymentEntity?.id;

      if (orderId) {
        // Mark payment order as failed
        await adminClient
          .from('payment_orders')
          .update({
            status: 'failed',
            updated_at: new Date().toISOString(),
          })
          .eq('razorpay_order_id', orderId)
          .eq('status', 'created');

        // Record failed transaction if payment ID exists
        if (paymentId) {
          const { data: orderRecord } = await adminClient
            .from('payment_orders')
            .select('id, tournament_id, user_id')
            .eq('razorpay_order_id', orderId)
            .maybeSingle();

          if (orderRecord) {
            await adminClient.from('payment_transactions').insert({
              order_id: orderRecord.id,
              tournament_id: orderRecord.tournament_id,
              user_id: orderRecord.user_id,
              razorpay_payment_id: paymentId,
              razorpay_signature: signature,
              amount_paise: Number(paymentEntity.amount || 0),
              currency: String(paymentEntity.currency || 'INR').toUpperCase(),
              status: 'failed',
              error_code: paymentEntity.error_code || null,
              error_description: paymentEntity.error_description || null,
              verified_at: new Date().toISOString(),
            });
          }
        }
      }

      // Record webhook event
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
        message: 'payment.failed event processed and recorded.',
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
    console.error('[Razorpay Webhook] Unexpected error processing event:', procErr);
    // Return 500 so Razorpay retries this event
    return NextResponse.json(
      { error: 'Internal server error processing webhook event.' },
      { status: 500 }
    );
  }
}
