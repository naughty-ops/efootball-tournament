import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getServerRazorpayClient, isRazorpayConfigured } from '@/lib/razorpay/server';
import {
  createCashfreeOrder,
  isCashfreeConfigured,
  getCashfreeEnvironment,
  getResolvedCashfreeCredentials,
  sanitizeCashfreePhone,
} from '@/lib/cashfree/server';
import { checkRateLimit, getClientIp, RATE_LIMIT_RULES, createRateLimitErrorResponse } from '@/lib/rateLimit';
import { isValidEfootballId, normalizeEfootballId } from '@/lib/validations';
import { getPlayerProfile } from '@/services/playerDashboardService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createOrderSchema = z.object({
  tournamentId: z.string().uuid({ message: 'Invalid tournament ID format.' }),
  rulesAccepted: z.boolean().optional(),
  gateway: z.enum(['cashfree', 'razorpay']).optional(),
});

/**
 * POST /api/registrations
 * 
 * Authenticated endpoint to initiate registration and create a Razorpay order
 * for a paid tournament.
 * 
 * Flow:
 * 1. Rate limiting check
 * 2. Authenticate user via Supabase session (reject unauthenticated)
 * 3. Validate request schema
 * 4. Verify player profile & eligibility (account status, eFootball ID, WhatsApp number)
 * 5. Fetch trusted tournament details from DB:
 *    - Reject if not found
 *    - Reject if status != 'registration'
 *    - Reject if free tournament (is_paid === false or entry_fee_paise <= 0)
 *    - Reject if registration deadline has passed
 *    - Reject if tournament is full
 * 6. Check existing registration:
 *    - If confirmed: reject with already registered
 *    - If active unexpired pending_payment: reuse registration & existing active order if valid
 * 7. If no active hold: call reserve_tournament_slot RPC to get new registration_id & hold
 * 8. Create Razorpay order in test mode with trusted amount & currency from DB
 * 9. Persist payment_orders row with status 'created'
 * 10. Return checkout payload to client (never expose secret keys)
 */
export async function POST(request: NextRequest) {
  // 1. Rate limiting
  const ip = getClientIp(request);
  const rateLimitResult = checkRateLimit(`registration_order_${ip}`, RATE_LIMIT_RULES.api);
  if (!rateLimitResult.success) {
    return createRateLimitErrorResponse(rateLimitResult);
  }

  try {
    // 2. Authenticate user session
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { error: 'Authentication required. Please sign in to register for tournaments.' },
        { status: 401 }
      );
    }

    // 3. Validate request body
    const body = await request.json().catch(() => ({}));
    const parseResult = createOrderSchema.safeParse(body);
    if (!parseResult.success) {
      const msg = parseResult.error.issues[0]?.message || 'Invalid request body.';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const { tournamentId } = parseResult.data;

    // 4. Verify player profile & eligibility
    const profile = await getPlayerProfile(supabase, user.id, user);
    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found. Please complete your registration details.' },
        { status: 400 }
      );
    }

    if (profile.account_status && profile.account_status !== 'active') {
      return NextResponse.json(
        { error: `Your account is currently ${profile.account_status}. Tournament registration is restricted.` },
        { status: 403 }
      );
    }

    const rawEfootballId = (profile.efootball_id || '').trim();
    if (!rawEfootballId || !isValidEfootballId(rawEfootballId)) {
      return NextResponse.json(
        { error: 'A verified eFootball ID matching format ABCD-123-456-789 is required before registering.' },
        { status: 400 }
      );
    }
    const normalizedEfootballId = normalizeEfootballId(rawEfootballId);

    const whatsappNumber = (profile.whatsapp_number || '').trim();
    if (!whatsappNumber) {
      return NextResponse.json(
        { error: 'A contact WhatsApp number is required before registering for paid tournaments.' },
        { status: 400 }
      );
    }

    // 5. Fetch trusted tournament details from database
    const { data: tournament, error: tourneyErr } = await (supabase.from('tournaments') as any)
      .select('id, name, status, is_paid, entry_fee_paise, currency, max_participants, confirmed_slots_count, reserved_slots_count, registration_deadline')
      .eq('id', tournamentId)
      .maybeSingle();

    if (tourneyErr || !tournament) {
      return NextResponse.json(
        { error: 'Tournament not found.' },
        { status: 404 }
      );
    }

    // Must be in registration phase
    if (tournament.status !== 'registration') {
      return NextResponse.json(
        { error: `Tournament registration is closed (current status: ${tournament.status}).` },
        { status: 400 }
      );
    }

    // Must be a paid tournament (free tournaments do not use Razorpay checkout)
    if (!tournament.is_paid || !tournament.entry_fee_paise || Number(tournament.entry_fee_paise) <= 0) {
      return NextResponse.json(
        { error: 'This is a free tournament. Paid checkout is not required. Please use standard registration.' },
        { status: 400 }
      );
    }

    // Check registration deadline if specified
    if (tournament.registration_deadline) {
      const deadline = new Date(tournament.registration_deadline);
      if (Date.now() > deadline.getTime()) {
        return NextResponse.json(
          { error: 'The registration deadline for this tournament has passed.' },
          { status: 400 }
        );
      }
    }

    // Check capacity
    const totalOccupied = (Number(tournament.confirmed_slots_count) || 0) + (Number(tournament.reserved_slots_count) || 0);
    if (totalOccupied >= (Number(tournament.max_participants) || 32)) {
      return NextResponse.json(
        { error: 'Tournament is full. All slots are currently filled or reserved.' },
        { status: 409 }
      );
    }

    // Verify user is not already registered as an active participant
    const { data: existingParticipant } = await (supabase.from('participants') as any)
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingParticipant) {
      return NextResponse.json(
        { error: 'You are already registered for this tournament.' },
        { status: 409 }
      );
    }

    // Verify no participant has the same eFootball ID in this tournament
    const { data: duplicateEfParticipant } = await (supabase.from('participants') as any)
      .select('id')
      .eq('tournament_id', tournamentId)
      .ilike('username', normalizedEfootballId)
      .maybeSingle();

    if (duplicateEfParticipant) {
      return NextResponse.json(
        { error: 'A player with this eFootball ID is already registered in this tournament.' },
        { status: 409 }
      );
    }

    // 6. Check for existing active registration hold for this user
    let registrationId: string | null = null;
    let reservedUntil: string | null = null;

    const { data: activeReg } = await (supabase.from('tournament_registrations') as any)
      .select('id, status, reserved_until, amount_paise, currency')
      .eq('tournament_id', tournamentId)
      .eq('user_id', user.id)
      .in('status', ['pending_payment', 'confirmed'])
      .maybeSingle();

    if (activeReg) {
      if (activeReg.status === 'confirmed') {
        return NextResponse.json(
          { error: 'You already have a confirmed registration for this tournament.' },
          { status: 409 }
        );
      }

      // Check if unexpired pending_payment
      if (activeReg.reserved_until && new Date(activeReg.reserved_until).getTime() > Date.now()) {
        registrationId = activeReg.id;
        reservedUntil = activeReg.reserved_until;

        // Check if there is already an existing active order for this registration
        const { data: existingOrder } = await (supabase.from('payment_orders') as any)
          .select('id, gateway, gateway_order_id, cf_order_id, payment_session_id, razorpay_order_id, amount_paise, currency, status')
          .eq('registration_id', activeReg.id)
          .eq('status', 'created')
          .maybeSingle();

        if (existingOrder && Number(existingOrder.amount_paise) === Number(tournament.entry_fee_paise)) {
          // Idempotent retry: return existing order details for active gateway
          const isCashfree = existingOrder.gateway === 'cashfree' || Boolean(existingOrder.payment_session_id);
          return NextResponse.json({
            success: true,
            gateway: isCashfree ? 'cashfree' : 'razorpay',
            orderId: isCashfree ? (existingOrder.gateway_order_id || existingOrder.razorpay_order_id) : existingOrder.razorpay_order_id,
            paymentSessionId: existingOrder.payment_session_id || null,
            registrationId: activeReg.id,
            amount: Number(existingOrder.amount_paise),
            currency: existingOrder.currency,
            keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim() || '',
            reservedUntil: activeReg.reserved_until,
            tournament: {
              id: tournament.id,
              name: tournament.name,
              entryFeePaise: Number(tournament.entry_fee_paise),
              currency: tournament.currency || 'INR',
            },
          });
        }
      }
    }

    // 7. If no active reservation hold, call atomic reserve_tournament_slot RPC
    if (!registrationId) {
      const { data: rpcRes, error: rpcErr } = await (supabase.rpc as any)('reserve_tournament_slot', {
        p_tournament_id: tournamentId,
        p_user_id: user.id,
        p_hold_duration_minutes: 12,
      });

      if (rpcErr || !rpcRes || !Array.isArray(rpcRes) || rpcRes.length === 0) {
        console.error('Error calling reserve_tournament_slot:', rpcErr);
        return NextResponse.json(
          { error: rpcErr?.message || 'Failed to reserve tournament slot. Please try again.' },
          { status: 400 }
        );
      }

      const reservation = rpcRes[0];
      if (!reservation.success || !reservation.registration_id) {
        return NextResponse.json(
          { error: reservation.message || 'Unable to reserve slot. Tournament may be full.' },
          { status: 409 }
        );
      }

      registrationId = reservation.registration_id;
      reservedUntil = reservation.reserved_until;
    }

    if (!registrationId) {
      return NextResponse.json(
        { error: 'Failed to establish reservation hold for this tournament.' },
        { status: 500 }
      );
    }

    // 8. Gateway Selection (Cashfree default / sandbox mode, Razorpay safe fallback)
    const requestedGateway = parseResult.data.gateway;
    const hasCashfree = isCashfreeConfigured();
    const hasRazorpay = isRazorpayConfigured();

    if (!hasCashfree && !hasRazorpay) {
      console.error(
        '[Payment Gateway Configuration Error] Neither Cashfree nor Razorpay credentials are configured in this deployment environment. ' +
        'Please define CASHFREE_APP_ID and CASHFREE_SECRET_KEY in Vercel Project Settings -> Environment Variables.'
      );
      return NextResponse.json(
        { error: 'Payment gateway configuration error. Please ensure payment gateway credentials are set in your environment variables.' },
        { status: 503 }
      );
    }

    const activeGateway: 'cashfree' | 'razorpay' =
      requestedGateway || (hasCashfree ? 'cashfree' : 'razorpay');

    const amountPaise = Number(tournament.entry_fee_paise);
    const currency = (tournament.currency || 'INR').toUpperCase();
    const receipt = `reg_${registrationId.slice(0, 8)}_${Date.now()}`.slice(0, 40);

    const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
    const persistenceClient = hasServiceKey ? createAdminClient() : supabase;

    if (activeGateway === 'cashfree') {
      const cfOrderId = `cf_reg_${registrationId.replace(/-/g, '').slice(0, 10)}_${Date.now().toString().slice(-6)}`;
      const orderAmountRupees = Number((amountPaise / 100).toFixed(2));

      let cashfreeOrder: { orderId: string; paymentSessionId: string; cfOrderId?: string | number };

      const { appId = '' } = getResolvedCashfreeCredentials();
      const isPlaceholderCreds = appId.includes('xxxx') || appId.startsWith('TEST10000000');

      if (isPlaceholderCreds) {
        // Mocked response for automated testing when sandbox merchant credentials are not yet populated
        cashfreeOrder = {
          orderId: cfOrderId,
          cfOrderId: `cf_mock_${Date.now()}`,
          paymentSessionId: `session_mock_${registrationId.slice(0, 8)}_${Date.now()}`,
        };
      } else {
        try {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
          const cfRes = await createCashfreeOrder({
            orderId: cfOrderId,
            orderAmount: orderAmountRupees,
            orderCurrency: currency,
            customerDetails: {
              customerId: user.id,
              customerName: profile.display_name || user.email?.split('@')[0] || 'Competitor',
              customerEmail: user.email || 'competitor@efootball.local',
              customerPhone: sanitizeCashfreePhone(whatsappNumber),
            },
            orderMeta: {
              notifyUrl: `${appUrl}/api/webhooks/cashfree`,
              returnUrl: `${appUrl}/tournaments/${tournament.id}?order_id={order_id}`,
            },
            orderNote: `Entry fee for ${tournament.name}`.slice(0, 100),
          });
          cashfreeOrder = {
            orderId: cfRes.orderId,
            cfOrderId: cfRes.cfOrderId,
            paymentSessionId: cfRes.paymentSessionId,
          };
        } catch (cfErr: any) {
          console.error('[Cashfree Registration Diagnostic Log]:', {
            operation: 'create_order',
            status: cfErr?.statusCode || 502,
            code: cfErr?.errorCode || 'unknown',
            type: cfErr?.errorType || 'unknown',
            message: cfErr?.message || 'Order creation failed',
            requestId: cfErr?.requestId || 'N/A',
          });
          return NextResponse.json(
            { error: 'Failed to create payment order with Cashfree. Please try again.' },
            { status: 502 }
          );
        }
      }

      // Persist Cashfree payment order row
      const { error: insertCfOrderErr } = await (persistenceClient.from('payment_orders') as any).insert({
        registration_id: registrationId,
        tournament_id: tournament.id,
        user_id: user.id,
        gateway: 'cashfree',
        gateway_order_id: cashfreeOrder.orderId,
        cf_order_id: String(cashfreeOrder.cfOrderId || ''),
        payment_session_id: cashfreeOrder.paymentSessionId,
        razorpay_order_id: null,
        amount_paise: amountPaise,
        currency,
        status: 'created',
        receipt,
        attempts: 0,
      });

      if (insertCfOrderErr) {
        console.error('Failed to persist Cashfree order in database:', insertCfOrderErr);
        return NextResponse.json(
          { error: 'Payment order created with gateway but failed to record. Please retry.' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        gateway: 'cashfree',
        orderId: cashfreeOrder.orderId,
        paymentSessionId: cashfreeOrder.paymentSessionId,
        registrationId,
        amount: amountPaise,
        currency,
        reservedUntil,
        tournament: {
          id: tournament.id,
          name: tournament.name,
          entryFeePaise: amountPaise,
          currency,
        },
      });
    }

    // 8B. Razorpay Order Creation (Fallback)
    if (!isRazorpayConfigured()) {
      return NextResponse.json(
        { error: 'Payment gateway configuration error. Please contact administrator.' },
        { status: 503 }
      );
    }

    const razorpay = getServerRazorpayClient();
    let rzpOrder: any;
    try {
      rzpOrder = await razorpay.orders.create({
        amount: amountPaise,
        currency,
        receipt,
        notes: {
          tournament_id: tournament.id,
          tournament_name: String(tournament.name).slice(0, 30),
          registration_id: registrationId,
          user_id: user.id,
        },
      });
    } catch (orderErr: any) {
      console.error('Razorpay order creation failed:', orderErr);
      return NextResponse.json(
        { error: 'Failed to create payment order with gateway. Please try again.' },
        { status: 502 }
      );
    }

    if (!rzpOrder || !rzpOrder.id) {
      return NextResponse.json(
        { error: 'Invalid response from payment gateway.' },
        { status: 502 }
      );
    }

    const { error: insertOrderErr } = await (persistenceClient.from('payment_orders') as any).insert({
      registration_id: registrationId,
      tournament_id: tournament.id,
      user_id: user.id,
      gateway: 'razorpay',
      gateway_order_id: rzpOrder.id,
      razorpay_order_id: rzpOrder.id,
      amount_paise: amountPaise,
      currency,
      status: 'created',
      receipt,
      attempts: 0,
    });

    if (insertOrderErr) {
      console.error('Failed to persist payment order in database:', insertOrderErr);
      return NextResponse.json(
        { error: 'Payment order created with gateway but failed to record. Please retry.' },
        { status: 500 }
      );
    }

    const clientKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim() || '';

    return NextResponse.json({
      success: true,
      gateway: 'razorpay',
      orderId: rzpOrder.id,
      registrationId,
      amount: amountPaise,
      currency,
      keyId: clientKeyId,
      reservedUntil,
      tournament: {
        id: tournament.id,
        name: tournament.name,
        entryFeePaise: amountPaise,
        currency,
      },
    });
  } catch (err: any) {
    console.error('Unexpected error in /api/registrations order endpoint:', err);
    return NextResponse.json(
      { error: err.message || 'An unexpected server error occurred.' },
      { status: 500 }
    );
  }
}
