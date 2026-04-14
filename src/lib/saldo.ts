import { Currency } from "@prisma/client";
import { prisma } from "./db";

export async function adjustSaldo(
  userId: string,
  currency: Currency,
  amount: number
) {
  const field =
    currency === Currency.GOLD ? "saldoGold" : "saldoTibiaCoins";
  await prisma.user.update({
    where: { id: userId },
    data: { [field]: { increment: amount } },
  });
}
