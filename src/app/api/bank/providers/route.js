// GET /api/bank/providers - Lista providers disponíveis

import { NextResponse } from 'next/server';
import { BankProviderFactory } from '../../../../providers/BankProviderFactory.js';

export async function GET() {
  try {
    const providers = BankProviderFactory.getAvailableProviders();
    const defaultProvider = BankProviderFactory.getDefaultProvider();

    return NextResponse.json({
      providers,
      defaultProvider,
    });
  } catch (err) {
    return NextResponse.json(
      { erro: err.message || 'Erro ao listar providers' },
      { status: 500 }
    );
  }
}
