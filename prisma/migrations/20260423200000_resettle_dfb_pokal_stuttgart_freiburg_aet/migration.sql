-- One-shot data correction for DFB-Pokal VfB Stuttgart vs SC Freiburg (2026-04-23).
-- The match ended 1-1 in regulation and went to extra time where Stuttgart scored
-- (final 2-1 AET). ESPN reported status STATUS_FINAL_AET, which the score-fetch
-- cron didn't recognise as an extra-time status, so the event was settled as a
-- HOME win instead of a regulation-time DRAW.
--
-- This migration is guarded by espnEventId + "score is not a draw" so it's a
-- no-op on any database where the event doesn't exist or was already corrected.

DO $$
DECLARE
    v_event_id TEXT;
    v_rec RECORD;
    v_any_lost BOOLEAN;
    v_any_pending BOOLEAN;
    v_all_void BOOLEAN;
    v_has_void BOOLEAN;
    v_effective_odds DOUBLE PRECISION;
    v_effective_payout DOUBLE PRECISION;
BEGIN
    SELECT id INTO v_event_id
    FROM "Event"
    WHERE "espnEventId" = '401862314'
      AND status = 'COMPLETED'
      AND "homeScore" IS NOT NULL
      AND "awayScore" IS NOT NULL
      AND "homeScore" <> "awayScore";

    IF v_event_id IS NULL THEN
        RAISE NOTICE 'DFB-Pokal Stuttgart-Freiburg (ESPN 401862314) not in mis-settled state — skipping';
        RETURN;
    END IF;

    RAISE NOTICE 'Re-settling event % as 1-1 draw', v_event_id;

    -- 1. Reverse saldo for WON tickets (subtract prior payout)
    UPDATE "User" u
    SET "saldoGold" = u."saldoGold" - t."potentialPayout"
    FROM "Ticket" t
    WHERE t."userId" = u.id
      AND t.currency = 'GOLD'
      AND t.status = 'WON'
      AND EXISTS (SELECT 1 FROM "TicketSelection" ts WHERE ts."ticketId" = t.id AND ts."eventId" = v_event_id);

    UPDATE "User" u
    SET "saldoTibiaCoins" = u."saldoTibiaCoins" - t."potentialPayout"
    FROM "Ticket" t
    WHERE t."userId" = u.id
      AND t.currency = 'TIBIA_COINS'
      AND t.status = 'WON'
      AND EXISTS (SELECT 1 FROM "TicketSelection" ts WHERE ts."ticketId" = t.id AND ts."eventId" = v_event_id);

    -- 2. Reverse saldo for VOID tickets (subtract refunded stake)
    UPDATE "User" u
    SET "saldoGold" = u."saldoGold" - t.amount
    FROM "Ticket" t
    WHERE t."userId" = u.id
      AND t.currency = 'GOLD'
      AND t.status = 'VOID'
      AND EXISTS (SELECT 1 FROM "TicketSelection" ts WHERE ts."ticketId" = t.id AND ts."eventId" = v_event_id);

    UPDATE "User" u
    SET "saldoTibiaCoins" = u."saldoTibiaCoins" - t.amount
    FROM "Ticket" t
    WHERE t."userId" = u.id
      AND t.currency = 'TIBIA_COINS'
      AND t.status = 'VOID'
      AND EXISTS (SELECT 1 FROM "TicketSelection" ts WHERE ts."ticketId" = t.id AND ts."eventId" = v_event_id);

    -- 3. Reset tickets that touched this event back to PENDING.
    --    Restore totalOdds/potentialPayout to the product of all original selection odds
    --    (settleTicketSelections may have recomputed them for VOID legs).
    UPDATE "Ticket" t
    SET status = 'PENDING',
        "settledAt" = NULL,
        "totalOdds" = sub.prod,
        "potentialPayout" = t.amount * sub.prod
    FROM (
        SELECT ts."ticketId" AS tid, EXP(SUM(LN(ts.odds))) AS prod
        FROM "TicketSelection" ts
        GROUP BY ts."ticketId"
    ) sub
    WHERE t.id = sub.tid
      AND EXISTS (
          SELECT 1 FROM "TicketSelection" ts2
          WHERE ts2."ticketId" = t.id AND ts2."eventId" = v_event_id
      );

    -- 4. Reset this event's selections to PENDING
    UPDATE "TicketSelection" SET result = 'PENDING' WHERE "eventId" = v_event_id;

    -- 5. Reset PvP bets that had been settled by this event
    UPDATE "PvPBet"
    SET status = 'MATCHED', "settledAt" = NULL
    WHERE "eventId" = v_event_id
      AND status IN ('WON_CREATOR', 'WON_ACCEPTOR', 'VOID');

    -- 6. Force the event score to a regulation-time draw (1-1)
    UPDATE "Event"
    SET "homeScore" = 1, "awayScore" = 1
    WHERE id = v_event_id;

    -- 7. Re-settle selections on this event (result is a DRAW)
    UPDATE "TicketSelection"
    SET result = CASE
        WHEN pick IN ('DRAW', 'HOME_DRAW', 'AWAY_DRAW') THEN 'WON'
        ELSE 'LOST'
    END
    WHERE "eventId" = v_event_id AND result = 'PENDING';

    -- 8. Re-settle each affected ticket, mirroring settleTicketSelections logic:
    --    any LOST → LOST (no saldo change); all VOID → VOID (refund stake);
    --    all non-VOID WON → WON (credit payout, recompute odds if any VOID legs).
    FOR v_rec IN
        SELECT DISTINCT t.id AS ticket_id, t."userId", t.currency, t.amount
        FROM "Ticket" t
        JOIN "TicketSelection" ts ON ts."ticketId" = t.id
        WHERE ts."eventId" = v_event_id AND t.status = 'PENDING'
    LOOP
        SELECT bool_or(result = 'LOST'),
               bool_or(result = 'PENDING'),
               bool_and(result = 'VOID'),
               bool_or(result = 'VOID')
        INTO v_any_lost, v_any_pending, v_all_void, v_has_void
        FROM "TicketSelection" WHERE "ticketId" = v_rec.ticket_id;

        IF v_any_lost THEN
            UPDATE "Ticket" SET status = 'LOST', "settledAt" = NOW() WHERE id = v_rec.ticket_id;

        ELSIF NOT v_any_pending THEN
            IF v_all_void THEN
                UPDATE "Ticket" SET status = 'VOID', "settledAt" = NOW() WHERE id = v_rec.ticket_id;
                IF v_rec.currency = 'GOLD' THEN
                    UPDATE "User" SET "saldoGold" = "saldoGold" + v_rec.amount WHERE id = v_rec."userId";
                ELSE
                    UPDATE "User" SET "saldoTibiaCoins" = "saldoTibiaCoins" + v_rec.amount WHERE id = v_rec."userId";
                END IF;
            ELSE
                IF v_has_void THEN
                    SELECT COALESCE(EXP(SUM(LN(odds))), 1)
                    INTO v_effective_odds
                    FROM "TicketSelection"
                    WHERE "ticketId" = v_rec.ticket_id AND result = 'WON';
                ELSE
                    SELECT COALESCE(EXP(SUM(LN(odds))), 1)
                    INTO v_effective_odds
                    FROM "TicketSelection"
                    WHERE "ticketId" = v_rec.ticket_id;
                END IF;
                v_effective_payout := v_rec.amount * v_effective_odds;

                UPDATE "Ticket"
                SET status = 'WON',
                    "settledAt" = NOW(),
                    "totalOdds" = v_effective_odds,
                    "potentialPayout" = v_effective_payout
                WHERE id = v_rec.ticket_id;

                IF v_rec.currency = 'GOLD' THEN
                    UPDATE "User" SET "saldoGold" = "saldoGold" + v_effective_payout WHERE id = v_rec."userId";
                ELSE
                    UPDATE "User" SET "saldoTibiaCoins" = "saldoTibiaCoins" + v_effective_payout WHERE id = v_rec."userId";
                END IF;
            END IF;
        END IF;
        -- else: at least one selection still PENDING → ticket stays PENDING
    END LOOP;

    -- 9. Re-settle PvP bets that were MATCHED (now 1-1 draw).
    --    Legacy bets (no joinerPick) always resolve to creator-or-acceptor.
    --    Three-way bets (with joinerPick) can resolve to VOID if neither side picked draw.
    UPDATE "PvPBet"
    SET status = CASE
            WHEN pick IN ('DRAW', 'HOME_DRAW', 'AWAY_DRAW') THEN 'WON_CREATOR'::"PvPBetStatus"
            ELSE 'WON_ACCEPTOR'::"PvPBetStatus"
        END,
        "settledAt" = NOW()
    WHERE "eventId" = v_event_id
      AND status = 'MATCHED'
      AND "joinerPick" IS NULL;

    UPDATE "PvPBet"
    SET status = CASE
            WHEN pick IN ('DRAW', 'HOME_DRAW', 'AWAY_DRAW') THEN 'WON_CREATOR'::"PvPBetStatus"
            WHEN "joinerPick" IN ('DRAW', 'HOME_DRAW', 'AWAY_DRAW') THEN 'WON_ACCEPTOR'::"PvPBetStatus"
            ELSE 'VOID'::"PvPBetStatus"
        END,
        "settledAt" = NOW()
    WHERE "eventId" = v_event_id
      AND status = 'MATCHED'
      AND "joinerPick" IS NOT NULL;

    RAISE NOTICE 'DFB-Pokal Stuttgart-Freiburg re-settled';
END $$;
